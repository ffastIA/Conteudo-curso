'use strict';

// Seleção do modelo por papel na tela (change selecao-de-modelo-na-tela), de ponta a ponta com a
// OpenAI simulada: GET/POST /api/orcamento, modelo enviado por papel, estimativa e cache de pesquisa.

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const BASE = path.join(os.tmpdir(), 'gerador-conteudo-tests', 'selecao-de-modelo');
const PASTA = path.join(BASE, 'curso');
const SCR = path.join(PASTA, 'scr');
const CACHE_DIR = path.join(BASE, 'cache');
const CONFIG = {
  nome: 'Curso de Selecao de Modelo',
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
  { titulo: 'Variáveis', modulo: 'Fundamentos', objetivos: 'declarar variáveis e tipos primitivos' },
  { titulo: 'Requisições HTTP', modulo: 'Web', objetivos: 'consumir APIs REST com fetch' }
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
  process.env.PESQUISA_CACHE = 'true';
  process.env.PESQUISA_CACHE_DIR = CACHE_DIR;
  process.env.PESQUISA_MODULOS_OBRIGATORIA = 'false';
});

afterEach(() => {
  for (const v of VARIAVEIS) { if (guardadas[v] === undefined) delete process.env[v]; else process.env[v] = guardadas[v]; }
});

function parseSSE(body) {
  return String(body).split('\n\n').filter(b => b.startsWith('data:'))
    .map(b => { try { return JSON.parse(b.replace(/^data:\s*/, '')); } catch { return null; } })
    .filter(Boolean);
}

async function sse(ag, rota) {
  const res = await ag.get(rota).buffer(true).parse((r, cb) => {
    let d = '';
    r.on('data', c => { d += c.toString(); });
    r.on('end', () => cb(null, d));
  });
  return parseSSE(res.body);
}

async function sessao() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(CONFIG);
  return ag;
}

const escolher = (ag, modelos) => ag.post('/api/orcamento').send({ modelos });
const json = (nome) => JSON.parse(fs.readFileSync(path.join(SCR, nome), 'utf-8'));
const modelosBusca = () => OpenAI.__getResponsesMock().mock.calls.map(([p]) => p.model);
const modelosChat = () => OpenAI.__getMock().mock.calls.map(([p]) => p.model);

describe('API: GET e POST /api/orcamento com a escolha de modelos', () => {
  test('GET traz os modelos efetivos, a origem e a lista permitida por papel', async () => {
    const ag = await sessao();
    const e = (await ag.get('/api/orcamento')).body;
    expect(e.modelosEscolhidos).toEqual({});
    expect(e.modelosDisponiveis.pesquisa).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(e.modelos.pesquisa).toBe('gpt-4o');
    expect(e.modelosOrigem.pesquisa).toBe('perfil');
  });

  test('POST válido grava a escolha em uso.json e devolve o estado novo', async () => {
    const ag = await sessao();
    const r = await escolher(ag, { pesquisa: 'gpt-4o-mini' });
    expect(r.status).toBe(200);
    expect(r.body.modelosEscolhidos).toEqual({ pesquisa: 'gpt-4o-mini' });
    expect(r.body.modelos.pesquisa).toBe('gpt-4o-mini');
    expect(r.body.modelosOrigem.pesquisa).toBe('usuario');
    expect(r.body.avisos).toBeUndefined();
    expect(json('uso.json').modelosEscolhidos).toEqual({ pesquisa: 'gpt-4o-mini' });
  });

  test('POST com modelo fora da lista ou papel desconhecido dá 400 e não altera nada', async () => {
    const ag = await sessao();
    const r1 = await escolher(ag, { redacao: 'gpt-9-fantasia' });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/gpt-9-fantasia/);
    const r2 = await escolher(ag, { traducao: 'gpt-4o' });
    expect(r2.status).toBe(400);
    expect((await ag.get('/api/orcamento')).body.modelosEscolhidos).toEqual({});
  });

  test('POST com null volta ao padrão do perfil', async () => {
    const ag = await sessao();
    await escolher(ag, { pesquisa: 'gpt-4o-mini' });
    const r = await escolher(ag, { pesquisa: null });
    expect(r.body.modelosEscolhidos).toEqual({});
    expect(r.body.modelos.pesquisa).toBe('gpt-4o');
  });
});

describe('o modelo enviado à OpenAI segue a escolha', () => {
  test('pesquisa: as consultas usam o modelo escolhido, o registro o informa e o cache é por modelo', async () => {
    const ag = await sessao();
    await sse(ag, '/api/search'); // gpt-4o (padrão) grava no cache
    expect(new Set(modelosBusca())).toEqual(new Set(['gpt-4o']));
    OpenAI.__reset();

    await escolher(ag, { pesquisa: 'gpt-4o-mini' });
    const eventos = await sse(ag, '/api/search');
    expect(eventos.map(e => e.type)).toContain('done');
    expect(modelosBusca()).toHaveLength(4); // nada veio do cache do outro modelo
    expect(new Set(modelosBusca())).toEqual(new Set(['gpt-4o-mini']));
    expect(json('pesquisa.json').modelo).toBe('gpt-4o-mini');
  });

  test('resumos e planos: a chamada de chat usa o modelo escolhido', async () => {
    const ag = await sessao();
    await escolher(ag, { resumos: 'gpt-4o' });
    OpenAI.__setResponses([PLANO_AULAS, 'Plano detalhado gerado a partir do JSON.']);
    await sse(ag, '/api/plano-aula');
    const modelos = modelosChat();
    expect(modelos.length).toBeGreaterThan(0);
    expect(new Set(modelos)).toEqual(new Set(['gpt-4o']));
  });

  test('sem escolha, o plano de aula continua no modelo de economia', async () => {
    const ag = await sessao();
    OpenAI.__setResponses([PLANO_AULAS, 'Plano detalhado gerado a partir do JSON.']);
    await sse(ag, '/api/plano-aula');
    expect(new Set(modelosChat())).toEqual(new Set(['gpt-4o-mini']));
  });
});

describe('estimativa e perfil', () => {
  test('a estimativa do conteúdo usa o modelo escolhido para a redação', async () => {
    const ag = await sessao();
    const antes = (await ag.get('/api/estimativa?etapa=conteudo')).body;
    expect(antes.modelo).toBe('gpt-4o-mini');
    await escolher(ag, { redacao: 'gpt-4o' });
    const depois = (await ag.get('/api/estimativa?etapa=conteudo')).body;
    expect(depois.modelo).toBe('gpt-4o');
    expect(depois.custoUsd.esperado).toBeGreaterThan(antes.custoUsd.esperado);
  });

  test('trocar o perfil não desfaz a escolha do usuário', async () => {
    const ag = await sessao();
    await escolher(ag, { pesquisa: 'gpt-4o' });
    const r = await ag.post('/api/orcamento').send({ perfil: 'economico' });
    expect(r.status).toBe(200);
    expect(r.body.perfil.modeloPesquisa).toBe('gpt-4o-mini'); // o perfil Econômico define gpt-4o-mini
    expect(r.body.modelos.pesquisa).toBe('gpt-4o'); // mas a escolha do usuário vence
    expect(r.body.modelosOrigem.pesquisa).toBe('usuario');
  });

  test('o aviso de mistura de modelos aparece quando o projeto já tem gasto', async () => {
    const ag = await sessao();
    OpenAI.__setUsage(10_000, 1_000);
    await sse(ag, '/api/search?semCache=1'); // gera gasto real simulado
    const r = await escolher(ag, { redacao: 'gpt-4o' });
    expect(r.status).toBe(200);
    expect(r.body.avisos).toHaveLength(1);
    expect(r.body.avisos[0]).toMatch(/outro modelo/);
  });
});
