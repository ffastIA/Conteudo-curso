'use strict';

// Custo e logs (change custo-e-logs): estimativa prévia, soma por projeto,
// trava de orçamento e logs estruturados com o id da requisição.
jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const PASTA = path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-custo-logs');
const SCR = path.join(PASTA, 'scr');
const CONFIG = {
  nome: 'Curso Custo',
  publico: 'Desenvolvedores júnior',
  carga: '10', // 10 aulas de 60 min
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender JavaScript',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: PASTA
};
const AULAS = [
  { titulo: 'Variáveis', modulo: 'Fundamentos', objetivos: 'declarar variáveis' },
  { titulo: 'Funções', modulo: 'Fundamentos', objetivos: 'criar funções' },
  { titulo: 'Objetos', modulo: 'Avançado', objetivos: 'trabalhar com objetos' }
];
const ENV_ORIGINAL = { ...process.env };

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  OpenAI.__reset();
  fs.rmSync(PASTA, { recursive: true, force: true });
  process.env.CONTEUDO_MODO = 'unico';
});
afterEach(() => {
  for (const k of ['ORCAMENTO_USD', 'LOG_LEVEL', 'CONTEUDO_MODO']) {
    if (ENV_ORIGINAL[k] === undefined) delete process.env[k]; else process.env[k] = ENV_ORIGINAL[k];
  }
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
const prompt = (c) => c.messages[1].content;

async function sessao() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(CONFIG);
  return ag;
}
async function sessaoComPlano() {
  const ag = await sessao();
  OpenAI.__setResponder((params) => params.response_format
    ? JSON.stringify({ aulas: AULAS })
    : `Plano da aula ${prompt(params).match(/Aula (\d) de/)?.[1] || '?'}.`);
  await sse(ag, '/api/plano-aula');
  OpenAI.__reset();
  return ag;
}

describe('GET /api/estimativa', () => {
  test('rejeita etapa desconhecida', async () => {
    const ag = await sessao();
    expect((await ag.get('/api/estimativa?etapa=xyz')).status).toBe(400);
  });

  test('conteúdo sem plano: estima pelas horas/duração do curso, como faixa rotulada', async () => {
    const ag = await sessao();
    const res = await ag.get('/api/estimativa?etapa=conteudo');
    expect(res.status).toBe(200);
    expect(res.body.estimativa).toBe(true);
    expect(res.body.unidades).toBe(10);
    expect(res.body.custoUsd.minimo).toBeLessThanOrEqual(res.body.custoUsd.maximo);
    expect(res.body.tokens.minimo).toBeLessThan(res.body.tokens.maximo);
    expect(res.body.orcamentoUsd).toBeNull();
  });

  test('com plano: conta aulas e módulos reais', async () => {
    const ag = await sessaoComPlano();
    const conteudo = await ag.get('/api/estimativa?etapa=conteudo');
    expect(conteudo.body.unidades).toBe(3);
    const modulos = await ag.get('/api/estimativa?etapa=pesquisa-modulos');
    expect(modulos.body.unidades).toBe(2);
    expect(modulos.body.modelo).toBeTruthy();
    const revisao = await ag.get('/api/estimativa?etapa=revisao');
    expect(revisao.body.unidades).toBe(3);
  });

  test('inclui o teto quando ORCAMENTO_USD está definido', async () => {
    process.env.ORCAMENTO_USD = '2.5';
    const ag = await sessao();
    const res = await ag.get('/api/estimativa?etapa=conteudo');
    expect(res.body.orcamentoUsd).toBe(2.5);
  });
});

describe('soma de custo por projeto', () => {
  test('o custo acumulado cresce pelo custo calculado do usage e fica em projeto.json', async () => {
    const ag = await sessaoComPlano();
    const antes = JSON.parse(fs.readFileSync(path.join(SCR, 'projeto.json'), 'utf-8')).custoProjetoUsd || 0;

    const eventos = await sse(ag, '/api/conteudo?aulas=1');
    const done = eventos.find(e => e.type === 'done');
    expect(done.custoUsd).toBeGreaterThan(0);

    const depois = JSON.parse(fs.readFileSync(path.join(SCR, 'projeto.json'), 'utf-8')).custoProjetoUsd;
    expect(depois - antes).toBeCloseTo(done.custoUsd, 5);

    const est = await ag.get('/api/estimativa?etapa=conteudo');
    expect(est.body.custoProjetoUsd).toBeGreaterThan(0);
  });

  test('o custo acumulado volta ao recarregar o projeto', async () => {
    const ag = await sessaoComPlano();
    await sse(ag, '/api/conteudo?aulas=1');
    const gravado = JSON.parse(fs.readFileSync(path.join(SCR, 'projeto.json'), 'utf-8')).custoProjetoUsd;

    const novo = request.agent(app);
    await novo.post('/api/carregar-projeto').send({ pasta: PASTA });
    const est = await novo.get('/api/estimativa?etapa=revisao');
    expect(est.body.custoProjetoUsd).toBeCloseTo(gravado, 4);
  });
});

describe('trava de orçamento', () => {
  test('sem ORCAMENTO_USD a geração segue normalmente', async () => {
    const ag = await sessaoComPlano();
    const eventos = await sse(ag, '/api/conteudo?aulas=1');
    expect(eventos.find(e => e.type === 'error')).toBeUndefined();
    expect(eventos.find(e => e.type === 'done')).toBeDefined();
  });

  test('teto estourado aborta a etapa com erro SSE informando custo e teto, sem chamar a API', async () => {
    const ag = await sessaoComPlano();
    process.env.ORCAMENTO_USD = '0.0000001';
    const eventos = await sse(ag, '/api/conteudo?aulas=1');
    const erro = eventos.find(e => e.type === 'error');
    expect(erro).toBeDefined();
    expect(erro.message).toMatch(/Orçamento do projeto atingido/);
    expect(erro.message).toMatch(/ORCAMENTO_USD/);
    expect(OpenAI.__getMock()).not.toHaveBeenCalled();
  });

  test('teto folgado não bloqueia', async () => {
    const ag = await sessaoComPlano();
    process.env.ORCAMENTO_USD = '50';
    const eventos = await sse(ag, '/api/conteudo?aulas=1');
    expect(eventos.find(e => e.type === 'error')).toBeUndefined();
  });
});

describe('logs estruturados', () => {
  test('o reqId do log é o mesmo traceId enviado no evento done', async () => {
    const ag = await sessaoComPlano();
    process.env.LOG_LEVEL = 'info';
    console.log.mockClear();
    const eventos = await sse(ag, '/api/conteudo?aulas=1');
    const done = eventos.find(e => e.type === 'done');

    const linhas = console.log.mock.calls.map(([l]) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const aula = linhas.find(l => l.mensagem === 'aula gerada');
    expect(aula).toBeDefined();
    expect(aula).toMatchObject({ nivel: 'info', etapa: 'conteudo', aula: 1 });
    expect(aula.reqId).toBe(done.traceId);
  });

  test('o código do servidor não usa console.* solto', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf-8');
    expect(src).not.toMatch(/\bconsole\.(log|warn|error)\(/);
  });
});
