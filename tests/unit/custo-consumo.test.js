'use strict';

// Consumo do projeto com valor em US$ (change consumo-de-tokens-com-valor): cálculo pela tabela de
// preços, relatório por modelo/etapa/dia, conciliação com o gasto registrado e gravação em uso.json.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { valorDoConsumo, relatorioDeConsumo } = require('../../custo');
const { criarGovernanca } = require('../../orcamento');

const PRECOS = {
  vigencia: '2026-10-25',
  moeda: 'USD',
  buscaWebPorChamadaUsd: 0.01,
  buscaWebBlocoTokensMini: 8000,
  buscaWebBlocoTokensMiniSomar: false,
  porMilhaoDeTokens: {
    'gpt-4o': { entrada: 2.5, entradaEmCache: 1.25, saida: 10 },
    'gpt-4o-mini': { entrada: 0.15, entradaEmCache: 0.075, saida: 0.6 }
  }
};
const C = (extra = {}) => ({ chamadas: 1, tokensEntrada: 0, tokensEntradaEmCache: 0, tokensSaida: 0, buscasWeb: 0, ...extra });

describe('valorDoConsumo', () => {
  test('tokens × tarifa, com os tokens em cache pela tarifa de cache (exemplo da spec)', () => {
    const v = valorDoConsumo(C({ tokensEntrada: 100_000, tokensEntradaEmCache: 30_000, tokensSaida: 10_000 }), 'gpt-4o', PRECOS);
    expect(v.tokensUsd).toBeCloseTo(0.3125, 10);
    expect(v.buscaUsd).toBe(0);
    expect(v.totalUsd).toBeCloseTo(0.3125, 10);
  });

  test('sem tarifa de cache, os tokens em cache saem pela tarifa de entrada', () => {
    const precos = { porMilhaoDeTokens: { 'gpt-x': { entrada: 2, saida: 8 } } };
    const v = valorDoConsumo(C({ tokensEntrada: 1_000_000, tokensEntradaEmCache: 400_000 }), 'gpt-x', precos);
    expect(v.tokensUsd).toBeCloseTo(2, 10);
  });

  test('busca web: chamadas × tarifa por chamada, separada dos tokens', () => {
    const v = valorDoConsumo(C({ buscasWeb: 31 }), 'gpt-4o', PRECOS);
    expect(v.buscaUsd).toBeCloseTo(0.31, 10);
    expect(v.tokensUsd).toBe(0);
  });

  test('bloco fixo do mini só entra quando buscaWebBlocoTokensMiniSomar é true', () => {
    const c = C({ buscasWeb: 2 });
    expect(valorDoConsumo(c, 'gpt-4o-mini', PRECOS).buscaUsd).toBeCloseTo(0.02, 10);
    const ligado = { ...PRECOS, buscaWebBlocoTokensMiniSomar: true };
    // 2 × (0,01 + 8.000 tokens × US$ 0,15 / 1M)
    expect(valorDoConsumo(c, 'gpt-4o-mini', ligado).buscaUsd).toBeCloseTo(2 * (0.01 + 0.0012), 10);
    expect(valorDoConsumo(c, 'gpt-4o', ligado).buscaUsd).toBeCloseTo(0.02, 10);
  });

  test('modelo sem preço devolve null', () => {
    expect(valorDoConsumo(C({ tokensEntrada: 10 }), 'modelo-fantasia', PRECOS)).toBeNull();
  });
});

describe('relatorioDeConsumo', () => {
  const consumo = {
    porEtapa: {
      pesquisa: { 'gpt-4o-mini': C({ chamadas: 4, tokensEntrada: 40_000, tokensSaida: 4_000, buscasWeb: 4 }) },
      conteudo: {
        'gpt-4o': C({ chamadas: 3, tokensEntrada: 100_000, tokensEntradaEmCache: 30_000, tokensSaida: 10_000 }),
        'gpt-4o-mini': C({ chamadas: 2, tokensEntrada: 10_000, tokensSaida: 2_000 })
      }
    },
    porDia: {
      '2026-10-26': {
        'gpt-4o-mini': C({ chamadas: 4, tokensEntrada: 40_000, tokensSaida: 4_000, buscasWeb: 4 }),
        'gpt-4o': C({ chamadas: 1, tokensEntrada: 50_000, tokensEntradaEmCache: 10_000, tokensSaida: 5_000 })
      },
      '2026-10-27': {
        'gpt-4o': C({ chamadas: 2, tokensEntrada: 50_000, tokensEntradaEmCache: 20_000, tokensSaida: 5_000 }),
        'gpt-4o-mini': C({ chamadas: 2, tokensEntrada: 10_000, tokensSaida: 2_000 })
      }
    }
  };
  const gpt4o = 0.3125;
  const mini = (40_000 * 0.15 + 4_000 * 0.6) / 1e6 + (10_000 * 0.15 + 2_000 * 0.6) / 1e6; // pesquisa + conteúdo
  const busca = 4 * 0.01;

  test('uma linha por modelo, somando as etapas, com a tarifa usada', () => {
    const r = relatorioDeConsumo({ consumo, registrado: { modelos: {} } }, PRECOS);
    const porNome = Object.fromEntries(r.modelos.map(m => [m.modelo, m]));
    expect(porNome['gpt-4o'].tokens).toEqual({ entrada: 100_000, entradaEmCache: 30_000, saida: 10_000 });
    expect(porNome['gpt-4o'].tarifa).toEqual({ entrada: 2.5, entradaEmCache: 1.25, saida: 10 });
    expect(porNome['gpt-4o'].valorUsd).toBeCloseTo(gpt4o, 6);
    expect(porNome['gpt-4o-mini'].chamadas).toBe(6);
    expect(porNome['gpt-4o-mini'].valorUsd).toBeCloseTo(mini, 6);
    expect(r.moeda).toBe('USD');
    expect(r.vigenciaPrecos).toBe('2026-10-25');
  });

  test('busca web em linha própria e somada ao total', () => {
    const r = relatorioDeConsumo({ consumo, registrado: { modelos: {} } }, PRECOS);
    expect(r.buscaWeb).toEqual({ chamadas: 4, tarifaPorChamadaUsd: 0.01, valorUsd: busca });
    expect(r.totalUsd).toBeCloseTo(gpt4o + mini + busca, 6);
  });

  test('a soma das etapas e a soma dos dias são iguais ao total do projeto', () => {
    const r = relatorioDeConsumo({ consumo, registrado: { modelos: {} } }, PRECOS);
    const soma = (o) => Object.values(o).reduce((s, v) => s + v.valorUsd, 0);
    expect(soma(r.porEtapa)).toBeCloseTo(r.totalUsd, 6);
    expect(soma(r.porDia)).toBeCloseTo(r.totalUsd, 6);
    expect(r.porEtapa.conteudo.tokens.entradaEmCache).toBe(30_000);
    expect(Object.keys(r.porDia)).toEqual(['2026-10-26', '2026-10-27']);
  });

  test('modelo sem preço: tokens aparecem, valor nulo, fora do total e listado em semPreco', () => {
    const c = { porEtapa: { conteudo: { 'gpt-4o': C({ tokensEntrada: 1_000_000 }), 'modelo-fantasia': C({ tokensEntrada: 5_000, buscasWeb: 3 }) } }, porDia: {} };
    const r = relatorioDeConsumo({ consumo: c, registrado: { modelos: {} } }, PRECOS);
    const sem = r.modelos.find(m => m.modelo === 'modelo-fantasia');
    expect(sem.valorUsd).toBeNull();
    expect(sem.tarifa).toBeNull();
    expect(sem.tokens.entrada).toBe(5_000);
    expect(r.semPreco).toEqual(['modelo-fantasia']);
    expect(r.totalUsd).toBeCloseTo(2.5, 6); // só o gpt-4o; as buscas do modelo sem preço não entram
    expect(r.buscaWeb.chamadas).toBe(0);
  });

  test('conciliação: valores iguais não divergem', () => {
    const total = gpt4o + mini + busca;
    const r = relatorioDeConsumo({ consumo, registrado: { modelos: { 'gpt-4o': { usd: total, chamadas: 9 } } } }, PRECOS);
    expect(r.registradoUsd).toBeCloseTo(total, 6);
    expect(r.diferencaUsd).toBeCloseTo(0, 6);
    expect(r.divergente).toBe(false);
    expect(r.parcial).toBe(false);
  });

  test('conciliação: preço mudou depois da geração marca divergente e dá a diferença', () => {
    const c = { porEtapa: { conteudo: { 'gpt-4o': C({ chamadas: 5, tokensEntrada: 400_000 }) } }, porDia: {} }; // US$ 1,00 na tabela
    const antigo = { modelos: { 'gpt-4o': { usd: 0.7, chamadas: 5 } } };
    const r = relatorioDeConsumo({ consumo: c, registrado: antigo }, PRECOS);
    expect(r.totalUsd).toBeCloseTo(1, 6);
    expect(r.registradoUsd).toBeCloseTo(0.7, 6);
    expect(r.diferencaUsd).toBeCloseTo(0.3, 6);
    expect(r.divergente).toBe(true);
  });

  test('projeto anterior à change: parcial, sem divergência e com o gasto não detalhado', () => {
    const r = relatorioDeConsumo({ consumo: { porEtapa: {}, porDia: {} }, registrado: { modelos: { 'gpt-4o': { usd: 0.4, chamadas: 40 } } } }, PRECOS);
    expect(r.parcial).toBe(true);
    expect(r.divergente).toBe(false);
    expect(r.modelos).toEqual([]);
    expect(r.totalUsd).toBe(0);
    expect(r.naoDetalhadoUsd).toBeCloseTo(0.4, 6);
  });

  test('sem consumo nenhum: relatório vazio e sem erro', () => {
    const r = relatorioDeConsumo({ consumo: { porEtapa: {}, porDia: {} }, registrado: { modelos: {} } }, PRECOS);
    expect(r).toMatchObject({ modelos: [], totalUsd: 0, parcial: false, divergente: false, semPreco: [] });
    expect(relatorioDeConsumo({}, PRECOS).totalUsd).toBe(0);
  });
});

describe('gravação do consumo em uso.json', () => {
  let dir;
  const novo = () => criarGovernanca({
    courseScrDir: (sess) => (sess.config?.nome ? path.join(dir, 'scr') : null),
    logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
    env: { USO_DIARIO_FILE: path.join(dir, 'uso-diario.json') },
    arquivoDiarioPadrao: path.join(dir, 'uso-diario-padrao.json'),
    agora: () => new Date(2026, 9, 27, 12, 0, 0)
  });
  const sessao = () => ({ config: { nome: 'Curso Teste' }, custoProjetoUsd: 0 });
  const arquivo = () => path.join(dir, 'scr', 'uso.json');
  const lido = () => JSON.parse(fs.readFileSync(arquivo(), 'utf-8'));

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consumo-valor-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('cada chamada soma tokens, cache e buscas por etapa e por dia, sem gravar US$ em consumo', () => {
    const G = novo();
    const sess = sessao();
    G.depois(sess, 'conteudo', null, { modelo: 'gpt-4o', custoUsd: 0.05, usage: { prompt_tokens: 10_000, completion_tokens: 2_000, prompt_tokens_details: { cached_tokens: 4_000 } } });
    G.depois(sess, 'conteudo', null, { modelo: 'gpt-4o', custoUsd: 0.02, usage: { prompt_tokens: 5_000, completion_tokens: 1_000 } });
    G.depois(sess, 'pesquisa', null, { modelo: 'gpt-4o-mini', custoUsd: 0.03, tarifaUsd: 0.02, buscasWeb: 2, usage: { prompt_tokens: 8_000, completion_tokens: 500, cached_tokens: 0 } });

    const { consumo } = lido();
    expect(consumo.porEtapa.conteudo['gpt-4o']).toEqual({ chamadas: 2, tokensEntrada: 15_000, tokensEntradaEmCache: 4_000, tokensSaida: 3_000, buscasWeb: 0 });
    expect(consumo.porEtapa.pesquisa['gpt-4o-mini']).toMatchObject({ chamadas: 1, buscasWeb: 2 });
    expect(consumo.porDia['2026-10-27']['gpt-4o'].chamadas).toBe(2);
    expect(JSON.stringify(consumo)).not.toMatch(/usd/i);
  });

  test('modelo sem preço (custoUsd nulo) ainda registra os tokens', () => {
    const G = novo();
    const sess = sessao();
    G.depois(sess, 'conteudo', null, { modelo: 'modelo-fantasia', custoUsd: null, usage: { prompt_tokens: 700, completion_tokens: 70 } });
    expect(lido().consumo.porEtapa.conteudo['modelo-fantasia']).toMatchObject({ chamadas: 1, tokensEntrada: 700, tokensSaida: 70 });
    expect(G.usoDe(sess).modelos['modelo-fantasia']).toBeUndefined(); // o gasto continua sem ele
  });

  test('chamada com erro e sem usage não grava consumo', () => {
    const G = novo();
    const sess = sessao();
    G.depois(sess, 'conteudo', null, { modelo: 'gpt-4o', custoUsd: undefined, usage: undefined, erro: true });
    expect(G.consumoDe(sess).consumo).toEqual({ porEtapa: {}, porDia: {} });
  });

  test('uso.json antigo, sem consumo (ou com consumo inválido), abre com consumo vazio e preserva o gasto', () => {
    fs.mkdirSync(path.dirname(arquivo()), { recursive: true });
    fs.writeFileSync(arquivo(), JSON.stringify({ versao: 1, modelos: { 'gpt-4o': { usd: 0.4, chamadas: 3, tokensEntrada: 1, tokensSaida: 1 } } }));
    const G = novo();
    const sess = sessao();
    G.carregarUso(sess);
    expect(G.consumoDe(sess).consumo).toEqual({ porEtapa: {}, porDia: {} });
    expect(G.consumoDe(sess).registrado.modelos['gpt-4o'].usd).toBe(0.4);

    fs.writeFileSync(arquivo(), JSON.stringify({ versao: 1, consumo: 'quebrado' }));
    const G2 = novo();
    const sess2 = sessao();
    G2.carregarUso(sess2);
    expect(G2.consumoDe(sess2).consumo).toEqual({ porEtapa: {}, porDia: {} });
  });

  test('o consumo gravado volta ao reabrir o projeto', () => {
    const G = novo();
    G.depois(sessao(), 'conteudo', null, { modelo: 'gpt-4o', custoUsd: 0.01, usage: { prompt_tokens: 100, completion_tokens: 10 } });
    const G2 = novo();
    const reaberta = sessao();
    G2.carregarUso(reaberta);
    expect(G2.consumoDe(reaberta).consumo.porEtapa.conteudo['gpt-4o'].tokensEntrada).toBe(100);
  });
});
