'use strict';

jest.mock('openai');

// GAMMA_TEMPLATE_IDS é lida do env na carga do módulo — precisa ser
// definida ANTES do require('../../server'), mesmo padrão já usado para
// HEYGEN_AVATAR_IDS/HEYGEN_VOICE_IDS em
// tests/integration/heygen-avatares-vozes-filtro-env.test.js.
process.env.GAMMA_TEMPLATE_IDS = 'g_valido_1, g_invalido, g_valido_2';
process.env.GAMMA_POLL_INTERVAL_MS = '20';
process.env.GAMMA_POLL_TIMEOUT_MS = '300';

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');

const app = require('../../server');

function baseConfig(pastaProjeto) {
  return {
    nome: 'Curso de Slides com Template',
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
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  OpenAI.__reset();
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
  const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-slides-template-'));
  await ag.post('/api/config').send(baseConfig(pastaProjeto));
  OpenAI.__setResponses([JSON.stringify({ aulas })]);
  await collectSSE(ag, '/api/conteudo');
  return pastaProjeto;
}

async function selecionarEstiloVisual(ag) {
  await ag.post('/api/estilos-visuais/selecionar').send({
    id: 'pixar-3d',
    titulo: 'Estilo Pixar 3D',
    housePrompt: 'Pixar-style 3D animated illustration, warm colors'
  });
}

// Mock de GET /gammas/{id} (resolução de nome) — g_invalido responde 404,
// os demais respondem com um título. Usado tanto por GET /api/slides/templates
// quanto por POST /api/slides/template (que resolve o título de novo).
function installGammasLookupFetchMock() {
  const titulos = { g_valido_1: 'Template Institucional', g_valido_2: 'Template Colorido' };
  global.fetch = jest.fn(async (url) => {
    const urlStr = String(url);
    const match = urlStr.match(/\/gammas\/([^/?]+)$/);
    if (match) {
      const id = match[1];
      if (!(id in titulos)) return { ok: false, status: 404, text: async () => 'not found' };
      return { ok: true, status: 200, json: async () => ({ id, title: titulos[id], type: 'template' }) };
    }
    return { ok: false, status: 404, text: async () => 'not found' };
  });
}

// Mock combinado: resolução de nome (GET /gammas/{id}) + fluxo completo de
// geração via template (POST /generations/from-template -> GET
// /generations/{id} -> download do exportUrl), no mesmo padrão de
// installGammaFetchMock em slides-gamma.test.js.
function installGammaTemplateFlowFetchMock() {
  const calls = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    const urlStr = String(url);
    calls.push({ url: urlStr, options });

    if (/\/gammas\/([^/?]+)$/.test(urlStr)) {
      const id = urlStr.match(/\/gammas\/([^/?]+)$/)[1];
      const titulos = { g_valido_1: 'Template Institucional', g_valido_2: 'Template Colorido' };
      if (!(id in titulos)) return { ok: false, status: 404, text: async () => 'not found' };
      return { ok: true, status: 200, json: async () => ({ id, title: titulos[id], type: 'template' }) };
    }
    if (urlStr.endsWith('/generations/from-template') && options.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ generationId: 'gen-template-abc' }) };
    }
    if (/\/generations\/[^/]+$/.test(urlStr)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'completed',
          exportUrl: 'https://gamma-export.example.com/fake-deck.pptx',
          gammaUrl: 'https://gamma.app/docs/fake',
          credits: { deducted: 5, remaining: 95 }
        })
      };
    }
    // Download do exportUrl
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('PPTX-FAKE-BYTES') };
  });
  return calls;
}

describe('GET /api/slides/templates', () => {
  test('resolve o nome de cada ID configurado, na ordem do .env, omitindo IDs inacessíveis', async () => {
    const ag = agent();
    installGammasLookupFetchMock();
    const res = await ag.get('/api/slides/templates');
    expect(res.status).toBe(200);
    expect(res.body.templates).toEqual([
      { id: 'g_valido_1', title: 'Template Institucional' },
      { id: 'g_valido_2', title: 'Template Colorido' }
    ]);
  });
});

describe('POST /api/slides/template', () => {
  test('templateId fora de GAMMA_TEMPLATE_IDS retorna 400', async () => {
    const ag = agent();
    const res = await ag.post('/api/slides/template').send({ templateId: 'g_desconhecido' });
    expect(res.status).toBe(400);
  });

  test('templateId válido persiste a escolha e é devolvido com o nome resolvido', async () => {
    const ag = agent();
    installGammasLookupFetchMock();
    const res = await ag.post('/api/slides/template').send({ templateId: 'g_valido_2' });
    expect(res.status).toBe(200);
    expect(res.body.template).toEqual({ id: 'g_valido_2', title: 'Template Colorido' });
  });
});

describe('GET /api/slides/parametros com GAMMA_TEMPLATE_IDS configurada', () => {
  test('sem estilo visual selecionado retorna 400 pedindo estilo visual (antes do template)', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);
    const res = await ag.get('/api/slides/parametros?index=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/estilo visual/i);
  });

  test('com estilo visual mas sem template selecionado retorna 400 pedindo template', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);
    await selecionarEstiloVisual(ag);
    const res = await ag.get('/api/slides/parametros?index=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/template/i);
  });

  test('com estilo visual e template selecionados segue o fluxo normal', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);
    await selecionarEstiloVisual(ag);
    installGammasLookupFetchMock();
    await ag.post('/api/slides/template').send({ templateId: 'g_valido_1' });

    const res = await ag.get('/api/slides/parametros?index=0');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/slides/gerar com template selecionado', () => {
  test('chama POST /generations/from-template com gammaId e prompt combinado', async () => {
    const ag = agent();
    const pastaProjeto = await configurarCursoComConteudo(ag, [
      { titulo: 'Memórias RAM e ROM', modulo: '', objetivos: 'Definir RAM e ROM' }
    ]);
    await selecionarEstiloVisual(ag);
    installGammasLookupFetchMock();
    await ag.post('/api/slides/template').send({ templateId: 'g_valido_1' });
    await ag.post('/api/slides/parametros').send({ index: 0, texto: 'capriche nas cores', quantidade: 4 });

    const calls = installGammaTemplateFlowFetchMock();
    const res = await collectSSE(ag, '/api/slides/gerar');
    const events = parseSSE(res.body);
    const done = events.find(e => e.type === 'done');

    expect(done).toBeDefined();
    expect(done.numero).toBe('01');

    const criacao = calls.find(c => c.url.endsWith('/generations/from-template') && c.options.method === 'POST');
    expect(criacao).toBeDefined();
    const payload = JSON.parse(criacao.options.body);

    expect(payload.gammaId).toBe('g_valido_1');
    expect(payload.exportAs).toBe('pptx');
    expect(payload.numCards).toBeUndefined();
    expect(payload.textOptions).toBeUndefined();
    expect(payload.cardOptions).toBeUndefined();
    expect(payload.prompt).toContain('Preserve as logo');
    expect(payload.prompt).toContain('exatamente 4');
    expect(payload.prompt).toContain('Memórias RAM e ROM');
    expect(payload.prompt).toContain('capriche nas cores');

    expect(fs.existsSync(path.join(pastaProjeto, 'aula01_slides.pptx'))).toBe(true);
  });
});
