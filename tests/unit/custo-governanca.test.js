'use strict';

// custo.js e observabilidade.js na governança de custo (change governanca-de-custo):
// teto do projeto com sinônimo, estimativa calibrada, tarifa fixa da busca web.
const custo = require('../../custo');
const { criarObservabilidade } = require('../../observabilidade');

const PRECOS = { porMilhaoDeTokens: { 'gpt-4o': { entrada: 2.5, saida: 10 }, 'gpt-4o-mini': { entrada: 0.15, saida: 0.6 } } };

describe('lerOrcamento', () => {
  test('ORCAMENTO_MAX_USD vale; ORCAMENTO_USD continua como sinônimo; MAX vence', () => {
    expect(custo.lerOrcamento({ ORCAMENTO_MAX_USD: '5' })).toBe(5);
    expect(custo.lerOrcamento({ ORCAMENTO_USD: '3' })).toBe(3);
    expect(custo.lerOrcamento({ ORCAMENTO_MAX_USD: '5', ORCAMENTO_USD: '3' })).toBe(5);
  });
  test('vazio, zero, negativo ou texto não são teto', () => {
    for (const v of ['', '0', '-1', 'abc']) expect(custo.lerOrcamento({ ORCAMENTO_MAX_USD: v })).toBeNull();
    expect(custo.lerOrcamento({})).toBeNull();
  });
});

describe('estimarEtapa com calibração', () => {
  const base = custo.estimarEtapa('conteudo', { unidades: 2, modelos: { economia: 'gpt-4o-mini' }, precos: PRECOS });
  test('o fator multiplica o custo e é informado; os tokens ficam como estão', () => {
    const calibrada = custo.estimarEtapa('conteudo', { unidades: 2, modelos: { economia: 'gpt-4o-mini' }, precos: PRECOS, fator: 1.5 });
    expect(calibrada.custoUsd.esperado).toBeCloseTo(base.custoUsd.esperado * 1.5, 3);
    expect(calibrada.custoUsd.maximo).toBeCloseTo(base.custoUsd.maximo * 1.5, 3);
    expect(calibrada.fatorCalibracao).toBe(1.5);
    expect(calibrada.tokens).toEqual(base.tokens);
    expect(calibrada.estimativa).toBe(true);
  });
  test('fator inválido é ignorado (1)', () => {
    for (const f of [0, -2, NaN, 'x']) {
      expect(custo.estimarEtapa('conteudo', { unidades: 2, modelos: { economia: 'gpt-4o-mini' }, precos: PRECOS, fator: f }).fatorCalibracao).toBe(1);
    }
  });
});

describe('tarifa da busca web', () => {
  test('lê buscaWebPorChamadaUsd; ausente, zero, negativa ou inválida valem 0', () => {
    expect(custo.tarifaBuscaWeb({ buscaWebPorChamadaUsd: 0.01 })).toBe(0.01);
    for (const v of [undefined, 0, -1, 'x', null]) expect(custo.tarifaBuscaWeb({ buscaWebPorChamadaUsd: v })).toBe(0);
  });

  test('o arquivo de preços traz a tarifa da busca web (US$ 10 por 1.000 chamadas)', () => {
    const arquivo = require('../../config/precos-modelos.json');
    expect(arquivo.buscaWebPorChamadaUsd).toBe(0.01);
    expect(arquivo.observacao).toMatch(/subestimado/);
  });

  function gerar(tarifaUsd) {
    const obs = criarObservabilidade({ env: {}, fetchImpl: jest.fn(), logger: { warn() {} }, precos: PRECOS });
    const ctx = obs.criarContexto({ etapa: 'search' });
    return obs.executar(ctx, () => obs.registrarGeneration({
      nome: 'pesquisa.web', modelo: 'gpt-4o', usage: { prompt_tokens: 1000, completion_tokens: 1000, total_tokens: 2000 },
      finishReason: 'stop', inicio: Date.now(), tarifaUsd
    }));
  }

  test('a tarifa é somada ao custo dos tokens e aparece no resumo (mesmo número no painel e no Langfuse)', () => {
    const sem = gerar(0);
    const com = gerar(0.04);
    expect(sem.custoUsd).toBeCloseTo(0.0125, 6);
    expect(com.custoUsd).toBeCloseTo(0.0125 + 0.04, 6);
    expect(com.tarifaUsd).toBe(0.04);
    expect(sem.tarifaUsd).toBe(0);
  });

  test('modelo sem preço continua sem custo (a tarifa sozinha não inventa um valor)', () => {
    const obs = criarObservabilidade({ env: {}, fetchImpl: jest.fn(), logger: { warn() {} }, precos: PRECOS });
    const ctx = obs.criarContexto({ etapa: 'search' });
    const r = obs.executar(ctx, () => obs.registrarGeneration({
      nome: 'x', modelo: 'modelo-sem-preco', usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, inicio: Date.now(), tarifaUsd: 0.04
    }));
    expect(r.custoUsd).toBeNull();
  });

  test('o servidor soma a tarifa por chamada de busca (web_search_call) nas respostas da Responses API', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf-8');
    expect(src).toMatch(/item\.type === 'web_search_call'/);
    expect(src).toMatch(/tarifaUsd: buscas \* custo\.tarifaBuscaWeb\(\)/);
  });
});

describe('estimativa × custo real da linha de base (critério de saída: erro até 25% por etapa)', () => {
  // Atenção: os perfis de estimativa foram calibrados com esta mesma linha de base (curso `capcut`,
  // a única de referência; a segunda foi descartada), então o teste protege contra regressão da
  // calibração, não valida generalização para cursos muito diferentes.
  const fs = require('fs');
  const path = require('path');
  const log = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'baseline', 'capcut', 'geracao_log.json'), 'utf-8'));
  const real = {};
  for (const l of Array.isArray(log) ? log : log.chamadas || []) real[l.etapa] = (real[l.etapa] || 0) + (l.custoUsd || 0);
  const ROTA = { 'pesquisa-modulos': 'pesquisa-modulos', conteudo: 'conteudo', revisao: 'revisao-qualidade' };

  test.each(Object.keys(ROTA))('%s: custo esperado a até 25%% do real e custo real dentro da faixa', (etapa) => {
    const est = custo.estimarEtapa(etapa, { unidades: 3, modelos: { pesquisa: 'gpt-4o', economia: 'gpt-4o-mini' } });
    const r = real[ROTA[etapa]];
    expect(r).toBeGreaterThan(0);
    expect(Math.abs(est.custoUsd.esperado - r) / r).toBeLessThanOrEqual(0.25);
    expect(r).toBeGreaterThanOrEqual(est.custoUsd.minimo);
    expect(r).toBeLessThanOrEqual(est.custoUsd.maximo);
  });
});
