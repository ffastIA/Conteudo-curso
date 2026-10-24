'use strict';

jest.mock('openai');

const OpenAI = require('openai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const app = require('../../server');

const { comRateLimit, baixarParaArquivo } = app;

const ENV_ORIGINAL = { ...process.env };
afterEach(() => {
  jest.useRealTimers();
  for (const k of ['RATE_LIMIT_BACKOFF_BASE_MS', 'RATE_LIMIT_MAX_RETENTATIVAS', 'RATE_LIMIT_ESPERA_MAX_MS', 'DOWNLOAD_TIMEOUT_MS', 'MAX_DOWNLOAD_BYTES']) {
    if (ENV_ORIGINAL[k] === undefined) delete process.env[k]; else process.env[k] = ENV_ORIGINAL[k];
  }
});

const erro429 = (headers) => new OpenAI.RateLimitError('Rate limit reached', headers);

// Executa comRateLimit com timers falsos e devolve { resultado, esperas }.
async function rodar(fn, { avancarMs, opcoes = {} } = {}) {
  jest.useFakeTimers();
  const esperas = [];
  const p = comRateLimit(fn, { aoEsperar: (seg, n, motivo) => esperas.push({ seg, n, motivo }), ...opcoes });
  const settled = p.then(v => ({ ok: v }), e => ({ erro: e }));
  if (avancarMs) await jest.advanceTimersByTimeAsync(avancarMs);
  return { desfecho: await settled, esperas };
}

describe('comRateLimit — espera adaptativa em 429', () => {
  test('respeita o cabeçalho retry-after (segundos): espera 7 s, e só 7 s, antes de repetir', async () => {
    jest.useFakeTimers();
    const fn = jest.fn()
      .mockRejectedValueOnce(erro429({ 'retry-after': '7' }))
      .mockResolvedValueOnce('ok');
    const esperas = [];
    const p = comRateLimit(fn, { aoEsperar: (seg) => esperas.push(seg) });
    await jest.advanceTimersByTimeAsync(6999);
    expect(fn).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(esperas).toEqual([7]);
  });

  test('retry-after-ms tem prioridade sobre retry-after', async () => {
    jest.useFakeTimers();
    const fn = jest.fn()
      .mockRejectedValueOnce(erro429({ 'retry-after-ms': '1500', 'retry-after': '30' }))
      .mockResolvedValueOnce('ok');
    const p = comRateLimit(fn, {});
    await jest.advanceTimersByTimeAsync(1500);
    await expect(p).resolves.toBe('ok');
  });

  test('aceita retry-after como data HTTP e cabeçalhos no formato Headers (get)', async () => {
    jest.useFakeTimers();
    const data = new Date(Date.now() + 4000).toUTCString();
    const fn = jest.fn()
      .mockRejectedValueOnce(erro429({ get: (n) => (n === 'retry-after' ? data : null) }))
      .mockResolvedValueOnce('ok');
    const esperas = [];
    const p = comRateLimit(fn, { aoEsperar: (seg) => esperas.push(seg) });
    await jest.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toBe('ok');
    expect(esperas[0]).toBeGreaterThanOrEqual(3);
    expect(esperas[0]).toBeLessThanOrEqual(5);
  });

  test('sem cabeçalho: backoff exponencial 2 s, 4 s, 8 s…', async () => {
    process.env.RATE_LIMIT_BACKOFF_BASE_MS = '2000';
    const fn = jest.fn()
      .mockRejectedValueOnce(erro429())
      .mockRejectedValueOnce(erro429())
      .mockRejectedValueOnce(erro429())
      .mockResolvedValueOnce('ok');
    const { desfecho, esperas } = await rodar(fn, { avancarMs: 14_000 });
    expect(desfecho).toEqual({ ok: 'ok' });
    expect(esperas.map(e => e.seg)).toEqual([2, 4, 8]);
    expect(esperas.every(e => e.motivo === 'rate-limit')).toBe(true);
  });

  test('a espera tem teto de 60 s', async () => {
    process.env.RATE_LIMIT_BACKOFF_BASE_MS = '40000';
    const fn = jest.fn()
      .mockRejectedValueOnce(erro429())
      .mockRejectedValueOnce(erro429())
      .mockResolvedValueOnce('ok');
    const { esperas } = await rodar(fn, { avancarMs: 120_000 });
    expect(esperas.map(e => e.seg)).toEqual([40, 60]); // 40 s, depois 80 s limitado a 60 s
  });

  test('tentativas esgotadas: o erro 429 é propagado', async () => {
    process.env.RATE_LIMIT_MAX_RETENTATIVAS = '2';
    process.env.RATE_LIMIT_BACKOFF_BASE_MS = '10';
    const fn = jest.fn().mockRejectedValue(erro429());
    const { desfecho } = await rodar(fn, { avancarMs: 1000 });
    expect(desfecho.erro).toBeInstanceOf(OpenAI.RateLimitError);
    expect(fn).toHaveBeenCalledTimes(3); // 1 chamada + 2 retentativas
  });
});

describe('comRateLimit — o que NÃO é repetido', () => {
  test.each([
    ['400 (requisição inválida)', () => new OpenAI.BadRequestError('inválido')],
    ['401 (chave inválida)', () => new OpenAI.AuthenticationError('chave')],
    ['erro comum sem status', () => new Error('bug')]
  ])('%s não é repetido', async (_nome, criar) => {
    const fn = jest.fn().mockRejectedValue(criar());
    const { desfecho, esperas } = await rodar(fn, { avancarMs: 100_000 });
    expect(desfecho.erro).toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(esperas).toEqual([]);
  });

  test('erro no meio do stream (depois do primeiro token) não é repetido: o helper só envolve a abertura da chamada', async () => {
    // fn representa openai.create(): devolve o stream; o erro mid-stream acontece na iteração, fora do helper.
    async function* streamQueFalha() { yield { choices: [{ delta: { content: 'parcial' } }] }; throw erro429(); }
    const fn = jest.fn().mockResolvedValue(streamQueFalha());
    const stream = await comRateLimit(fn, {});
    const recebidos = [];
    await expect((async () => { for await (const c of stream) recebidos.push(c); })()).rejects.toBeInstanceOf(OpenAI.RateLimitError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(recebidos).toHaveLength(1);
  });
});

describe('comRateLimit — falhas transitórias (o SDK deixou de repetir sozinho)', () => {
  test('5xx e falha de conexão ganham até 2 novas tentativas curtas', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new OpenAI.InternalServerError('boom'))
      .mockRejectedValueOnce(new OpenAI.APIConnectionError('reset'))
      .mockResolvedValueOnce('ok');
    const { desfecho, esperas } = await rodar(fn, { avancarMs: 10_000 });
    expect(desfecho).toEqual({ ok: 'ok' });
    expect(esperas.map(e => e.motivo)).toEqual(['transitorio', 'transitorio']);
  });

  test('persistindo o 5xx, desiste após 2 retentativas', async () => {
    const fn = jest.fn().mockRejectedValue(new OpenAI.InternalServerError('boom'));
    const { desfecho } = await rodar(fn, { avancarMs: 10_000 });
    expect(desfecho.erro).toBeInstanceOf(OpenAI.InternalServerError);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('comRateLimit — espera abortável', () => {
  test('desconexão do cliente durante a espera aborta e não faz nova chamada', async () => {
    jest.useFakeTimers();
    const ac = new AbortController();
    const fn = jest.fn().mockRejectedValue(erro429({ 'retry-after': '30' }));
    const p = comRateLimit(fn, { signal: ac.signal });
    const desfecho = p.then(() => 'ok', e => e);
    await jest.advanceTimersByTimeAsync(5000);
    ac.abort();
    await jest.advanceTimersByTimeAsync(1);
    expect(await desfecho).toBeInstanceOf(OpenAI.APIUserAbortError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('signal já abortado quando o erro chega: propaga o erro sem esperar', async () => {
    const ac = new AbortController();
    ac.abort();
    const original = erro429();
    const fn = jest.fn().mockRejectedValue(original);
    await expect(comRateLimit(fn, { signal: ac.signal })).rejects.toBe(original);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('baixarParaArquivo — timeout, limite de tamanho e stream em disco', () => {
  let pasta;
  beforeEach(() => { pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'download-')); });
  afterEach(() => { delete global.fetch; fs.rmSync(pasta, { recursive: true, force: true }); });

  const respostaStream = (chunks, headers = {}) => new Response(Readable.toWeb(Readable.from(chunks)), { status: 200, headers });

  test('grava por stream, renomeia no fim e não deixa temporário', async () => {
    global.fetch = jest.fn(async () => respostaStream([Buffer.from('ABC'), Buffer.from('DEF')]));
    const destino = path.join(pasta, 'arquivo.bin');
    await baixarParaArquivo('https://x.test/f', destino, { rotulo: 'o teste' });
    expect(fs.readFileSync(destino, 'utf-8')).toBe('ABCDEF');
    expect(fs.existsSync(`${destino}.baixando`)).toBe(false);
  });

  test('status não-ok falha com mensagem clara', async () => {
    global.fetch = jest.fn(async () => new Response('x', { status: 404 }));
    await expect(baixarParaArquivo('https://x.test/f', path.join(pasta, 'a'), { rotulo: 'o .mp4' })).rejects.toThrow(/Falha ao baixar o \.mp4 \(status 404\)/);
  });

  test('content-length acima do limite é recusado antes de baixar', async () => {
    global.fetch = jest.fn(async () => respostaStream([Buffer.from('x')], { 'content-length': String(10 * 1024 * 1024) }));
    await expect(baixarParaArquivo('https://x.test/f', path.join(pasta, 'a'), { maxBytes: 1024 * 1024 })).rejects.toThrow(/excede o limite de tamanho/);
    expect(fs.readdirSync(pasta)).toEqual([]);
  });

  test('corpo que ultrapassa o limite no meio do stream é interrompido e o temporário removido', async () => {
    const grande = Buffer.alloc(600 * 1024, 1);
    global.fetch = jest.fn(async () => respostaStream([grande, grande, grande]));
    const destino = path.join(pasta, 'a.bin');
    await expect(baixarParaArquivo('https://x.test/f', destino, { maxBytes: 1024 * 1024, rotulo: 'o arquivo' })).rejects.toThrow(/excede o limite/);
    expect(fs.existsSync(destino)).toBe(false);
    expect(fs.existsSync(`${destino}.baixando`)).toBe(false);
  });

  test('timeout total aborta o download lento e remove o temporário', async () => {
    global.fetch = jest.fn(async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const destino = path.join(pasta, 'a.bin');
    await expect(baixarParaArquivo('https://x.test/f', destino, { timeoutMs: 50, rotulo: 'o vídeo' })).rejects.toThrow(/Tempo limite excedido ao baixar o vídeo/);
    expect(fs.readdirSync(pasta)).toEqual([]);
  });

  test('limites vêm de DOWNLOAD_TIMEOUT_MS e MAX_DOWNLOAD_BYTES quando não informados', async () => {
    process.env.MAX_DOWNLOAD_BYTES = '10';
    global.fetch = jest.fn(async () => respostaStream([Buffer.from('0123456789ABCDEF')]));
    await expect(baixarParaArquivo('https://x.test/f', path.join(pasta, 'a'))).rejects.toThrow(/excede o limite/);
  });

  test('resposta sem stream (arrayBuffer) segue funcionando, com o mesmo limite', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('PPTX') }));
    const destino = path.join(pasta, 'a.pptx');
    await baixarParaArquivo('https://x.test/f', destino);
    expect(fs.readFileSync(destino, 'utf-8')).toBe('PPTX');
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.alloc(100) }));
    await expect(baixarParaArquivo('https://x.test/f', path.join(pasta, 'b'), { maxBytes: 10 })).rejects.toThrow(/excede o limite/);
  });
});
