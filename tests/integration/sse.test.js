'use strict';

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const app = require('../../server');

const VALID_CONFIG = {
  nome: 'Curso de Node.js',
  publico: 'Desenvolvedores júnior',
  carga: '40',
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender Node.js',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-de-node-js')
};

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  OpenAI.__reset();
});

// Parseia o corpo SSE (text/event-stream) em array de objetos
function parseSSE(body) {
  const text = typeof body === 'string' ? body : body.toString();
  return text
    .split('\n\n')
    .filter(block => block.startsWith('data:'))
    .map(block => {
      try { return JSON.parse(block.replace(/^data:\s*/, '')); }
      catch { return null; }
    })
    .filter(Boolean);
}

// Agente de cookie persistente para compartilhar sessão
function agent() {
  return request.agent(app);
}

// Coleta SSE completo em string
async function collectSSE(ag, path) {
  const res = await ag
    .get(path)
    .buffer(true)
    .parse((res, callback) => {
      let data = '';
      res.on('data', chunk => { data += chunk.toString(); });
      res.on('end', () => callback(null, data));
    });
  return res;
}

// ── 6.3: stream de /api/plano-ensino emite progress → token → done ───────────
describe('GET /api/plano-ensino (SSE streaming)', () => {
  test('emite progress → token → done com sessão válida', async () => {
    OpenAI.__setResponse('plano de ensino gerado pelo mock');
    const ag = agent();
    await ag.post('/api/config').send(VALID_CONFIG);

    const res = await collectSSE(ag, '/api/plano-ensino');
    const events = parseSSE(res.body);
    const types = events.map(e => e.type);

    expect(types).toContain('progress');
    expect(types).toContain('token');
    expect(types).toContain('done');

    const progressFirst = types.indexOf('progress');
    const doneIdx = types.lastIndexOf('done');
    expect(progressFirst).toBeLessThan(doneIdx);
  });

  // ── 6.4: falha na OpenAI emite evento error ────────────────────────────────
  test('com erro na OpenAI emite evento error', async () => {
    OpenAI.__setError(new Error('API timeout'));
    const ag = agent();
    await ag.post('/api/config').send(VALID_CONFIG);

    const res = await collectSSE(ag, '/api/plano-ensino');
    const events = parseSSE(res.body);
    const types = events.map(e => e.type);

    expect(types).toContain('error');
  });
});

// ── 6.2 / 6.5: GET /api/qualidade sem conteudo → 400 ─────────────────────────
describe('GET /api/qualidade', () => {
  test('sem conteudo na sessão retorna 400', async () => {
    const res = await request(app).get('/api/qualidade');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ── 6.6: GET /api/ppc sem conteudo → 400 ─────────────────────────────────────
describe('GET /api/ppc', () => {
  test('sem conteudo na sessão retorna 400', async () => {
    const res = await request(app).get('/api/ppc');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ── Extra: /api/plano-aula streaming ─────────────────────────────────────────
describe('GET /api/plano-aula (SSE streaming)', () => {
  test('emite progress → token → done com sessão válida', async () => {
    OpenAI.__setResponse('plano de aula gerado');
    const ag = agent();
    await ag.post('/api/config').send(VALID_CONFIG);

    const res = await collectSSE(ag, '/api/plano-aula');
    const events = parseSSE(res.body);
    const types = events.map(e => e.type);

    expect(types).toContain('progress');
    expect(types).toContain('done');
  });
});
