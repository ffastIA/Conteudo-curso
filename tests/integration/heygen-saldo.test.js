'use strict';

// Saldo da carteira HeyGen, consumo por vídeo (saldo inicial − saldo final), botão
// "Atualizar saldo" e envio ao Langfuse (change observabilidade-heygen).
jest.mock('openai');

// Lidos do env na carga do módulo: Langfuse ligado (host fictício, fetch simulado) e polling curto.
process.env.LANGFUSE_ENABLED = 'true';
process.env.LANGFUSE_HOST = 'http://langfuse.test:3001';
process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-teste-publica';
process.env.LANGFUSE_SECRET_KEY = 'sk-lf-teste-segredo';
process.env.LANGFUSE_CAPTURE = 'metadados';
process.env.HEYGEN_POLL_INTERVAL_MS = '20';
process.env.HEYGEN_POLL_TIMEOUT_MS = '600';
process.env.HEYGEN_AVATAR_IDS = '';
process.env.HEYGEN_VOICE_IDS = '';

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const EMAIL_DA_CONTA = 'conta.secreta@exemplo.com';
const USUARIO_DA_CONTA = 'usuario-interno-9f8e7d';

let contadorCursos = 0;
function baseConfig(pastaProjeto, nome) {
  return {
    nome,
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

let envios; // chamadas capturadas ao Langfuse
let saldos; // fila de respostas de GET /v3/users/me ("padrão" repete a última)
let chamadasSaldo;

// Cada item de `fila`: número (saldo em USD), 'erro500', 'semcarteira' ou 'rede'.
function respostaSaldo(item) {
  if (item === 'erro500') return { ok: false, status: 500, text: async () => 'falha' };
  if (item === 'rede') throw new Error('ECONNRESET');
  const data = item === 'semcarteira'
    ? { billing_type: 'subscription', email: EMAIL_DA_CONTA, username: USUARIO_DA_CONTA }
    : {
        billing_type: 'wallet', email: EMAIL_DA_CONTA, first_name: 'Nome', username: USUARIO_DA_CONTA,
        wallet: { auto_reload: { enabled: false }, currency: 'usd', remaining_balance: item }
      };
  return { ok: true, status: 200, json: async () => ({ data }) };
}

function instalarFetch({ fila = [7.45, 6.95], pendingRounds = 0 } = {}) {
  saldos = [...fila];
  chamadasSaldo = 0;
  envios = [];
  let polls = 0;
  global.fetch = jest.fn(async (url, options = {}) => {
    const u = String(url);
    if (u.startsWith('http://langfuse.test:3001')) {
      envios.push({ url: u, body: JSON.parse(options.body) });
      return { ok: true, status: 200 };
    }
    if (u.endsWith('/v3/users/me')) {
      chamadasSaldo += 1;
      const item = saldos.length > 1 ? saldos.shift() : saldos[0];
      return respostaSaldo(item);
    }
    if (u.endsWith('/v3/videos') && options.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ data: { video_id: 'vid-abc123', status: 'waiting' } }) };
    }
    if (/\/v3\/videos\/[^/]+$/.test(u)) {
      polls += 1;
      if (polls <= pendingRounds) return { ok: true, status: 200, json: async () => ({ data: { status: 'processing' } }) };
      return { ok: true, status: 200, json: async () => ({ data: { status: 'completed', video_url: 'https://heygen-video.example.com/fake.mp4' } }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('MP4-FAKE-BYTES') };
  });
}

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

async function prepararCurso(aulas = 1) {
  const ag = request.agent(app);
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-heygen-saldo-'));
  const nome = `Curso de Saldo HeyGen ${++contadorCursos}`;
  await ag.post('/api/config').send(baseConfig(pasta, nome));
  OpenAI.__setResponses([JSON.stringify({ aulas: Array.from({ length: aulas }, (_, i) => ({ titulo: `Aula ${i + 1}`, modulo: '', objetivos: 'Obj' })) })]);
  await sse(ag, '/api/conteudo');
  await ag.post('/api/heygen/config').send({ avatarId: 'av_123', avatarName: 'Ana', avatarType: 'studio_avatar', voiceId: 'voice_123', voiceName: 'Voz', expressiveness: null, motionPrompt: '' });
  for (let i = 0; i < aulas; i++) {
    await ag.post('/api/video-avatar/parametros').send({ index: i, segundos: 30 });
    OpenAI.__setResponse('Texto de fala gerado para a aula.');
    await sse(ag, `/api/video-avatar/roteiro/gerar?index=${i}`);
  }
  return { ag, pasta, nome };
}

const spansOtlp = () => envios
  .filter(e => e.url.endsWith('/api/public/otel/v1/traces'))
  .flatMap(e => e.body.resourceSpans[0].scopeSpans[0].spans);
const scores = () => envios.filter(e => e.url.endsWith('/api/public/scores')).map(e => e.body);
const attr = (span, chave) => {
  const a = span.attributes.find(x => x.key === chave);
  return a ? (a.value.stringValue ?? a.value.intValue ?? a.value.doubleValue ?? a.value.boolValue) : undefined;
};
const lerProjeto = (pasta) => JSON.parse(fs.readFileSync(path.join(pasta, 'scr', 'projeto.json'), 'utf-8'));

beforeEach(() => { OpenAI.__reset(); process.env.HEYGEN_SALDO_INTERVALO_MS = '0'; process.env.HEYGEN_SALDO_TENTATIVAS = '3'; });
afterEach(async () => { await app.obs.flush(); delete global.fetch; });

describe('GET /api/heygen/saldo', () => {
  test('conta com carteira: só saldo, moeda e recarga — sem e-mail nem usuário', async () => {
    instalarFetch({ fila: [7.45] });
    const res = await request(app).get('/api/heygen/saldo');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ disponivel: true, saldoUsd: 7.45, moeda: 'usd', tipoCobranca: 'wallet', recargaAutomatica: false });
    expect(res.body.alertaUsd).toBe(2);
    const bruto = JSON.stringify(res.body);
    expect(bruto).not.toContain(EMAIL_DA_CONTA);
    expect(bruto).not.toContain(USUARIO_DA_CONTA);
    expect(bruto).not.toContain('test-heygen-key');
  });

  test('a leitura da tela não gera span nem trace no Langfuse', async () => {
    instalarFetch({ fila: [7.45] });
    await request(app).get('/api/heygen/saldo');
    await app.obs.flush();
    expect(spansOtlp()).toHaveLength(0);
  });

  test('conta que não é carteira, HTTP 500 e falha de rede viram disponivel:false, sem erro HTTP', async () => {
    for (const item of ['semcarteira', 'erro500', 'rede']) {
      instalarFetch({ fila: [item] });
      const res = await request(app).get('/api/heygen/saldo');
      expect(res.status).toBe(200);
      expect(res.body.disponivel).toBe(false);
      expect(res.body.motivo).toBeTruthy();
      expect(JSON.stringify(res.body)).not.toContain(EMAIL_DA_CONTA);
    }
  });
});

describe('geração do vídeo: saldo inicial, final e consumo', () => {
  test('consumo = saldo inicial − saldo final, no done, no projeto.json e no total do projeto', async () => {
    const { ag, pasta } = await prepararCurso();
    instalarFetch({ fila: [7.45, 6.95] });
    const eventos = await sse(ag, '/api/video-avatar/gerar?index=0');

    const done = eventos.find(e => e.type === 'done');
    expect(done.heygen).toMatchObject({ saldoInicialUsd: 7.45, saldoFinalUsd: 6.95, consumoUsd: 0.5, moeda: 'usd', apurado: true, origem: 'automatica' });
    expect(done.heygen.traceId).toBeUndefined();
    expect(done.custoHeygenUsd).toBe(0.5);
    const saldosSse = eventos.filter(e => e.type === 'saldo-heygen');
    expect(saldosSse.map(e => [e.fase, e.saldoUsd])).toEqual([['inicial', 7.45], ['final', 6.95]]);

    const projeto = lerProjeto(pasta);
    expect(projeto.custoHeygenUsd).toBe(0.5);
    expect(projeto.videosAvatarGerados[0].heygen).toMatchObject({ saldoInicialUsd: 7.45, saldoFinalUsd: 6.95, consumoUsd: 0.5, apurado: true });
    expect(projeto.geracoesExternas?.heygen?.['01']).toBeUndefined();
    expect(fs.existsSync(path.join(pasta, 'videos', 'aula01_video.mp4'))).toBe(true);
  });

  test('o saldo inicial é lido no servidor imediatamente antes de criar o vídeo', async () => {
    const { ag } = await prepararCurso();
    instalarFetch({ fila: [7.45, 6.95] });
    await sse(ag, '/api/video-avatar/gerar?index=0');
    const ordem = global.fetch.mock.calls.map(([u, o]) => (String(u).endsWith('/v3/users/me') ? 'saldo' : String(u).endsWith('/v3/videos') && o?.method === 'POST' ? 'criar' : null)).filter(Boolean);
    expect(ordem.slice(0, 2)).toEqual(['saldo', 'criar']);
  });

  test('cobrança atrasada: relê o saldo até a diferença aparecer', async () => {
    const { ag } = await prepararCurso();
    instalarFetch({ fila: [7.45, 7.45, 6.95] });
    const eventos = await sse(ag, '/api/video-avatar/gerar?index=0');
    expect(eventos.find(e => e.type === 'done').heygen).toMatchObject({ consumoUsd: 0.5, apurado: true });
    expect(chamadasSaldo).toBe(3);
  });

  test('saldo que não baixa: consumo não apurado (nunca 0), vídeo entregue, sem score e fora do total', async () => {
    const { ag, pasta } = await prepararCurso();
    instalarFetch({ fila: [7.45] });
    const eventos = await sse(ag, '/api/video-avatar/gerar?index=0');
    await app.obs.flush();

    const done = eventos.find(e => e.type === 'done');
    expect(done.heygen.apurado).toBe(false);
    expect(done.heygen.consumoUsd).toBeUndefined();
    expect(done.heygen.motivo).toMatch(/ainda não refletido/);
    expect(done.custoHeygenUsd).toBe(0);
    expect(fs.existsSync(path.join(pasta, 'videos', 'aula01_video.mp4'))).toBe(true);
    expect(scores()).toHaveLength(0);
    const video = spansOtlp().find(s => s.name === 'heygen.video');
    expect(attr(video, 'langfuse.observation.metadata.apurado')).toBe(false);
  });

  test('saldo indisponível não impede a geração', async () => {
    const { ag } = await prepararCurso();
    instalarFetch({ fila: ['erro500'] });
    const eventos = await sse(ag, '/api/video-avatar/gerar?index=0');
    const done = eventos.find(e => e.type === 'done');
    expect(done).toBeDefined();
    expect(done.heygen).toMatchObject({ apurado: false, saldoInicialUsd: null });
    expect(eventos.some(e => e.type === 'error')).toBe(false);
  });

  test('retomada sem saldo inicial gravado: não apurado, e o saldo de agora não vira inicial', async () => {
    const { ag, nome } = await prepararCurso();
    const sess = Object.values(app.sessions).find(s => s.config?.nome === nome);
    sess.geracoesExternas = { heygen: { '01': { id: 'vid-abc123', criadoEm: new Date().toISOString() } } };
    instalarFetch({ fila: [6.95] });
    const eventos = await sse(ag, '/api/video-avatar/gerar?index=0');
    const done = eventos.find(e => e.type === 'done');
    expect(done.heygen).toMatchObject({ apurado: false, saldoInicialUsd: null, saldoFinalUsd: 6.95, motivo: 'saldo inicial desconhecido' });
    expect(chamadasSaldo).toBe(1); // só a leitura final: a inicial não é refeita na retomada
  });

  test('retomada com saldo inicial gravado calcula o consumo do mesmo vídeo', async () => {
    const { ag, nome } = await prepararCurso();
    const sess = Object.values(app.sessions).find(s => s.config?.nome === nome);
    sess.geracoesExternas = { heygen: { '01': { id: 'vid-abc123', criadoEm: new Date().toISOString(), saldoInicialUsd: 7.45, moeda: 'usd' } } };
    instalarFetch({ fila: [6.95] });
    const eventos = await sse(ag, '/api/video-avatar/gerar?index=0');
    expect(eventos.find(e => e.type === 'done').heygen).toMatchObject({ saldoInicialUsd: 7.45, consumoUsd: 0.5, apurado: true });
  });

  test('segundo vídeo simultâneo na mesma sessão é recusado sem chamar o HeyGen', async () => {
    const { ag } = await prepararCurso(2);
    instalarFetch({ fila: [7.45, 6.95], pendingRounds: 8 });
    const primeiro = sse(ag, '/api/video-avatar/gerar?index=0');
    await new Promise(r => setTimeout(r, 60));
    const criacoesAntes = global.fetch.mock.calls.filter(([u, o]) => String(u).endsWith('/v3/videos') && o?.method === 'POST').length;
    const segundo = await sse(ag, '/api/video-avatar/gerar?index=1');
    expect(segundo.find(e => e.type === 'error').message).toMatch(/já existe um vídeo/i);
    const criacoesDepois = global.fetch.mock.calls.filter(([u, o]) => String(u).endsWith('/v3/videos') && o?.method === 'POST').length;
    expect(criacoesDepois).toBe(criacoesAntes);
    expect((await primeiro).some(e => e.type === 'done')).toBe(true);
    // liberado ao terminar: outra geração volta a ser aceita
    instalarFetch({ fila: [6.95, 6.45] });
    expect((await sse(ag, '/api/video-avatar/gerar?index=1')).some(e => e.type === 'done')).toBe(true);
  });
});

describe('Langfuse', () => {
  test('spans, metadado do trace e score com os mesmos números da tela, sem dados pessoais', async () => {
    const { ag } = await prepararCurso();
    instalarFetch({ fila: [7.45, 6.95] });
    const eventos = await sse(ag, '/api/video-avatar/gerar?index=0');
    await app.obs.flush();
    const done = eventos.find(e => e.type === 'done');

    const spans = spansOtlp();
    const leituras = spans.filter(s => s.name === 'heygen.saldo');
    expect(leituras.map(s => attr(s, 'langfuse.observation.metadata.fase'))).toEqual(['inicial', 'final']);
    expect(leituras.map(s => attr(s, 'langfuse.observation.metadata.saldo_usd'))).toEqual([7.45, 6.95]);

    const video = spans.find(s => s.name === 'heygen.video');
    expect(attr(video, 'langfuse.observation.metadata.video_id')).toBe('vid-abc123');
    expect(Number(attr(video, 'langfuse.observation.metadata.aula'))).toBe(1);
    expect(attr(video, 'langfuse.observation.metadata.saldo_inicial_usd')).toBe(7.45);
    expect(attr(video, 'langfuse.observation.metadata.saldo_final_usd')).toBe(6.95);
    expect(attr(video, 'langfuse.observation.metadata.consumo_usd')).toBe(done.heygen.consumoUsd);
    expect(attr(video, 'langfuse.observation.metadata.apurado')).toBe(true);

    // chamadas HTTP ao HeyGen continuam como spans automáticos; o saldo também
    expect(spans.some(s => s.name === 'heygen.get.v3/users/me')).toBe(true);

    const raiz = spans.find(s => !s.parentSpanId && attr(s, 'langfuse.trace.name') === 'video-avatar_gerar');
    expect(attr(raiz, 'langfuse.trace.metadata.custo_heygen_usd')).toBe(0.5);
    expect(Number(attr(raiz, 'langfuse.trace.metadata.custo_usd'))).toBe(0); // LLM separado do HeyGen

    const notas = scores();
    expect(notas).toHaveLength(1);
    expect(notas[0]).toMatchObject({ name: 'heygen_consumo_usd', value: 0.5, dataType: 'NUMERIC' });
    expect(notas[0].traceId).toBe(raiz.traceId);

    const tudo = JSON.stringify(envios);
    for (const proibido of [EMAIL_DA_CONTA, USUARIO_DA_CONTA, 'test-heygen-key', 'Texto de fala gerado']) expect(tudo).not.toContain(proibido);
  });

  test('Langfuse fora do ar não afeta a geração nem o consumo', async () => {
    const { ag } = await prepararCurso();
    instalarFetch({ fila: [7.45, 6.95] });
    const original = global.fetch;
    global.fetch = jest.fn(async (u, o) => {
      if (String(u).startsWith('http://langfuse.test:3001')) throw new Error('ECONNREFUSED langfuse');
      return original(u, o);
    });
    const eventos = await sse(ag, '/api/video-avatar/gerar?index=0');
    expect(eventos.find(e => e.type === 'done').heygen.consumoUsd).toBe(0.5);
  });
});

describe('POST /api/heygen/saldo/atualizar (botão "Atualizar saldo")', () => {
  async function videoNaoApurado() {
    const ctx = await prepararCurso();
    instalarFetch({ fila: [7.45] });
    await sse(ctx.ag, '/api/video-avatar/gerar?index=0');
    await app.obs.flush();
    return ctx;
  }

  test('sem número: apenas relê o saldo e informa o resumo', async () => {
    instalarFetch({ fila: [5.1] });
    const res = await request(app).post('/api/heygen/saldo/atualizar').send({});
    expect(res.body).toMatchObject({ disponivel: true, saldoUsd: 5.1, custoHeygenUsd: expect.any(Number) });
    expect(res.body.apuracao).toBeUndefined();
  });

  test('completa a apuração quando o saldo baixou, grava, soma no total e envia o score ao trace original', async () => {
    const { ag, pasta } = await videoNaoApurado();
    const traceOriginal = lerProjeto(pasta).videosAvatarGerados[0].heygen.traceId;
    expect(traceOriginal).toBeTruthy();
    envios = [];
    instalarFetch({ fila: [6.95] });
    const res = await ag.post('/api/heygen/saldo/atualizar').send({ numero: '01' });
    await app.obs.flush();

    expect(res.body.apuracao.resultado).toBe('apurado');
    expect(res.body.apuracao.heygen).toMatchObject({ saldoInicialUsd: 7.45, saldoFinalUsd: 6.95, consumoUsd: 0.5, apurado: true, origem: 'manual' });
    expect(res.body.custoHeygenUsd).toBe(0.5);
    const projeto = lerProjeto(pasta);
    expect(projeto.custoHeygenUsd).toBe(0.5);
    expect(projeto.videosAvatarGerados[0].heygen.origem).toBe('manual');

    const notas = scores();
    expect(notas).toHaveLength(1);
    expect(notas[0]).toMatchObject({ name: 'heygen_consumo_usd', value: 0.5, traceId: traceOriginal });
    expect(spansOtlp()).toHaveLength(0); // nenhum trace novo
  });

  test('saldo ainda não baixou: nada é gravado e a tela pode tentar de novo', async () => {
    const { ag, pasta } = await videoNaoApurado();
    instalarFetch({ fila: [7.45] });
    const res = await ag.post('/api/heygen/saldo/atualizar').send({ numero: '01' });
    expect(res.body.apuracao.resultado).toBe('nao_baixou');
    expect(lerProjeto(pasta).videosAvatarGerados[0].heygen.apurado).toBe(false);
    expect(res.body.custoHeygenUsd).toBe(0);
  });

  test('vídeo já apurado nunca é reescrito', async () => {
    const { ag, pasta } = await prepararCurso();
    instalarFetch({ fila: [7.45, 6.95] });
    await sse(ag, '/api/video-avatar/gerar?index=0');
    instalarFetch({ fila: [1.0] });
    const res = await ag.post('/api/heygen/saldo/atualizar').send({ numero: '01' });
    expect(res.body.apuracao.resultado).toBe('ja_apurado');
    expect(res.body.apuracao.heygen.consumoUsd).toBe(0.5);
    expect(lerProjeto(pasta).videosAvatarGerados[0].heygen.consumoUsd).toBe(0.5);
  });

  test('consumo ambíguo: recusa se outro vídeo foi iniciado depois', async () => {
    const { ag, pasta } = await prepararCurso(2);
    instalarFetch({ fila: [7.45] });
    await sse(ag, '/api/video-avatar/gerar?index=0');
    await new Promise(r => setTimeout(r, 5));
    instalarFetch({ fila: [7.45] });
    await sse(ag, '/api/video-avatar/gerar?index=1');
    instalarFetch({ fila: [6.0] });
    const res = await ag.post('/api/heygen/saldo/atualizar').send({ numero: '01' });
    expect(res.body.apuracao.resultado).toBe('ambiguo');
    expect(lerProjeto(pasta).videosAvatarGerados[0].heygen.apurado).toBe(false);
  });

  test('vídeo sem medição ou sem saldo inicial não é apurado', async () => {
    instalarFetch({ fila: [6.95] });
    const sem = await request.agent(app).post('/api/heygen/saldo/atualizar').send({ numero: '09' });
    expect(sem.body.apuracao.resultado).toBe('nao_encontrado');

    const { ag, nome } = await prepararCurso();
    const sess = Object.values(app.sessions).find(s => s.config?.nome === nome);
    sess.geracoesExternas = { heygen: { '01': { id: 'vid-abc123', criadoEm: new Date().toISOString() } } };
    instalarFetch({ fila: [6.95] });
    await sse(ag, '/api/video-avatar/gerar?index=0');
    const res = await ag.post('/api/heygen/saldo/atualizar').send({ numero: '01' });
    expect(res.body.apuracao.resultado).toBe('sem_saldo_inicial');
  });

  test('saldo indisponível: informa o motivo e não grava', async () => {
    const { ag } = await videoNaoApurado();
    instalarFetch({ fila: ['erro500'] });
    const res = await ag.post('/api/heygen/saldo/atualizar').send({ numero: '01' });
    expect(res.body.disponivel).toBe(false);
    expect(res.body.apuracao.resultado).toBe('saldo_indisponivel');
  });

  test('limite de uma leitura ao HeyGen a cada 3 s: a segunda devolve a última', async () => {
    instalarFetch({ fila: [5.1, 4.0] });
    await request(app).get('/api/heygen/saldo'); // leitura real (intervalo 0): preenche a última leitura
    process.env.HEYGEN_SALDO_INTERVALO_MS = '60000';
    const antes = chamadasSaldo;
    const a = await request(app).post('/api/heygen/saldo/atualizar').send({});
    const b = await request(app).post('/api/heygen/saldo/atualizar').send({});
    expect(chamadasSaldo).toBe(antes);
    expect(a.body.saldoUsd).toBe(5.1);
    expect(b.body.saldoUsd).toBe(5.1);
  });
});

describe('carregar projeto', () => {
  test('restaura o consumo de cada vídeo e o total HeyGen', async () => {
    const { ag, pasta } = await prepararCurso();
    instalarFetch({ fila: [7.45, 6.95] });
    await sse(ag, '/api/video-avatar/gerar?index=0');
    const res = await request(app).post('/api/carregar-projeto').send({ pasta });
    expect(res.status).toBe(200);
    expect(res.body.custoHeygenUsd).toBe(0.5);
    expect(res.body.videosAvatarGerados[0].heygen).toMatchObject({ consumoUsd: 0.5, apurado: true });
  });
});
