'use strict';

// Governança de custo (change governanca-de-custo): tetos, reserva e acerto, alerta, pausa,
// persistência, calibração, perfis, degradação, juiz em cascata e gatilhos do disjuntor.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarGovernanca, validarModelos, usoVazio } = require('../../orcamento');

const PARAMS = { model: 'gpt-4o', messages: [{ role: 'user', content: 'x'.repeat(4000) }], max_tokens: 2000 };
// ≈ (1000 tokens de entrada × 2,5 + 1000 de saída × 10) / 1e6 = US$ 0,0125; com a margem de 15%: 0,014375.
const CUSTO_BASE = 0.0125;

let dir;
let eventos;
let logger;

function novo({ env = {}, agora } = {}) {
  eventos = [];
  logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };
  const G = criarGovernanca({
    courseScrDir: (sess) => (sess.config?.nome ? path.join(dir, 'scr') : null),
    emitir: (e) => eventos.push(e),
    logger,
    env: { USO_DIARIO_FILE: path.join(dir, 'uso-diario.json'), ...env },
    agora: agora || (() => new Date(2026, 9, 25, 12, 0, 0)),
    arquivoDiarioPadrao: path.join(dir, 'uso-diario-padrao.json')
  });
  return G;
}
const sessao = (extra = {}) => ({ config: { nome: 'Curso Teste' }, custoProjetoUsd: 0, ...extra });

// Simula o que o servidor faz: o custo entra em sess.custoProjetoUsd e depois a chamada é acertada.
function chamar(G, sess, etapa = 'conteudo', custoReal = CUSTO_BASE, modelo = 'gpt-4o') {
  const reserva = G.antes(sess, etapa, PARAMS);
  sess.custoProjetoUsd += custoReal;
  G.depois(sess, etapa, reserva, { modelo, custoUsd: custoReal, usage: { prompt_tokens: 1000, completion_tokens: 1000 } });
  return reserva;
}

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orcamento-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('tetos por escopo', () => {
  test('sem nenhum teto: nada é reservado, barrado ou alertado', () => {
    const G = novo();
    const sess = sessao({ custoProjetoUsd: 999 });
    const r = G.antes(sess, 'conteudo', PARAMS);
    expect(r.token).toBeNull();
    expect(G.ativo(sess)).toBe(false);
    G.depois(sess, 'conteudo', r, { modelo: 'gpt-4o', custoUsd: 1 });
    expect(eventos).toEqual([]);
  });

  test('teto do projeto barra a chamada que o ultrapassaria, antes de ser feita', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao({ custoProjetoUsd: 4.99 });
    expect(() => G.antes(sess, 'conteudo', PARAMS)).toThrow(/Orçamento do projeto atingido/);
    try { G.antes(sess, 'conteudo', PARAMS); } catch (err) {
      expect(err.code).toBe('ORCAMENTO_EXCEDIDO');
      expect(err.message).toMatch(/ORCAMENTO_MAX_USD/);
    }
  });

  test('teto da etapa só vale para a etapa que o estourou', () => {
    const G = novo({ env: { ORCAMENTO_ETAPA_MAX_USD: '1' } });
    const sess = sessao();
    G.usoDe(sess).etapas.conteudo = { usd: 0.995, chamadas: 5 };
    expect(() => G.antes(sess, 'conteudo', PARAMS)).toThrow(/da etapa/);
    expect(() => G.antes(sess, 'revisao-qualidade', PARAMS)).not.toThrow();
  });

  test('ORCAMENTO_USD continua como sinônimo, com um aviso de depreciação único', () => {
    const G = novo({ env: { ORCAMENTO_USD: '5' } });
    const sess = sessao();
    expect(G._tetosDe(sess).projeto).toBe(5);
    G._tetosDe(sess);
    const avisos = logger.warn.mock.calls.filter(([m]) => /substituída por ORCAMENTO_MAX_USD/.test(m));
    expect(avisos).toHaveLength(1);
  });

  test('ORCAMENTO_MAX_USD vence ORCAMENTO_USD', () => {
    const G = novo({ env: { ORCAMENTO_USD: '5', ORCAMENTO_MAX_USD: '9' } });
    expect(G._tetosDe(sessao()).projeto).toBe(9);
  });

  test('valores inválidos viram "sem teto" com aviso', () => {
    const G = novo({ env: { ORCAMENTO_DIA_MAX_USD: 'abc', ORCAMENTO_MAX_USD: '-3', ORCAMENTO_ETAPA_MAX_USD: '0' } });
    const t = G._tetosDe(sessao());
    expect(t.dia).toBeNull();
    expect(t.projeto).toBeNull();
    expect(t.etapa).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  test('teto ajustado pelo usuário (uso.json) vence o ambiente', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao();
    G.ajustar(sess, { tetos: { projeto: 20 } });
    expect(G._tetosDe(sess).projeto).toBe(20);
  });
});

describe('reserva antes e acerto depois', () => {
  test('chamadas concorrentes dividem o saldo (cada uma reserva a sua parte)', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '0.03' } });
    const sess = sessao();
    const a = G.antes(sess, 'conteudo', PARAMS);
    const b = G.antes(sess, 'conteudo', PARAMS);
    expect(a.token && b.token).toBeTruthy();
    expect(() => G.antes(sess, 'conteudo', PARAMS)).toThrow(/Orçamento/);
    G.depois(sess, 'conteudo', a, { erro: true }); // a falhou: devolve a reserva
    expect(() => G.antes(sess, 'conteudo', PARAMS)).not.toThrow();
  });

  test('a reserva usa o estimado com a margem de segurança (15% por padrão)', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const r = G.antes(sessao(), 'conteudo', PARAMS);
    expect(r.base).toBeCloseTo(CUSTO_BASE, 3); // a estimativa também conta o JSON das mensagens
    expect(r.valor).toBeCloseTo(r.base * 1.15, 8);
    const G2 = novo({ env: { ORCAMENTO_MAX_USD: '5', ORCAMENTO_MARGEM_PCT: '0' } });
    const r2 = G2.antes(sessao(), 'conteudo', PARAMS);
    expect(r2.valor).toBeCloseTo(r2.base, 8);
  });

  test('o acerto troca a reserva pelo custo real e contabiliza por dia, etapa e modelo', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao();
    chamar(G, sess, 'conteudo', 0.01);
    expect(G._reservas.size).toBe(0);
    const uso = G.usoDe(sess);
    expect(uso.etapas.conteudo).toEqual({ usd: 0.01, chamadas: 1 });
    expect(uso.modelos['gpt-4o']).toMatchObject({ usd: 0.01, chamadas: 1, tokensEntrada: 1000, tokensSaida: 1000 });
    expect(Object.values(uso.dias)[0].usd).toBe(0.01);
  });

  test('falha libera a reserva e não altera o gasto', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao();
    const r = G.antes(sess, 'conteudo', PARAMS);
    expect(G._reservas.size).toBe(1);
    G.depois(sess, 'conteudo', r, { erro: true });
    expect(G._reservas.size).toBe(0);
    expect(G.usoDe(sess).etapas.conteudo).toBeUndefined();
  });

  test('custo acima da reserva: o gasto reflete o real e a chamada seguinte já é barrada', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '0.05', ORCAMENTO_MARGEM_PCT: '0' } });
    const sess = sessao();
    chamar(G, sess, 'conteudo', 0.045); // reservou 0,0125 e gastou 0,045
    expect(sess.custoProjetoUsd).toBeCloseTo(0.045, 6);
    expect(() => G.antes(sess, 'conteudo', PARAMS)).toThrow(/Orçamento/);
  });

  test('reserva esquecida (stream abandonado) expira e deixa de contar', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '0.03' } });
    const sess = sessao();
    const a = G.antes(sess, 'conteudo', PARAMS);
    G.antes(sess, 'conteudo', PARAMS);
    a.token.criadaEm = Date.now() - 16 * 60_000;
    expect(() => G.antes(sess, 'conteudo', PARAMS)).not.toThrow();
  });
});

describe('alerta e pausa', () => {
  test('alerta uma única vez ao passar de 80% do teto e rearma quando o teto muda', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '1' } });
    const sess = sessao({ custoProjetoUsd: 0.79 });
    chamar(G, sess, 'conteudo', 0.02); // 0,81
    expect(eventos.filter(e => e.type === 'alerta_orcamento')).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ escopo: 'projeto', tetoUsd: 1 });
    chamar(G, sess, 'conteudo', 0.01);
    expect(eventos.filter(e => e.type === 'alerta_orcamento')).toHaveLength(1);
    G.ajustar(sess, { tetos: { projeto: 2 } });
    chamar(G, sess, 'conteudo', 0.8); // 1,62 → 81% de 2
    expect(eventos.filter(e => e.type === 'alerta_orcamento')).toHaveLength(2);
  });

  test('ORCAMENTO_ALERTA_PCT muda o limiar do alerta', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '1', ORCAMENTO_ALERTA_PCT: '50' } });
    const sess = sessao({ custoProjetoUsd: 0.49 });
    chamar(G, sess, 'conteudo', 0.02);
    expect(eventos.some(e => e.type === 'alerta_orcamento')).toBe(true);
  });

  test('a pausa emite pausado_orcamento com as opções e grava o estado', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao({ custoProjetoUsd: 4.995 });
    expect(() => G.antes(sess, 'conteudo', PARAMS)).toThrow();
    const e = eventos.find(x => x.type === 'pausado_orcamento');
    expect(e).toMatchObject({ escopo: 'projeto', tetoUsd: 5, opcoes: ['aumentar-teto', 'trocar-perfil', 'cancelar'] });
    expect(e.estimativaProximaUsd).toBeGreaterThan(0);
    const gravado = JSON.parse(fs.readFileSync(path.join(dir, 'scr', 'uso.json'), 'utf-8'));
    expect(gravado.pausa).toMatchObject({ escopo: 'projeto' });
  });

  test('reexecutar sem aumentar o teto pausa de novo; aumentar o teto limpa a pausa', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao({ custoProjetoUsd: 4.995 });
    expect(() => G.antes(sess, 'conteudo', PARAMS)).toThrow();
    expect(() => G.antes(sess, 'conteudo', PARAMS)).toThrow();
    expect(G.usoDe(sess).pausa).toBeTruthy();
    expect(G.ajustar(sess, { tetos: { projeto: 10 } })).toEqual({ ok: true });
    expect(G.usoDe(sess).pausa).toBeNull();
    expect(() => G.antes(sess, 'conteudo', PARAMS)).not.toThrow();
  });

  test('trocar o perfil também limpa a pausa', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao({ custoProjetoUsd: 4.995 });
    expect(() => G.antes(sess, 'conteudo', PARAMS)).toThrow();
    G.ajustar(sess, { perfil: 'economico' });
    expect(G.usoDe(sess).pausa).toBeNull();
    expect(G.perfil(sess).id).toBe('economico');
  });
});

describe('calibração da estimativa', () => {
  test('o fator acompanha a razão real/estimado e fica entre 0,5× e 3×', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '100' } });
    const sess = sessao();
    for (let i = 0; i < 8; i++) chamar(G, sess, 'conteudo', CUSTO_BASE * 1.2);
    const f = G.fatorCalibracao(sess, 'conteudo');
    expect(f).toBeGreaterThan(1.1);
    expect(f).toBeLessThan(1.25);
    for (let i = 0; i < 30; i++) chamar(G, sess, 'conteudo', CUSTO_BASE * 10);
    expect(G.fatorCalibracao(sess, 'conteudo')).toBe(3);
    const G2 = novo({ env: { ORCAMENTO_MAX_USD: '100' } });
    const s2 = sessao();
    for (let i = 0; i < 30; i++) chamar(G2, s2, 'conteudo', CUSTO_BASE * 0.01);
    expect(G2.fatorCalibracao(s2, 'conteudo')).toBe(0.5);
  });

  test('a reserva seguinte usa o fator calibrado', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '100', ORCAMENTO_MARGEM_PCT: '0' } });
    const sess = sessao();
    for (let i = 0; i < 12; i++) chamar(G, sess, 'conteudo', CUSTO_BASE * 2);
    const r = G.antes(sess, 'conteudo', PARAMS);
    expect(r.valor).toBeCloseTo(r.base * G.fatorCalibracao(sess, 'conteudo'), 8);
    expect(r.valor).toBeGreaterThan(CUSTO_BASE * 1.7);
  });

  test('a tarifa fixa da busca web não entra na razão de calibração', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '100' } });
    const sess = sessao();
    const r = G.antes(sess, 'pesquisa', PARAMS);
    sess.custoProjetoUsd += CUSTO_BASE + 0.04;
    G.depois(sess, 'pesquisa', r, { modelo: 'gpt-4o', custoUsd: CUSTO_BASE + 0.04, tarifaUsd: 0.04, usage: {} });
    expect(G.usoDe(sess).calibracao.pesquisa.fator).toBeCloseTo(1, 3);
  });
});

describe('persistência de uso.json', () => {
  test('grava de forma atômica (sem arquivo temporário) e restaura em outra sessão', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao();
    chamar(G, sess, 'conteudo', 0.01);
    G.ajustar(sess, { perfil: 'premium', tetos: { projeto: 7 } });
    const scr = path.join(dir, 'scr');
    expect(fs.readdirSync(scr).filter(f => f.includes('.tmp-'))).toEqual([]);
    const outra = sessao();
    novo({ env: { ORCAMENTO_MAX_USD: '5' } }).carregarUso(outra);
    expect(outra.uso.etapas.conteudo.usd).toBe(0.01);
    expect(outra.uso.perfil).toBe('premium');
    expect(outra.uso.tetos.projeto).toBe(7);
  });

  test('uso.json corrompido vira estado vazio com aviso, sem impedir a geração', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    fs.mkdirSync(path.join(dir, 'scr'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scr', 'uso.json'), '{ nao é json', 'utf-8');
    const sess = sessao();
    G.carregarUso(sess);
    expect(sess.uso.etapas).toEqual({});
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/uso\.json ilegível/));
    expect(() => G.antes(sess, 'conteudo', PARAMS)).not.toThrow();
  });

  test('sem pasta de projeto nada é gravado (e nada quebra)', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = { config: {}, custoProjetoUsd: 0 };
    chamar(G, sess, 'conteudo', 0.01);
    expect(fs.existsSync(path.join(dir, 'scr'))).toBe(false);
  });

  test('as reservas em voo não são persistidas', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao();
    G.antes(sess, 'conteudo', PARAMS);
    G.gravarUso(sess);
    const gravado = JSON.parse(fs.readFileSync(path.join(dir, 'scr', 'uso.json'), 'utf-8'));
    expect(JSON.stringify(gravado)).not.toMatch(/reserv/i);
    const nova = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    expect(nova._reservas.size).toBe(0);
  });
});

describe('teto diário entre projetos', () => {
  test('soma o dia de todos os projetos da máquina', () => {
    const env = { ORCAMENTO_DIA_MAX_USD: '0.05' };
    const A = novo({ env });
    const projetoA = sessao();
    chamar(A, projetoA, 'conteudo', 0.04);
    const B = novo({ env }); // outro processo/projeto lendo o mesmo arquivo global
    const projetoB = sessao({ config: { nome: 'Outro Curso' } });
    expect(() => B.antes(projetoB, 'conteudo', PARAMS)).toThrow(/diário/);
  });

  test('a virada do dia zera o gasto diário', () => {
    let agora = new Date(2026, 9, 25, 23, 0, 0);
    const G = novo({ env: { ORCAMENTO_DIA_MAX_USD: '0.05' }, agora: () => agora });
    const sess = sessao();
    chamar(G, sess, 'conteudo', 0.045);
    expect(() => G.antes(sess, 'conteudo', PARAMS)).toThrow(/diário/);
    agora = new Date(2026, 9, 26, 0, 5, 0);
    expect(() => G.antes(sess, 'conteudo', PARAMS)).not.toThrow();
  });

  test('arquivo global inacessível: o escopo dia desliga com aviso e a geração segue', () => {
    const pastaNoLugarDoArquivo = path.join(dir, 'e-uma-pasta');
    fs.mkdirSync(pastaNoLugarDoArquivo);
    const G = novo({ env: { ORCAMENTO_DIA_MAX_USD: '0.0001', USO_DIARIO_FILE: pastaNoLugarDoArquivo } });
    const sess = sessao();
    expect(() => chamar(G, sess, 'conteudo', 0.5)).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/gasto diário/));
  });

  test('sem teto diário o arquivo global nem é criado', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    chamar(G, sessao(), 'conteudo', 0.01);
    expect(fs.existsSync(path.join(dir, 'uso-diario.json'))).toBe(false);
  });
});

describe('perfis e degradação', () => {
  test('o padrão é "padrao"; perfil inválido no ambiente cai no padrão com aviso', () => {
    expect(novo().perfil(sessao()).id).toBe('padrao');
    const G = novo({ env: { CUSTO_PERFIL: 'ultra' } });
    expect(G.perfil(sessao()).id).toBe('padrao');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/CUSTO_PERFIL/));
  });

  test('CUSTO_PERFIL escolhe o perfil inicial e o perfil do projeto prevalece depois', () => {
    const G = novo({ env: { CUSTO_PERFIL: 'premium' } });
    const sess = sessao();
    expect(G.perfil(sess).id).toBe('premium');
    G.ajustar(sess, { perfil: 'economico' });
    expect(G.perfil(sess).id).toBe('economico');
    expect(G.perfil(sess)).toMatchObject({ consultasPesquisa: 2, contextoBusca: 'low', ciclosMelhoriaMax: 1, fontesPorSecao: 3, juizForte: 'nunca' });
  });

  test('o alerta marca a degradação, que só vale entre unidades de trabalho (um nível por vez)', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '1', CUSTO_PERFIL: 'premium' } });
    const sess = sessao({ custoProjetoUsd: 0.79 });
    chamar(G, sess, 'conteudo', 0.02);
    expect(G.perfil(sess).id).toBe('premium'); // ainda não: a unidade em curso termina como começou
    expect(G.aplicarDegradacao(sess)).toBe('padrao');
    expect(eventos.find(e => e.type === 'perfil_alterado')).toMatchObject({ de: 'premium', para: 'padrao' });
    expect(G.aplicarDegradacao(sess)).toBeNull(); // sem novo alerta, nada muda
    expect(G.perfil(sess).id).toBe('padrao');
  });

  test('Econômico não degrada mais e a degradação pode ser desligada', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '1', CUSTO_PERFIL: 'economico' } });
    const sess = sessao({ custoProjetoUsd: 0.79 });
    chamar(G, sess, 'conteudo', 0.02);
    expect(G.aplicarDegradacao(sess)).toBeNull();
    expect(eventos.some(e => e.type === 'perfil_alterado')).toBe(false);

    const G2 = novo({ env: { ORCAMENTO_MAX_USD: '1', CUSTO_DEGRADACAO_AUTOMATICA: 'false' } });
    const s2 = sessao({ custoProjetoUsd: 0.79 });
    chamar(G2, s2, 'conteudo', 0.02);
    expect(G2.aplicarDegradacao(s2)).toBeNull();
    expect(G2.perfil(s2).id).toBe('padrao');
    expect(eventos.some(e => e.type === 'alerta_orcamento')).toBe(true);
  });

  test('sem teto, o perfil nunca degrada', () => {
    const G = novo();
    const sess = sessao();
    chamar(G, sess, 'conteudo', 50);
    expect(G.aplicarDegradacao(sess)).toBeNull();
    expect(G.perfil(sess).id).toBe('padrao');
  });
});

describe('papéis e modelos por perfil', () => {
  const salvo = { ...process.env };
  afterEach(() => { process.env = { ...salvo }; });

  test('o papel da chamada vem do nome da generation', () => {
    const G = novo();
    expect(G.papelDe('conteudo.aula')).toBe('redacao');
    expect(G.papelDe('ementa.gerar')).toBe('resumos');
    expect(G.papelDe('revisao.aula')).toBe('avaliacao');
    expect(G.papelDe('pesquisa.web')).toBe('pesquisa');
    expect(G.papelDe('score.juiz-final.pareado')).toBe('juiz');
    expect(G.papelDe('openai.chat')).toBeNull();
  });

  test('perfil Padrão sem variáveis de papel mantém o modelo da skill', () => {
    const G = novo();
    expect(G.modeloPara(sessao(), 'conteudo.aula', 'gpt-4o-mini')).toBe('gpt-4o-mini');
    expect(G.modeloPara(sessao(), 'ementa.gerar', 'gpt-4o-mini')).toBe('gpt-4o-mini');
  });

  test('a variável do papel vence; a redação segue o perfil', () => {
    process.env.OPENAI_EVAL_MODEL = 'gpt-4o';
    process.env.OPENAI_JUDGE_MODEL = 'gpt-4.1';
    process.env.OPENAI_CONTENT_MODEL = 'gpt-4o';
    const G = novo();
    const sess = sessao();
    expect(G.modeloPara(sess, 'revisao.aula', 'gpt-4o-mini')).toBe('gpt-4o');
    G.ajustar(sess, { perfil: 'economico' });
    expect(G.modeloPara(sess, 'conteudo.aula', 'gpt-4o')).toBe('gpt-4o-mini'); // economia
    G.ajustar(sess, { perfil: 'premium' });
    expect(G.modeloPara(sess, 'conteudo.aula', 'gpt-4o')).toBe('gpt-4.1'); // juiz
  });
});

describe('juiz final em cascata', () => {
  test('Padrão: só em casos duvidosos (ganho perto do limiar ou rubrica × determinístico divergentes)', () => {
    const G = novo();
    const sess = sessao();
    expect(G.decidirJuizForte(sess, { ganho: 0.3, divergencia: 0.05 })).toBe(false);
    expect(G.decidirJuizForte(sess, { ganho: -0.2, divergencia: 0.05 })).toBe(false);
    expect(G.decidirJuizForte(sess, { ganho: 0.03, divergencia: 0.05 })).toBe(true);
    expect(G.decidirJuizForte(sess, { ganho: 0.3, divergencia: 0.5 })).toBe(true);
  });

  test('Premium sempre; Econômico nunca', () => {
    const G = novo();
    const sess = sessao();
    G.ajustar(sess, { perfil: 'premium' });
    expect(G.decidirJuizForte(sess, { ganho: 0.5, divergencia: 0 })).toBe(true);
    G.ajustar(sess, { perfil: 'economico' });
    expect(G.decidirJuizForte(sess, { ganho: 0.02, divergencia: 0.9 })).toBe(false);
  });

  test('a margem e a divergência são configuráveis', () => {
    const G = novo({ env: { JUIZ_MARGEM_GANHO: '0.5', JUIZ_DIVERGENCIA_MAX: '0.9' } });
    expect(G.decidirJuizForte(sessao(), { ganho: 0.4, divergencia: 0.5 })).toBe(true);
  });
});

describe('validação de modelos', () => {
  test('modelo conhecido com a capacidade exigida não gera aviso', () => {
    expect(validarModelos({ pesquisa: 'gpt-4o', resumos: 'gpt-4o-mini', redacao: 'gpt-4o-mini', avaliacao: 'gpt-4o-mini', juiz: 'gpt-4o' })).toEqual([]);
  });

  test('modelo desconhecido gera aviso de capacidade não conferida, nunca erro', () => {
    const avisos = validarModelos({ pesquisa: 'modelo-novo-x', resumos: 'gpt-4o-mini' });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ papel: 'pesquisa', tipo: 'nao_conferido' });
  });

  test('modelo marcado sem a capacidade exigida pelo papel gera aviso', () => {
    const tabela = { modelos: { 'sem-busca': { busca_web: false } }, exigencias: { pesquisa: ['busca_web'] } };
    const avisos = validarModelos({ pesquisa: 'sem-busca' }, tabela);
    expect(avisos[0]).toMatchObject({ tipo: 'sem_capacidade', capacidade: 'busca_web' });
  });
});

describe('ajustar (POST /api/orcamento)', () => {
  test('valida tetos, perfil e decisão', () => {
    const G = novo();
    const sess = sessao();
    expect(G.ajustar(sess, { tetos: { projeto: -1 } }).erro).toMatch(/número positivo/);
    expect(G.ajustar(sess, { tetos: { semana: 5 } }).erro).toMatch(/desconhecido/);
    expect(G.ajustar(sess, { tetos: 'x' }).erro).toBeTruthy();
    expect(G.ajustar(sess, { perfil: 'ultra' }).erro).toMatch(/desconhecido/);
    expect(G.ajustar(sess, { decisao: 'pular' }).erro).toMatch(/Não há disparo/);
    expect(G.ajustar(sess, { decisao: 'abracadabra' }).erro).toMatch(/desconhecida/);
    expect(G.usoDe(sess).tetos).toEqual({});
  });

  test('null remove o ajuste de teto', () => {
    const G = novo();
    const sess = sessao();
    G.ajustar(sess, { tetos: { projeto: 4 } });
    G.ajustar(sess, { tetos: { projeto: null } });
    expect(G.usoDe(sess).tetos.projeto).toBeUndefined();
  });

  test('estado devolve tetos, gasto, saldo, perfil e avisos sem dados sensíveis', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao({ custoProjetoUsd: 1.2 });
    const e = G.estado(sess);
    expect(e.projeto).toEqual({ tetoUsd: 5, gastoUsd: 1.2, restanteUsd: 3.8 });
    expect(e.perfil.id).toBe('padrao');
    expect(e.ativo).toBe(true);
    expect(JSON.stringify(e)).not.toMatch(/sk-|api[_-]?key|[A-Z]:\\/i);
  });

  test('saldoRestante é o menor entre os escopos com teto', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5', ORCAMENTO_ETAPA_MAX_USD: '1' } });
    const sess = sessao({ custoProjetoUsd: 0.5 });
    G.usoDe(sess).etapas.conteudo = { usd: 0.5, chamadas: 1 };
    const s = G.saldoRestante(sess, 'conteudo');
    expect(s.restanteUsd).toBe(0.5);
    expect(s.escopos.map(x => x.escopo).sort()).toEqual(['etapa', 'projeto']);
    expect(novo().saldoRestante(sessao(), 'conteudo').restanteUsd).toBeNull();
  });
});

describe('gatilhos do disjuntor', () => {
  test('custo: a aula que passa de 2× a estimativa interrompe na chamada seguinte', async () => {
    const G = novo();
    const sess = sessao();
    await G.emUnidade(sess, { tipo: 'aula', numero: 5, estimativaUsd: 0.05 }, async () => {
      chamar(G, sess, 'conteudo', 0.11);
      let erro;
      try { G.antes(sess, 'conteudo', PARAMS); } catch (e) { erro = e; }
      expect(erro.code).toBe('DISJUNTOR_DISPARADO');
      expect(erro.detalhes.motivo).toBe('custo');
      expect(erro.message).toMatch(/aula 5/);
    });
    expect(eventos.find(e => e.type === 'disjuntor')).toMatchObject({ motivo: 'custo', unidade: 'aula 5', opcoes: ['aumentar-limite', 'trocar-perfil', 'pular'] });
  });

  test('custo: abaixo do fator não dispara; DISJUNTOR_FATOR_CUSTO muda o limite', async () => {
    const G = novo({ env: { DISJUNTOR_FATOR_CUSTO: '3' } });
    const sess = sessao();
    await G.emUnidade(sess, { tipo: 'aula', numero: 1, estimativaUsd: 0.05 }, async () => {
      chamar(G, sess, 'conteudo', 0.11);
      expect(() => G.antes(sess, 'conteudo', PARAMS)).not.toThrow();
    });
  });

  test('erro repetido: o mesmo código N vezes seguidas; sucesso zera a contagem', () => {
    const G = novo({ env: { DISJUNTOR_ERROS_SEGUIDOS: '3' } });
    const sess = sessao();
    const falha = () => G.registrarErro(sess, 'conteudo', Object.assign(new Error('boom'), { status: 500 }));
    expect(falha()).toBeNull();
    expect(falha()).toBeNull();
    const disparo = falha();
    expect(disparo.code).toBe('DISJUNTOR_DISPARADO');
    expect(disparo.detalhes).toMatchObject({ motivo: 'erro_repetido', valores: { codigo: '500', vezes: 3 } });

    const G2 = novo();
    const s2 = sessao();
    const f2 = () => G2.registrarErro(s2, 'conteudo', Object.assign(new Error('x'), { status: 500 }));
    f2(); f2();
    G2.depois(s2, 'conteudo', { token: null, base: 0 }, { custoUsd: 0 }); // sucesso
    expect(f2()).toBeNull();
  });

  test('erro repetido ignora aborto do usuário e códigos diferentes', () => {
    const G = novo({ env: { DISJUNTOR_ERROS_SEGUIDOS: '2' } });
    const sess = sessao();
    expect(G.registrarErro(sess, 'e', Object.assign(new Error('a'), { name: 'APIUserAbortError' }))).toBeNull();
    expect(G.registrarErro(sess, 'e', Object.assign(new Error('a'), { status: 500 }))).toBeNull();
    expect(G.registrarErro(sess, 'e', Object.assign(new Error('b'), { status: 502 }))).toBeNull();
  });

  test('sem ganho: interrompe em Padrão/Econômico e só avisa no Premium', () => {
    const G = novo();
    const sess = sessao();
    const r1 = G.gatilhoSemGanho(sess, 0.005);
    expect(r1.interrompe).toBe(true);
    expect(r1.erro.detalhes.motivo).toBe('sem_ganho');
    expect(G.gatilhoSemGanho(sessao(), 0.5).interrompe).toBe(false);
    const prem = sessao();
    G.ajustar(prem, { perfil: 'premium' });
    expect(G.gatilhoSemGanho(prem, 0.005)).toMatchObject({ interrompe: false, aviso: true });
  });

  test('continuações esgotadas dispara com o motivo continuacoes', () => {
    const G = novo();
    const erro = G.gatilhoContinuacoes(sessao(), 'aula 3');
    expect(erro.detalhes).toMatchObject({ motivo: 'continuacoes', unidade: 'aula 3' });
  });

  test('registro auditável: motivo, unidade, valores e momento em uso.json', () => {
    const G = novo();
    const sess = sessao();
    G.gatilhoContinuacoes(sess, 'aula 3');
    const gravado = JSON.parse(fs.readFileSync(path.join(dir, 'scr', 'uso.json'), 'utf-8'));
    expect(gravado.disparos[0]).toMatchObject({ motivo: 'continuacoes', unidade: 'aula 3' });
    expect(gravado.disparos[0].desde).toBeTruthy();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/\[disjuntor\] disparado: continuacoes/));
  });

  test('reexecutar sem decidir interrompe de imediato (sem reserva, sem chamada)', () => {
    const G = novo({ env: { ORCAMENTO_MAX_USD: '5' } });
    const sess = sessao();
    G.gatilhoContinuacoes(sess, 'aula 3');
    expect(() => G.antes(sess, 'conteudo', PARAMS)).toThrow(/Disjuntor/);
    expect(G._reservas.size).toBe(0);
  });

  test('decisões: aumentar-limite, trocar-perfil e pular resolvem o disparo', () => {
    const G = novo();
    const sess = sessao();
    const limites0 = G.limitesDisjuntor(sess);

    G.gatilhoContinuacoes(sess, 'aula 3');
    expect(G.ajustar(sess, { decisao: 'aumentar-limite' })).toEqual({ ok: true });
    expect(G.limitesDisjuntor(sess).continuacoesExtra).toBe(1);
    expect(G.limiteContinuacoes(sess, 2)).toBe(3);
    expect(() => G.antes(sess, 'conteudo', PARAMS)).not.toThrow();

    G.disparar(sess, 'custo', { unidade: 'aula 5', valores: {} });
    G.ajustar(sess, { decisao: 'aumentar-limite' });
    expect(G.limitesDisjuntor(sess).fatorCusto).toBe(limites0.fatorCusto * 1.5);

    G.disparar(sess, 'sem_ganho', { unidade: 'ciclo de melhoria', valores: {} });
    G.ajustar(sess, { decisao: 'aumentar-limite', valor: 0.001 });
    expect(G.limitesDisjuntor(sess).ganhoMin).toBe(0.001);

    G.disparar(sess, 'custo', { unidade: 'aula 7', valores: {} });
    expect(G.ajustar(sess, { decisao: 'trocar-perfil' }).erro).toMatch(/Informe o perfil/);
    expect(G.ajustar(sess, { decisao: 'trocar-perfil', perfil: 'economico' })).toEqual({ ok: true });
    expect(G.perfil(sess).id).toBe('economico');

    G.disparar(sess, 'custo', { unidade: 'aula 9', valores: {} });
    G.ajustar(sess, { decisao: 'pular' });
    expect(G.unidadePulada(sess, 'aula 9')).toBe(true);
    expect(G.unidadePulada(sess, 'aula 8')).toBe(false);
    expect(G.estado(sess).disjuntor).toBeNull();
  });
});

describe('uso vazio', () => {
  test('tem a estrutura esperada', () => {
    expect(usoVazio()).toMatchObject({ dias: {}, etapas: {}, modelos: {}, calibracao: {}, tetos: {}, pausa: null, disjuntor: null });
  });
});
