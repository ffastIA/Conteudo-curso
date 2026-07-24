'use strict';

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

function baseConfig(pastaProjeto) {
  return {
    nome: 'Curso de Slides',
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

// Popula sess.conteudoPorAula com N aulas via GET /api/conteudo — a primeira
// chamada (planLessons) é não-streaming em response_format json_object e
// consome o JSON de aulas da fila do mock; as chamadas seguintes (conteúdo de
// cada aula) caem no texto fixo padrão do mock.
async function configurarCursoComConteudo(ag, aulas) {
  const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-slides-'));
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

// Mock de fetch global simulando o fluxo Gamma: POST /generations -> GET
// /generations/{id} (poll) -> GET <exportUrl> (download). Retorna o array de
// chamadas para inspeção (ex.: conferir numCards enviado).
function installGammaFetchMock({ outcome = 'completed', pendingRounds = 0, failMessage = 'Falha simulada no Gamma' } = {}) {
  const calls = [];
  let pollCount = 0;
  global.fetch = jest.fn(async (url, options = {}) => {
    const urlStr = String(url);
    calls.push({ url: urlStr, options });

    if (urlStr.endsWith('/generations') && options.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ generationId: 'gen-abc123' }) };
    }

    if (/\/generations\/[^/]+$/.test(urlStr)) {
      pollCount += 1;
      if (pollCount <= pendingRounds) {
        return { ok: true, status: 200, json: async () => ({ status: 'pending' }) };
      }
      if (outcome === 'failed') {
        return { ok: true, status: 200, json: async () => ({ status: 'failed', error: { message: failMessage } }) };
      }
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

describe('GET /api/slides/parametros', () => {
  test('sem Etapa 5 concluída (conteudoPorAula vazio) retorna 400', async () => {
    const ag = agent();
    const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-slides-'));
    await ag.post('/api/config').send(baseConfig(pastaProjeto));

    const res = await ag.get('/api/slides/parametros?index=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Etapa 5/);
  });

  test('sem estilo visual selecionado retorna 400', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);

    const res = await ag.get('/api/slides/parametros?index=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/estilo visual/i);
  });

  test('índice fora do intervalo retorna 400', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);
    await selecionarEstiloVisual(ag);

    const res = await ag.get('/api/slides/parametros?index=5');
    expect(res.status).toBe(400);
  });

  test('devolve metadados e quantidadePadrao inicial 3', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [
      { titulo: 'Memórias RAM e ROM', modulo: '', objetivos: 'Definir RAM e ROM' }
    ]);
    await selecionarEstiloVisual(ag);

    const res = await ag.get('/api/slides/parametros?index=0');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      index: 0, numero: '01', total: 1, titulo: 'Memórias RAM e ROM',
      observacaoPadrao: '', quantidadePadrao: 3
    });
  });
});

describe('POST /api/slides/parametros', () => {
  test.each([0, 6, 2.5, 'x', null, undefined])('quantidade inválida (%p) retorna 400', async (quantidade) => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    const res = await ag.post('/api/slides/parametros').send({ index: 0, texto: '', quantidade });
    expect(res.status).toBe(400);
  });

  test('quantidade válida (1-5) retorna 200', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    const res = await ag.post('/api/slides/parametros').send({ index: 0, texto: 'obs', quantidade: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

describe('GET /api/slides/gerar', () => {
  test('sem parâmetros aprovados emite evento SSE error', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    const res = await collectSSE(ag, '/api/slides/gerar');
    const events = parseSSE(res.body);
    expect(events.some(e => e.type === 'error')).toBe(true);
  });

  test('curso de 1 aula: gera 1 arquivo, numCards igual à quantidade escolhida, proximoIndex null', async () => {
    const ag = agent();
    const pastaProjeto = await configurarCursoComConteudo(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);
    await selecionarEstiloVisual(ag);
    await ag.post('/api/slides/parametros').send({ index: 0, texto: 'capriche nas cores', quantidade: 4 });

    const calls = installGammaFetchMock({ outcome: 'completed' });
    const res = await collectSSE(ag, '/api/slides/gerar');
    const events = parseSSE(res.body);
    const done = events.find(e => e.type === 'done');

    expect(done).toBeDefined();
    expect(done.numero).toBe('01');
    expect(done.proximoIndex).toBeNull();

    const criacao = calls.find(c => c.url.endsWith('/generations') && c.options.method === 'POST');
    const payload = JSON.parse(criacao.options.body);
    expect(payload.numCards).toBe(4);
    expect(payload.additionalInstructions).toBe('capriche nas cores');
    expect(payload.imageOptions.style).toContain('Pixar-style 3D animated illustration');
    expect(payload.exportAs).toBe('pptx');

    expect(fs.existsSync(path.join(pastaProjeto, 'aula01_slides.pptx'))).toBe(true);
  });

  // GET /api/conteudo aguarda 4s reais entre aulas (rate limiting) — timeout
  // maior para acomodar as 2 pausas do setup de um curso de 3 aulas.
  test('curso de 3 aulas: proximoIndex avança aula a aula e termina null na última', async () => {
    const ag = agent();
    const pastaProjeto = await configurarCursoComConteudo(ag, [
      { titulo: 'Aula 1', modulo: '', objetivos: 'Obj 1' },
      { titulo: 'Aula 2', modulo: '', objetivos: 'Obj 2' },
      { titulo: 'Aula 3', modulo: '', objetivos: 'Obj 3' }
    ]);
    await selecionarEstiloVisual(ag);

    for (let i = 0; i < 3; i++) {
      await ag.post('/api/slides/parametros').send({ index: i, texto: '', quantidade: 2 });
      installGammaFetchMock({ outcome: 'completed' });
      const res = await collectSSE(ag, '/api/slides/gerar');
      const done = parseSSE(res.body).find(e => e.type === 'done');

      expect(done.numero).toBe(String(i + 1).padStart(2, '0'));
      if (i < 2) expect(done.proximoIndex).toBe(i + 1);
      else expect(done.proximoIndex).toBeNull();
    }

    expect(fs.existsSync(path.join(pastaProjeto, 'aula01_slides.pptx'))).toBe(true);
    expect(fs.existsSync(path.join(pastaProjeto, 'aula02_slides.pptx'))).toBe(true);
    expect(fs.existsSync(path.join(pastaProjeto, 'aula03_slides.pptx'))).toBe(true);
  }, 20000);

  test('falha do Gamma emite evento error e não persiste arquivo', async () => {
    const ag = agent();
    const pastaProjeto = await configurarCursoComConteudo(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);
    await selecionarEstiloVisual(ag);
    await ag.post('/api/slides/parametros').send({ index: 0, texto: '', quantidade: 3 });

    installGammaFetchMock({ outcome: 'failed' });
    const res = await collectSSE(ag, '/api/slides/gerar');
    const events = parseSSE(res.body);

    expect(events.some(e => e.type === 'error')).toBe(true);
    expect(events.some(e => e.type === 'done')).toBe(false);
    expect(fs.existsSync(path.join(pastaProjeto, 'aula01_slides.pptx'))).toBe(false);
  });
});
