'use strict';

jest.mock('openai');

// A integração com o Langfuse é lida do env na carga do módulo — precisa estar
// definida ANTES do require('../../server'). O host é fictício: o fetch global
// é mockado e captura o que seria enviado.
process.env.LANGFUSE_ENABLED = 'true';
process.env.LANGFUSE_HOST = 'http://langfuse.test:3001';
process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-teste-publica';
process.env.LANGFUSE_SECRET_KEY = 'sk-lf-teste-segredo';
process.env.LANGFUSE_CAPTURE = 'metadados';
process.env.HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || 'test-key';
process.env.HEYGEN_AVATAR_IDS = '';

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const VALID_CONFIG = {
  nome: 'Curso de Observabilidade',
  publico: 'Desenvolvedores júnior',
  carga: '40',
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender Node.js',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-observabilidade')
};
const GERACAO_LOG = path.join(VALID_CONFIG.pastaProjeto, 'scr', 'geracao_log.json');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

let envios; // chamadas capturadas ao Langfuse
let langfuseFora;

beforeEach(() => {
  OpenAI.__reset();
  fs.rmSync(GERACAO_LOG, { force: true });
  envios = [];
  langfuseFora = false;
  global.fetch = jest.fn(async (url, init) => {
    const u = String(url);
    if (u.startsWith('http://langfuse.test:3001')) {
      if (langfuseFora) throw new Error('ECONNREFUSED langfuse');
      envios.push({ url: u, headers: init.headers, body: JSON.parse(init.body) });
      return { ok: true, status: 200 };
    }
    return { ok: false, status: 404, text: async () => 'not found' };
  });
});

afterEach(async () => {
  await app.obs.flush();
  delete global.fetch;
});

function parseSSE(body) {
  return String(body)
    .split('\n\n')
    .filter(b => b.startsWith('data:'))
    .map(b => { try { return JSON.parse(b.replace(/^data:\s*/, '')); } catch { return null; } })
    .filter(Boolean);
}

async function sse(ag, rota) {
  const res = await ag.get(rota).buffer(true).parse((r, cb) => {
    let data = '';
    r.on('data', c => { data += c.toString(); });
    r.on('end', () => cb(null, data));
  });
  return parseSSE(res.body);
}

const spansOtlp = () => envios
  .filter(e => e.url.endsWith('/api/public/otel/v1/traces'))
  .flatMap(e => e.body.resourceSpans[0].scopeSpans[0].spans);

const attr = (span, chave) => {
  const a = span.attributes.find(x => x.key === chave);
  if (!a) return undefined;
  return a.value.stringValue ?? a.value.intValue ?? a.value.doubleValue ?? a.value.boolValue;
};

async function sessao() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(VALID_CONFIG);
  return ag;
}

describe('toda chamada à OpenAI vira generation com tokens, custo e finish_reason', () => {
  test('chat em streaming (plano de ensino)', async () => {
    OpenAI.__setResponse('plano de ensino gerado pelo mock');
    const ag = await sessao();

    const eventos = await sse(ag, '/api/plano-ensino');
    await app.obs.flush();

    const done = eventos.find(e => e.type === 'done');
    expect(done).toBeDefined();
    const geracoes = spansOtlp().filter(s => attr(s, 'langfuse.observation.type') === 'generation');
    expect(geracoes.length).toBeGreaterThanOrEqual(1);
    const g = geracoes[0];
    expect(attr(g, 'langfuse.observation.model.name')).toBe('gpt-4o-mini');
    expect(JSON.parse(attr(g, 'langfuse.observation.usage_details'))).toEqual({ input: 10, output: 20, total: 30 });
    expect(JSON.parse(attr(g, 'langfuse.observation.cost_details')).total).toBeGreaterThan(0);
    expect(attr(g, 'langfuse.observation.metadata.etapa')).toBe('plano-ensino');
    // modo metadados: nenhum texto de prompt/resposta sai
    expect(attr(g, 'langfuse.observation.input')).toBeUndefined();
    expect(JSON.stringify(envios)).not.toContain('plano de ensino gerado pelo mock');
  });

  test('pesquisa web (Responses API): uma generation por consulta', async () => {
    const ag = await sessao();

    await sse(ag, '/api/search');
    await app.obs.flush();

    const geracoes = spansOtlp().filter(s => attr(s, 'langfuse.observation.type') === 'generation');
    expect(geracoes).toHaveLength(4);
    for (const g of geracoes) {
      expect(attr(g, 'langfuse.observation.model.name')).toBe('gpt-4o');
      expect(attr(g, 'langfuse.observation.metadata.etapa')).toBe('search');
      expect(attr(g, 'langfuse.observation.metadata.consulta')).toMatch(/^c\d$/);
      expect(JSON.parse(attr(g, 'langfuse.observation.usage_details')).total).toBe(30);
    }
  });

  test('o trace usa o id da requisição, a sessão do projeto e fecha com o span raiz', async () => {
    OpenAI.__setResponse('texto');
    const ag = await sessao();

    const eventos = await sse(ag, '/api/plano-ensino');
    await app.obs.flush();

    const done = eventos.find(e => e.type === 'done');
    const spans = spansOtlp();
    const raiz = spans.find(s => attr(s, 'langfuse.trace.name'));
    expect(raiz.traceId).toBe(done.traceId);
    expect(attr(raiz, 'langfuse.trace.name')).toBe('plano-ensino');
    expect(attr(raiz, 'langfuse.session.id')).toBe('Curso_de_Observabilidade');
    expect(spans.filter(s => s.traceId === done.traceId).length).toBeGreaterThanOrEqual(2);
  });

  test('o evento done traz tokens, custo e link do trace; geracao_log.json guarda o traceId', async () => {
    OpenAI.__setResponse('texto');
    const ag = await sessao();

    const eventos = await sse(ag, '/api/plano-ensino');

    const done = eventos.find(e => e.type === 'done');
    expect(done.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(done.tokens).toBeGreaterThan(0);
    expect(done.custoUsd).toBeGreaterThan(0);
    expect(done.traceUrl).toBe(`http://langfuse.test:3001/trace/${done.traceId}`);

    const log = JSON.parse(fs.readFileSync(GERACAO_LOG, 'utf-8'));
    expect(log.some(l => l.traceId === done.traceId && l.etapa === 'plano-ensino' && l.tokens.total === 30)).toBe(true);
  });

  test('cabeçalhos do envio e ausência de segredos no payload', async () => {
    OpenAI.__setResponse('texto');
    const ag = await sessao();
    await sse(ag, '/api/plano-ensino');
    await app.obs.flush();

    const envio = envios.find(e => e.url.endsWith('/otel/v1/traces'));
    expect(envio.headers.Authorization).toBe('Basic ' + Buffer.from('pk-lf-teste-publica:sk-lf-teste-segredo').toString('base64'));
    expect(envio.headers['x-langfuse-ingestion-version']).toBe('4');
    const bruto = JSON.stringify(envio.body);
    expect(bruto).not.toContain('sk-lf-teste-segredo');
    expect(bruto).not.toContain(VALID_CONFIG.pastaProjeto.replace(/\\/g, '\\\\'));
  });

  test('chamada externa (HeyGen) vira span com status e duração', async () => {
    const ag = await sessao();

    await ag.get('/api/heygen/avatares'); // v3 e v2 respondem 404 no mock → 500
    await app.obs.flush();

    const spans = spansOtlp().filter(s => s.name.startsWith('heygen.get.'));
    expect(spans.length).toBeGreaterThanOrEqual(2);
    expect(spans.map(s => s.name)).toEqual(expect.arrayContaining([
      expect.stringContaining('v3/avatar_groups'), expect.stringContaining('v2/avatar_group.list')
    ]));
    expect(attr(spans[0], 'langfuse.observation.metadata.http_status')).toBe('404');
    expect(attr(spans[0], 'langfuse.observation.metadata.duracao_ms')).toBeDefined();
  });
});

describe('Langfuse fora do ar não afeta a geração', () => {
  test('erro de rede no envio: a etapa termina normalmente e o resultado é o mesmo', async () => {
    langfuseFora = true;
    OpenAI.__setResponse('plano resiliente');
    const ag = await sessao();

    const t0 = Date.now();
    const eventos = await sse(ag, '/api/plano-ensino');
    const decorrido = Date.now() - t0;
    await expect(app.obs.flush()).resolves.toBeUndefined();

    const types = eventos.map(e => e.type);
    expect(types).toContain('done');
    expect(types).not.toContain('error');
    expect(eventos.find(e => e.type === 'done').fullText).toContain('plano resiliente');
    expect(decorrido).toBeLessThan(5000);
  });
});
