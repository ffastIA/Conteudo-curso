'use strict';

const { criarObservabilidade, mascarar, calcularCusto, amostrado } = require('../../observabilidade');

const ENV_BASE = {
  LANGFUSE_ENABLED: 'true',
  LANGFUSE_HOST: 'http://langfuse.local:3001/',
  LANGFUSE_PUBLIC_KEY: 'pk-lf-publica-123',
  LANGFUSE_SECRET_KEY: 'sk-lf-segredo-456'
};

const logger = () => ({ warn: jest.fn(), log: jest.fn(), error: jest.fn() });
const fetchOk = () => jest.fn(async () => ({ ok: true, status: 200 }));

const attr = (span, chave) => {
  const a = span.attributes.find(x => x.key === chave);
  if (!a) return undefined;
  const v = a.value;
  return v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue;
};

function spansEnviados(fetchImpl) {
  return fetchImpl.mock.calls
    .filter(([url]) => String(url).includes('/otel/v1/traces'))
    .flatMap(([, init]) => JSON.parse(init.body).resourceSpans[0].scopeSpans[0].spans);
}

function gerar(obs, { etapa = 'conteudo', extra = {}, ...overrides } = {}) {
  const ctx = obs.criarContexto({ etapa, sessionId: 'curso-teste', ...extra });
  const resumo = obs.executar(ctx, () => obs.registrarGeneration({
    nome: 'openai.chat', modelo: 'gpt-4o-mini', parametros: { max_tokens: 100 },
    input: [{ role: 'user', content: 'Escreva sobre Node.js' }], output: 'Texto gerado',
    usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
    finishReason: 'stop', inicio: Date.now() - 50, ...overrides
  }));
  return { ctx, resumo };
}

describe('configuração', () => {
  test('desligada sem chaves/host ou sem LANGFUSE_ENABLED: nenhuma requisição', async () => {
    const fetchImpl = fetchOk();
    for (const env of [{}, { ...ENV_BASE, LANGFUSE_ENABLED: 'false' }, { ...ENV_BASE, LANGFUSE_SECRET_KEY: '' }, { ...ENV_BASE, LANGFUSE_HOST: '' }]) {
      const obs = criarObservabilidade({ env, fetchImpl, logger: logger() });
      expect(obs.enabled).toBe(false);
      gerar(obs);
      await obs.flush();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('aceita LANGFUSE_BASE_URL no lugar de LANGFUSE_HOST', () => {
    const { LANGFUSE_HOST, ...semHost } = ENV_BASE;
    const obs = criarObservabilidade({ env: { ...semHost, LANGFUSE_BASE_URL: `${LANGFUSE_HOST}/` }, fetchImpl: fetchOk(), logger: logger() });
    expect(obs.enabled).toBe(true);
    expect(obs.config.host).toBe('http://langfuse.local:3001');
  });

  test('avisa quando LANGFUSE_ENABLED=true mas faltam variáveis', () => {
    const log = logger();
    const { LANGFUSE_HOST, ...semHost } = ENV_BASE;
    criarObservabilidade({ env: semHost, fetchImpl: fetchOk(), logger: log });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('LANGFUSE_HOST'));
  });

  test('padrões: captura em metadados e amostragem 100%', () => {
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl: fetchOk(), logger: logger() });
    expect(obs.config).toMatchObject({ enabled: true, capture: 'metadados', sampleRate: 1, host: 'http://langfuse.local:3001' });
  });
});

describe('envio OTLP ao Langfuse', () => {
  test('POST em /api/public/otel/v1/traces com Basic auth e cabeçalho de ingestão v4', async () => {
    const fetchImpl = fetchOk();
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl, logger: logger() });
    gerar(obs);
    await obs.flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://langfuse.local:3001/api/public/otel/v1/traces');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from('pk-lf-publica-123:sk-lf-segredo-456').toString('base64'));
    expect(init.headers['x-langfuse-ingestion-version']).toBe('4');
    expect(init.signal).toBeInstanceOf(AbortSignal); // timeout curto
  });

  test('generation: tipo, modelo, usage, custo, finish_reason e metadados da etapa', async () => {
    const fetchImpl = fetchOk();
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl, logger: logger() });
    const { ctx } = gerar(obs, { extra: { props: {} } });
    obs.executar(ctx, () => obs.definirContexto({ aula: 3 }));
    await obs.flush();

    const [span] = spansEnviados(fetchImpl);
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(span.parentSpanId).toBe(ctx.rootSpanId);
    expect(attr(span, 'langfuse.observation.type')).toBe('generation');
    expect(attr(span, 'langfuse.observation.model.name')).toBe('gpt-4o-mini');
    expect(JSON.parse(attr(span, 'langfuse.observation.usage_details'))).toEqual({ input: 1000, output: 500, total: 1500 });
    // 1000×0,15/1M + 500×0,6/1M
    expect(JSON.parse(attr(span, 'langfuse.observation.cost_details')).total).toBeCloseTo(0.00045, 8);
    expect(attr(span, 'langfuse.observation.metadata.finish_reason')).toBe('stop');
    expect(attr(span, 'langfuse.observation.metadata.etapa')).toBe('conteudo');
    expect(attr(span, 'langfuse.observation.level')).toBe('DEFAULT');
  });

  test('custo do app coincide com o calculado a partir do usage e é acumulado no contexto', () => {
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl: fetchOk(), logger: logger() });
    const { ctx, resumo } = gerar(obs);
    const esperado = calcularCusto({ prompt_tokens: 1000, completion_tokens: 500 }, 'gpt-4o-mini');
    expect(resumo.custoUsd).toBeCloseTo(esperado, 10);
    expect(ctx.custoUsd).toBeCloseTo(esperado, 10);
    expect(ctx.tokens).toEqual({ entrada: 1000, saida: 500, total: 1500 });
  });

  test('span raiz no fim do trace: nome da etapa, sessão do projeto e totais', async () => {
    const fetchImpl = fetchOk();
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl, logger: logger() });
    const { ctx } = gerar(obs);
    obs.finalizarContexto(ctx);
    await obs.flush();

    const spans = spansEnviados(fetchImpl);
    const raiz = spans.find(s => s.spanId === ctx.rootSpanId);
    expect(raiz.parentSpanId).toBeUndefined();
    expect(attr(raiz, 'langfuse.trace.name')).toBe('conteudo');
    expect(attr(raiz, 'langfuse.session.id')).toBe('curso-teste');
    expect(attr(raiz, 'langfuse.trace.metadata.tokens_total')).toBe('1500');
  });

  test('spans de chamadas externas (Gamma/HeyGen) trazem status e duração', async () => {
    const fetchImpl = fetchOk();
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl, logger: logger() });
    const ctx = obs.criarContexto({ etapa: 'video-avatar_gerar' });
    obs.executar(ctx, () => {
      obs.registrarSpan({ nome: 'heygen.get.v3/videos', inicio: Date.now() - 20, status: 200 });
      obs.registrarSpan({ nome: 'gamma.post.generations', inicio: Date.now() - 20, erro: 'HTTP 503', status: 503 });
    });
    await obs.flush();

    const [ok, falha] = spansEnviados(fetchImpl);
    expect(attr(ok, 'langfuse.observation.metadata.http_status')).toBe('200');
    expect(ok.status.code).toBe(1);
    expect(attr(ok, 'langfuse.observation.metadata.duracao_ms')).toBeDefined();
    expect(falha.status.code).toBe(2);
    expect(attr(falha, 'langfuse.observation.level')).toBe('ERROR');
  });

  test('score do trace vai para /api/public/scores', async () => {
    const fetchImpl = fetchOk();
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl, logger: logger() });
    const ctx = obs.criarContexto({ etapa: 'revisao-qualidade' });
    obs.executar(ctx, () => obs.registrarScore('nota_aula', 0.82, { comentario: 'Aula 1' }));
    await obs.flush();

    const [url, init] = fetchImpl.mock.calls.find(([u]) => String(u).includes('/scores'));
    expect(url).toBe('http://langfuse.local:3001/api/public/scores');
    expect(JSON.parse(init.body)).toEqual({ traceId: ctx.traceId, name: 'nota_aula', value: 0.82, dataType: 'NUMERIC', comment: 'Aula 1' });
  });
});

describe('resiliência: o Langfuse nunca interrompe nem atrasa a geração', () => {
  test('registrar não espera a rede: fetch pendente para sempre não bloqueia', async () => {
    const fetchImpl = jest.fn(() => new Promise(() => {}));
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl, logger: logger() });
    const t0 = Date.now();
    const { resumo } = gerar(obs);
    expect(resumo).toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(100);
  });

  test('erro de rede no envio vira só um aviso e flush resolve', async () => {
    const log = logger();
    const fetchImpl = jest.fn(async () => { throw new Error('ECONNREFUSED'); });
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl, logger: log });
    gerar(obs);
    await expect(obs.flush()).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });

  test('resposta 401/500 do Langfuse também é só aviso', async () => {
    const log = logger();
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl: jest.fn(async () => ({ ok: false, status: 401 })), logger: log });
    gerar(obs);
    await obs.flush();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('401'));
  });

  test('fila limitada em 1000 eventos (descarta os mais antigos)', () => {
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl: jest.fn(() => new Promise(() => {})), logger: logger() });
    for (let i = 0; i < 1100; i++) gerar(obs);
    expect(obs._fila.length).toBeLessThanOrEqual(1000);
  });

  test('flush e shutdown esvaziam a fila em lotes', async () => {
    const fetchImpl = fetchOk();
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl, logger: logger() });
    for (let i = 0; i < 120; i++) gerar(obs);
    await obs.shutdown();
    expect(obs._fila).toHaveLength(0);
    expect(spansEnviados(fetchImpl)).toHaveLength(120);
  });
});

describe('privacidade', () => {
  const entrada = [{ role: 'user', content: 'Contato: ana@empresa.com, chave sk-abcdefghijklmnop1234, arquivo C:\\Users\\ana\\curso\\.env e /home/ana/projeto' }];

  test('modo metadados (padrão): nenhum texto de prompt/resposta, só tamanhos', async () => {
    const fetchImpl = fetchOk();
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl, logger: logger() });
    gerar(obs, { input: entrada, output: 'resposta secreta do modelo' });
    await obs.flush();

    const corpo = fetchImpl.mock.calls[0][1].body;
    const [span] = spansEnviados(fetchImpl);
    expect(attr(span, 'langfuse.observation.input')).toBeUndefined();
    expect(attr(span, 'langfuse.observation.output')).toBeUndefined();
    expect(corpo).not.toContain('resposta secreta');
    expect(corpo).not.toContain('ana@empresa.com');
    expect(Number(attr(span, 'langfuse.observation.metadata.entrada_chars'))).toBeGreaterThan(0);
    expect(Number(attr(span, 'langfuse.observation.metadata.saida_chars'))).toBe('resposta secreta do modelo'.length);
  });

  test('modo completo envia o texto, mas mascara e-mails, tokens e caminhos', async () => {
    const fetchImpl = fetchOk();
    const obs = criarObservabilidade({ env: { ...ENV_BASE, LANGFUSE_CAPTURE: 'completo' }, fetchImpl, logger: logger() });
    gerar(obs, { input: entrada, output: 'ok' });
    await obs.flush();

    const [span] = spansEnviados(fetchImpl);
    const input = attr(span, 'langfuse.observation.input');
    expect(input).toContain('[email]');
    expect(input).toContain('[token]');
    expect(input).toContain('[caminho]');
    for (const segredo of ['ana@empresa.com', 'sk-abcdefghijklmnop1234', 'C:\\\\Users', '/home/ana']) {
      expect(input).not.toContain(segredo);
    }
  });

  test('as chaves do Langfuse nunca aparecem no payload', async () => {
    const fetchImpl = fetchOk();
    const obs = criarObservabilidade({ env: { ...ENV_BASE, LANGFUSE_CAPTURE: 'completo' }, fetchImpl, logger: logger() });
    gerar(obs);
    await obs.flush();
    const corpo = fetchImpl.mock.calls[0][1].body;
    expect(corpo).not.toContain('sk-lf-segredo-456');
    expect(corpo).not.toContain('pk-lf-publica-123');
  });

  test('mascarar: e-mail, tokens, Bearer, key=valor e caminhos', () => {
    expect(mascarar('mail a@b.co')).toBe('mail [email]');
    expect(mascarar('Authorization: Bearer abc.def-123')).toBe('Authorization: Bearer [token]');
    expect(mascarar('api_key=XYZ123')).toBe('api_key=[oculto]');
    expect(mascarar('em /Users/ana/x/y.txt')).toBe('em [caminho]');
    expect(mascarar('em C:/Users/ana/x')).toBe('em [caminho]');
    expect(mascarar('texto normal sem segredo')).toBe('texto normal sem segredo');
  });
});

describe('amostragem', () => {
  test('taxa 0: nada é enviado, mas falha e aula incompleta são sempre capturadas', async () => {
    const fetchImpl = fetchOk();
    const obs = criarObservabilidade({ env: { ...ENV_BASE, LANGFUSE_SAMPLE_RATE: '0' }, fetchImpl, logger: logger() });
    gerar(obs);
    expect(obs._fila).toHaveLength(0);
    gerar(obs, { erro: 'timeout' });
    gerar(obs, { finishReason: 'length' });
    await obs.flush();

    const spans = spansEnviados(fetchImpl);
    expect(spans).toHaveLength(2);
    expect(spans.map(s => attr(s, 'langfuse.observation.level')).sort()).toEqual(['ERROR', 'WARNING']);
  });

  test('decisão determinística por trace e respeito à taxa', () => {
    expect(amostrado('ffffffff' + '0'.repeat(24), 0.5)).toBe(false);
    expect(amostrado('00000000' + '0'.repeat(24), 0.5)).toBe(true);
    expect(amostrado('abc', 1)).toBe(true);
    expect(amostrado('abc', 0)).toBe(false);
  });

  test('tokens e custo são acumulados no contexto mesmo quando a amostragem descarta o envio', () => {
    const obs = criarObservabilidade({ env: { ...ENV_BASE, LANGFUSE_SAMPLE_RATE: '0' }, fetchImpl: fetchOk(), logger: logger() });
    const { ctx } = gerar(obs);
    expect(ctx.tokens.total).toBe(1500);
    expect(ctx.custoUsd).toBeGreaterThan(0);
  });
});

describe('calcularCusto', () => {
  test('usa o preço do modelo (prefixo mais longo) e devolve null para modelo desconhecido', () => {
    const usage = { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 };
    expect(calcularCusto(usage, 'gpt-4o-mini-2024-07-18')).toBeCloseTo(0.75, 6);
    expect(calcularCusto(usage, 'gpt-4o')).toBeCloseTo(12.5, 6);
    expect(calcularCusto(usage, 'modelo-desconhecido')).toBeNull();
    expect(calcularCusto(undefined, 'gpt-4o')).toBeNull();
  });
});

describe('envolverStream', () => {
  test('repassa os chunks intactos e entrega texto, usage e finish_reason ao terminar', async () => {
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl: fetchOk(), logger: logger() });
    const chunks = [
      { choices: [{ delta: { content: 'Olá ' } }] },
      { choices: [{ delta: { content: 'mundo' }, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }
    ];
    async function* fonte() { for (const c of chunks) yield c; }
    const aoTerminar = jest.fn();

    const recebidos = [];
    for await (const c of obs.envolverStream(fonte(), aoTerminar)) recebidos.push(c);

    expect(recebidos).toEqual(chunks);
    expect(aoTerminar).toHaveBeenCalledWith({ texto: 'Olá mundo', usage: chunks[2].usage, finishReason: 'stop', erro: null });
  });

  test('erro no meio do stream é repassado e o resumo registra a falha', async () => {
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl: fetchOk(), logger: logger() });
    async function* fonte() { yield { choices: [{ delta: { content: 'parcial' } }] }; throw new Error('stall'); }
    const aoTerminar = jest.fn();
    await expect((async () => { for await (const _ of obs.envolverStream(fonte(), aoTerminar)) { /* consome */ } })()).rejects.toThrow('stall');
    expect(aoTerminar).toHaveBeenCalledWith(expect.objectContaining({ texto: 'parcial', erro: expect.any(Error) }));
  });

  test('exceção no callback de observabilidade não quebra o consumidor', async () => {
    const obs = criarObservabilidade({ env: ENV_BASE, fetchImpl: fetchOk(), logger: logger() });
    async function* fonte() { yield { choices: [{ delta: { content: 'x' } }] }; }
    const recebidos = [];
    for await (const c of obs.envolverStream(fonte(), () => { throw new Error('bug na observabilidade'); })) recebidos.push(c);
    expect(recebidos).toHaveLength(1);
  });
});
