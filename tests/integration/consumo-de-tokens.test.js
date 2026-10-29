'use strict';

// Consumo do projeto com valor em US$ (change consumo-de-tokens-com-valor), de ponta a ponta com a
// OpenAI simulada: GET /api/consumo depois de uma pesquisa e de um plano, conciliação com o orçamento
// e formatos antigos de /api/tokens e /api/orcamento intactos.

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const BASE = path.join(os.tmpdir(), 'gerador-conteudo-tests', 'consumo-de-tokens');
const PASTA = path.join(BASE, 'curso');
const SCR = path.join(PASTA, 'scr');
const CONFIG = {
  nome: 'Curso de Consumo de Tokens',
  publico: 'Desenvolvedores júnior',
  carga: '2',
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender JavaScript',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: PASTA
};
const PLANO_AULAS = JSON.stringify({ aulas: [
  { titulo: 'Variáveis', modulo: 'Fundamentos', objetivos: 'declarar variáveis e tipos primitivos' }
] });
const VARIAVEIS = ['OPENAI_RESEARCH_MODEL', 'OPENAI_CONTENT_MODEL', 'OPENAI_ECONOMY_MODEL', 'OPENAI_SUMMARY_MODEL', 'OPENAI_EVAL_MODEL', 'OPENAI_JUDGE_MODEL', 'CUSTO_PERFIL'];
let guardadas;

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  process.env.PESQUISA_CACHE = 'false';
  jest.restoreAllMocks();
});

beforeEach(() => {
  OpenAI.__reset();
  fs.rmSync(BASE, { recursive: true, force: true });
  guardadas = Object.fromEntries(VARIAVEIS.map(v => [v, process.env[v]]));
  for (const v of VARIAVEIS) delete process.env[v];
  process.env.PESQUISA_CACHE = 'false';
  process.env.PESQUISA_MODULOS_OBRIGATORIA = 'false';
});

afterEach(() => {
  for (const v of VARIAVEIS) { if (guardadas[v] === undefined) delete process.env[v]; else process.env[v] = guardadas[v]; }
});

async function sse(ag, rota) {
  await ag.get(rota).buffer(true).parse((r, cb) => {
    let d = '';
    r.on('data', c => { d += c.toString(); });
    r.on('end', () => cb(null, d));
  });
}

async function sessao() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(CONFIG);
  return ag;
}

const precos = () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'precos-modelos.json'), 'utf-8'));

describe('GET /api/consumo', () => {
  test('projeto sem chamadas: consumo vazio e sem erro', async () => {
    const ag = await sessao();
    const r = await ag.get('/api/consumo');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ modelos: [], totalUsd: 0, parcial: false, divergente: false, semPreco: [] });
    expect(r.body.moeda).toBe('USD');
  });

  test('depois da pesquisa: tokens, cache, busca web e valor pela tabela de preços', async () => {
    const ag = await sessao();
    OpenAI.__setUsage(10_000, 1_000);
    OpenAI.__setCachedTokens(4_000);
    await sse(ag, '/api/search');

    const c = (await ag.get('/api/consumo')).body;
    expect(c.modelos).toHaveLength(1);
    const m = c.modelos[0];
    expect(m.modelo).toBe('gpt-4o'); // padrão do perfil Padrão para a pesquisa
    expect(m.chamadas).toBeGreaterThan(0);
    expect(m.tokens.entrada).toBe(10_000 * m.chamadas);
    expect(m.tokens.entradaEmCache).toBe(4_000 * m.chamadas);
    expect(m.tokens.saida).toBe(1_000 * m.chamadas);

    const p = precos().porMilhaoDeTokens['gpt-4o'];
    const porChamada = ((10_000 - 4_000) * p.entrada + 4_000 * p.entradaEmCache + 1_000 * p.saida) / 1e6;
    expect(m.tarifa).toEqual({ entrada: p.entrada, entradaEmCache: p.entradaEmCache, saida: p.saida });
    expect(m.valorUsd).toBeCloseTo(porChamada * m.chamadas, 5);
    expect(c.buscaWeb.chamadas).toBeGreaterThan(0);
    expect(c.buscaWeb.valorUsd).toBeCloseTo(c.buscaWeb.chamadas * precos().buscaWebPorChamadaUsd, 5);
    expect(c.totalUsd).toBeCloseTo(m.valorUsd + c.buscaWeb.valorUsd, 5);
  });

  test('a soma das etapas, a dos dias e o total do projeto coincidem; o gasto registrado concilia', async () => {
    const ag = await sessao();
    OpenAI.__setUsage(10_000, 1_000);
    await sse(ag, '/api/search');
    OpenAI.__setResponses([PLANO_AULAS, 'Plano detalhado gerado a partir do JSON.']);
    await sse(ag, '/api/plano-aula');

    const c = (await ag.get('/api/consumo')).body;
    const soma = (o) => Object.values(o).reduce((s, v) => s + v.valorUsd, 0);
    expect(Object.keys(c.porEtapa).length).toBeGreaterThan(1);
    expect(soma(c.porEtapa)).toBeCloseTo(c.totalUsd, 5);
    expect(soma(c.porDia)).toBeCloseTo(c.totalUsd, 5);
    expect(new Set(c.modelos.map(m => m.modelo))).toEqual(new Set(['gpt-4o', 'gpt-4o-mini']));
    // mesma tabela de preços da cobrança interna: o recalculado bate com o registrado em uso.json
    expect(c.registradoUsd).toBeGreaterThan(0);
    expect(c.divergente).toBe(false);
    expect(c.parcial).toBe(false);
    expect(Math.abs(c.diferencaUsd)).toBeLessThan(1e-4);
  });

  test('persiste em uso.json só contadores, sem US$', async () => {
    const ag = await sessao();
    OpenAI.__setUsage(2_000, 200);
    await sse(ag, '/api/search');
    const uso = JSON.parse(fs.readFileSync(path.join(SCR, 'uso.json'), 'utf-8'));
    const etapas = Object.values(uso.consumo.porEtapa);
    expect(etapas.length).toBeGreaterThan(0);
    expect(etapas[0]['gpt-4o'].tokensEntrada).toBeGreaterThan(0);
    expect(Object.keys(uso.consumo.porDia)).toHaveLength(1);
    expect(JSON.stringify(uso.consumo)).not.toMatch(/usd/i);
  });
});

describe('formatos existentes', () => {
  test('GET /api/tokens e GET /api/orcamento continuam com os mesmos campos', async () => {
    const ag = await sessao();
    OpenAI.__setUsage(1_000, 100);
    await sse(ag, '/api/search');
    const t = (await ag.get('/api/tokens')).body;
    expect(t).toEqual(expect.objectContaining({ prompt: expect.any(Number), completion: expect.any(Number), total: expect.any(Number) }));
    expect(t.projeto.total.total).toBeGreaterThan(0);
    expect(t.consumo).toBeUndefined();
    const o = (await ag.get('/api/orcamento')).body;
    expect(o).toEqual(expect.objectContaining({ projeto: expect.any(Object), porModelo: expect.any(Object), modelos: expect.any(Object) }));
    expect(o.consumo).toBeUndefined();
  });
});
