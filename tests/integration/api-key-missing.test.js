'use strict';

jest.mock('openai');

// Força GAMMA_API_KEY/HEYGEN_API_KEY vazias para este arquivo de teste,
// independentemente do que estiver no .env real — dotenv (chamado no topo de
// server.js) NÃO sobrescreve variáveis já presentes em process.env, mesmo que
// vazias, então isso precisa ser feito ANTES do require('../../server').
process.env.GAMMA_API_KEY = '';
process.env.HEYGEN_API_KEY = '';

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');

const app = require('../../server');

function baseConfig(pastaProjeto) {
  return {
    nome: 'Curso Sem Chaves',
    publico: 'Jovens de 16 a 18 anos',
    carga: '1',
    duracao: '60',
    nivel: 'intermediario',
    objetivos: 'Aprender o assunto do curso',
    modalidade: 'online',
    proporcaoTeoricoPratico: '40% teórico / 60% prático',
    preRequisitos: '',
    pastaProjeto
  };
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  OpenAI.__reset();
  global.fetch = jest.fn(); // nenhum teste aqui deveria efetivamente chamá-lo
});

afterEach(() => {
  delete global.fetch;
});

function agent() {
  return request.agent(app);
}

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

async function collectSSE(ag, urlPath) {
  const res = await ag
    .get(urlPath)
    .buffer(true)
    .parse((res, callback) => {
      let data = '';
      res.on('data', chunk => { data += chunk.toString(); });
      res.on('end', () => callback(null, data));
    });
  return res;
}

async function configurarCursoComConteudo(ag, aulas) {
  const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-sem-chaves-'));
  await ag.post('/api/config').send(baseConfig(pastaProjeto));
  OpenAI.__setResponses([JSON.stringify({ aulas })]);
  await collectSSE(ag, '/api/conteudo');
  return pastaProjeto;
}

describe('Guard de GAMMA_API_KEY ausente', () => {
  test('GET /api/slides/gerar retorna erro citando GAMMA_API_KEY e não chama fetch', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    await ag.post('/api/estilos-visuais/selecionar').send({
      id: 'pixar-3d', titulo: 'Estilo Pixar 3D', housePrompt: 'Pixar-style 3D animated illustration'
    });
    await ag.post('/api/slides/parametros').send({ index: 0, texto: '', quantidade: 3 });

    const res = await collectSSE(ag, '/api/slides/gerar');
    const events = parseSSE(res.body);
    const erro = events.find(e => e.type === 'error');

    expect(erro).toBeDefined();
    expect(erro.message).toMatch(/GAMMA_API_KEY/);
    expect(erro.message).toMatch(/\.env\.example/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('Guard de HEYGEN_API_KEY ausente', () => {
  test('GET /api/heygen/avatares retorna 500 citando HEYGEN_API_KEY e não chama fetch', async () => {
    const ag = agent();
    const res = await ag.get('/api/heygen/avatares');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/HEYGEN_API_KEY/);
    expect(res.body.error).toMatch(/\.env\.example/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('GET /api/heygen/vozes retorna 500 citando HEYGEN_API_KEY e não chama fetch', async () => {
    const ag = agent();
    const res = await ag.get('/api/heygen/vozes');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/HEYGEN_API_KEY/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('GET /api/video-avatar/gerar retorna erro citando HEYGEN_API_KEY e não chama fetch', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    await ag.post('/api/heygen/config').send({ avatarId: 'av_123', voiceId: 'voice_123' });
    await ag.post('/api/video-avatar/parametros').send({ index: 0, segundos: 30 });
    OpenAI.__setResponse('Texto de fala gerado para a aula.');
    await collectSSE(ag, '/api/video-avatar/roteiro/gerar'); // não usa fetch — só OpenAI mockado

    const res = await collectSSE(ag, '/api/video-avatar/gerar?index=0');
    const events = parseSSE(res.body);
    const erro = events.find(e => e.type === 'error');

    expect(erro).toBeDefined();
    expect(erro.message).toMatch(/HEYGEN_API_KEY/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
