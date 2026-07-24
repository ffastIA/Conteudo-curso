'use strict';

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
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

// ── 6.2 / 6.5: GET /api/qualidade sem conteudo → evento SSE error ────────────
describe('GET /api/qualidade', () => {
  test('sem conteudo na sessão emite evento SSE error (não 400 JSON)', async () => {
    const res = await collectSSE(request(app), '/api/qualidade');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSSE(res.body);
    expect(events).toContainEqual({
      type: 'error',
      message: 'Conclua ao menos a Etapa 5 antes de gerar o relatório de qualidade.'
    });
  });
});

// ── 6.6: GET /api/ppc sem conteudo → evento SSE error ────────────────────────
describe('GET /api/ppc', () => {
  test('sem conteudo na sessão emite evento SSE error (não 400 JSON)', async () => {
    const res = await collectSSE(request(app), '/api/ppc');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSSE(res.body);
    expect(events).toContainEqual({
      type: 'error',
      message: 'Conclua a Etapa 5 antes de gerar o PPC.'
    });
  });
});

// ── Pré-condições SSE: recusa chega como evento error, nunca como 400 JSON ──
describe('pré-condições SSE', () => {
  test('GET /api/revisao-qualidade sem conteudo emite evento error', async () => {
    const res = await collectSSE(request(app), '/api/revisao-qualidade');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSSE(res.body);
    expect(events).toContainEqual({
      type: 'error',
      message: 'Conclua a Etapa 5 antes de gerar a revisão de qualidade.'
    });
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

  // ── Contrato JSON de planLessons (response_format: json_object) ───────────
  test('consome o JSON de aulas retornado pelo modelo (planLessons)', async () => {
    // carga=1h / duracao=60min → numAulas=1: evita múltiplas chamadas de plano
    // por aula e mantém a fila de respostas determinística (1 JSON + 1 prosa).
    const config = { ...VALID_CONFIG, carga: '1', duracao: '60' };
    OpenAI.__setResponses([
      JSON.stringify({ aulas: [{ titulo: 'Aula Introdução ao Node', modulo: 'Módulo 1', objetivos: 'Entender o runtime' }] }),
      'Plano detalhado da aula gerado a partir do JSON.'
    ]);
    const ag = agent();
    await ag.post('/api/config').send(config);

    const res = await collectSSE(ag, '/api/plano-aula');
    const events = parseSSE(res.body);
    const doneEvent = events.find(e => e.type === 'done');

    expect(doneEvent).toBeDefined();
    expect(doneEvent.fullText).toContain('Aula Introdução ao Node');
  });
});

// ── Ciclo de melhorias (Etapa 6): happy path de GET .../confirmar ───────────
// Cobre só a metade "confirmar", populando a sessão via /api/conteudo em vez
// do upload de .docx (fallback autorizado pelo plano de referência — o setup
// de upload multipart é frágil e desnecessário para exercitar este handler).
describe('GET /api/aplicar-melhorias/confirmar (SSE)', () => {
  test('com sessão populada completa o ciclo sem evento error', async () => {
    const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-melhorias-'));
    const ag = agent();
    await ag.post('/api/config').send({ ...VALID_CONFIG, pastaProjeto });

    OpenAI.__setResponse('Conteúdo original da aula, com parágrafos regulares para teste.');
    await collectSSE(ag, '/api/conteudo');

    // 1ª chamada: patch da aula (sem <<<SECAO:>>>, tratado como reescrita
    // integral — precisa do heading "### Melhorias Aplicadas" para passar em
    // isRespostaMelhoriasCompleta). 2ª chamada: julgamento de score — texto
    // não-JSON é aceitável: o parse falha, o gate cai para "aceita=false" e
    // preserva o conteúdo anterior, sem lançar erro.
    OpenAI.__setResponses([
      'Conteúdo revisado da aula com pequenos ajustes de clareza.\n\n### Melhorias Aplicadas\n- Ajuste de clareza no parágrafo inicial.',
      'resposta de julgamento não estruturada'
    ]);

    const res = await collectSSE(ag, '/api/aplicar-melhorias/confirmar');
    const events = parseSSE(res.body);
    const types = events.map(e => e.type);

    expect(types).not.toContain('error');
    expect(types).toContain('done');
  });
});

// ── Abort em desconexão do cliente ───────────────────────────────────────────
// Um teste de integração via Supertest destruindo o socket a meio do stream
// seria não-determinístico aqui: o mock da OpenAI resolve e itera de forma
// síncrona (sem delay real entre chunks), então a resposta completa antes que
// a desconexão consiga interceptar o meio do stream. Fallback autorizado pelo
// plano de referência: exercitar streamSkillToClient (exportada) diretamente
// com um `res` fake, verificando que o AbortController interno é encadeado ao
// signal de desconexão e efetivamente abortado.
describe('streamSkillToClient — aborta em desconexão do cliente', () => {
  const { EventEmitter } = require('events');
  const { streamSkillToClient, clientAbort } = require('../../server');

  function fakeRes() {
    const res = new EventEmitter();
    res.writableEnded = false;
    res.write = () => true;
    return res;
  }

  test('desconexão antes da resolução da chamada aborta o signal repassado à OpenAI', async () => {
    OpenAI.__setResponse('texto qualquer usado para simular o stream');
    const res = fakeRes();
    const client = clientAbort(res);
    const skill = { model: 'gpt-4o-mini', system: 'sys', user: 'user' };

    const promise = streamSkillToClient(res, skill, {}, {}, client);
    // Desconexão síncrona, antes de qualquer microtask resolver — equivalente
    // a um refresh/fechamento de aba no meio da geração.
    res.emit('close');

    expect(client.disconnected).toBe(true);
    expect(OpenAI.__lastOptions.signal.aborted).toBe(true);

    await promise; // o mock não observa o abort e completa normalmente — sem crash
  });

  test('sem desconexão, o signal repassado à OpenAI nunca aborta', async () => {
    OpenAI.__setResponse('texto qualquer usado para simular o stream');
    const res = fakeRes();
    const client = clientAbort(res);
    const skill = { model: 'gpt-4o-mini', system: 'sys', user: 'user' };

    await streamSkillToClient(res, skill, {}, {}, client);

    expect(client.disconnected).toBe(false);
    expect(OpenAI.__lastOptions.signal.aborted).toBe(false);
  });
});
