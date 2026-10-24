'use strict';

// Observabilidade das chamadas ao LLM com Langfuse (change observabilidade-langfuse).
// Sem dependência npm: envia spans OTLP/HTTP JSON por `fetch` nativo ao endpoint
// /api/public/otel/v1/traces (a API de ingestão em lote do Langfuse está obsoleta).
// Desligada quando LANGFUSE_ENABLED/chaves/host não existem. Falha do Langfuse
// nunca interrompe nem atrasa uma geração: o envio é assíncrono, em lote, com
// timeout curto, e o erro vira só um aviso no log local.

const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const als = new AsyncLocalStorage();

const FILA_MAX = 1000;
const LOTE_MAX = 50;
const INTERVALO_FLUSH_MS = 5_000;
const TIMEOUT_ENVIO_MS = 3_000;
const AVISO_INTERVALO_MS = 30_000;

// ── Preços e custo ──────────────────────────────────────────────────────────
function carregarPrecos() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'precos-modelos.json'), 'utf-8'));
  } catch {
    return { porMilhaoDeTokens: {} };
  }
}

// Custo em USD de uma resposta a partir do usage normalizado
// ({ prompt_tokens, completion_tokens }). Modelo sem preço → null.
function calcularCusto(usage, modelo, precos = carregarPrecos()) {
  if (!usage || !modelo) return null;
  const tabela = precos.porMilhaoDeTokens || {};
  const chave = Object.keys(tabela)
    .filter(k => String(modelo).toLowerCase().startsWith(k.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
  if (!chave) return null;
  const { entrada = 0, saida = 0 } = tabela[chave];
  return ((usage.prompt_tokens || 0) * entrada + (usage.completion_tokens || 0) * saida) / 1_000_000;
}

// ── Mascaramento de dados sensíveis ─────────────────────────────────────────
// E-mails, tokens/chaves e caminhos de pastas do usuário nunca saem da máquina.
const PADROES_MASCARA = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/\b(?:pk|sk)-lf-[A-Za-z0-9-]+/g, '[token]'],
  [/\bsk-[A-Za-z0-9_-]{10,}/g, '[token]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [token]'],
  [/\b(api[_-]?key|token|secret|password|senha)\s*[:=]\s*[^\s"',;]+/gi, '$1=[oculto]'],
  [/[A-Za-z]:[\\/][^\s"'<>|]+/g, '[caminho]'],
  [/\/(?:home|Users|root)\/[^\s"'<>|]+/g, '[caminho]']
];

function mascarar(texto) {
  if (typeof texto !== 'string') return texto;
  return PADROES_MASCARA.reduce((t, [re, sub]) => t.replace(re, sub), texto);
}

// ── Utilidades OTLP ─────────────────────────────────────────────────────────
const nanos = (ms) => String(Math.round(ms * 1e6));
const novoSpanId = () => crypto.randomBytes(8).toString('hex');

function atributo(chave, valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'boolean') return { key: chave, value: { boolValue: valor } };
  if (typeof valor === 'number') {
    return Number.isInteger(valor)
      ? { key: chave, value: { intValue: String(valor) } }
      : { key: chave, value: { doubleValue: valor } };
  }
  if (typeof valor === 'object') return { key: chave, value: { stringValue: JSON.stringify(valor) } };
  return { key: chave, value: { stringValue: String(valor) } };
}

function atributos(obj) {
  return Object.entries(obj).map(([k, v]) => atributo(k, v)).filter(Boolean);
}

function lerConfig(env) {
  const habilitada = /^(1|true|yes|sim)$/i.test(String(env.LANGFUSE_ENABLED || ''));
  const host = String(env.LANGFUSE_HOST || '').trim().replace(/\/+$/, '');
  const publicKey = String(env.LANGFUSE_PUBLIC_KEY || '').trim();
  const secretKey = String(env.LANGFUSE_SECRET_KEY || '').trim();
  const taxa = Number(env.LANGFUSE_SAMPLE_RATE);
  return {
    enabled: habilitada && !!host && !!publicKey && !!secretKey,
    host,
    publicKey,
    secretKey,
    capture: String(env.LANGFUSE_CAPTURE || '').toLowerCase() === 'completo' ? 'completo' : 'metadados',
    sampleRate: Number.isFinite(taxa) ? Math.min(1, Math.max(0, taxa)) : 1
  };
}

// Amostragem determinística por trace (mesmo trace → mesma decisão).
function amostrado(traceId, taxa) {
  if (taxa >= 1) return true;
  if (taxa <= 0) return false;
  return (parseInt(traceId.slice(0, 8), 16) / 0xffffffff) < taxa;
}

function criarObservabilidade({ env = process.env, fetchImpl = (...a) => fetch(...a), logger = console, precos } = {}) {
  const cfg = lerConfig(env);
  const tabelaPrecos = precos || carregarPrecos();
  const fila = [];
  const pendentes = new Set();
  let timer = null;
  let enviando = Promise.resolve();
  let ultimoAviso = 0;

  function avisar(msg) {
    const agora = Date.now();
    if (agora - ultimoAviso < AVISO_INTERVALO_MS) return;
    ultimoAviso = agora;
    logger.warn(`[observabilidade] ${msg}`);
  }

  const cabecalhos = () => ({
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`${cfg.publicKey}:${cfg.secretKey}`).toString('base64'),
    'x-langfuse-ingestion-version': '4'
  });

  function iniciarTimer() {
    if (timer || !cfg.enabled) return;
    timer = setInterval(() => { flush(); }, INTERVALO_FLUSH_MS);
    if (timer.unref) timer.unref();
  }

  function enfileirar(span) {
    if (!cfg.enabled) return;
    if (fila.length >= FILA_MAX) {
      fila.shift();
      avisar(`fila cheia (${FILA_MAX}) — descartando eventos mais antigos`);
    }
    fila.push(span);
    iniciarTimer();
    if (fila.length >= LOTE_MAX) setImmediate(() => { flush(); });
  }

  async function enviarLote(lote) {
    const corpo = {
      resourceSpans: [{
        resource: { attributes: atributos({ 'service.name': 'gerador-conteudo' }) },
        scopeSpans: [{ scope: { name: 'gerador-conteudo' }, spans: lote }]
      }]
    };
    try {
      const resp = await fetchImpl(`${cfg.host}/api/public/otel/v1/traces`, {
        method: 'POST',
        headers: cabecalhos(),
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(TIMEOUT_ENVIO_MS)
      });
      if (!resp.ok) avisar(`Langfuse respondeu ${resp.status} ao receber ${lote.length} span(s) — descartados`);
    } catch (err) {
      avisar(`falha ao enviar ${lote.length} span(s) ao Langfuse: ${err.message}`);
    }
  }

  // Envia tudo o que está na fila (em lotes). Nunca rejeita.
  function flush() {
    if (!cfg.enabled) return Promise.resolve();
    enviando = enviando.then(async () => {
      while (fila.length) await enviarLote(fila.splice(0, 100));
      await Promise.allSettled([...pendentes]);
    }).catch(() => {});
    return enviando;
  }

  // Encerramento: esvazia a fila com limite de tempo, sem travar a saída.
  async function shutdown(limiteMs = 4_000) {
    if (timer) { clearInterval(timer); timer = null; }
    if (!cfg.enabled) return;
    await Promise.race([flush(), new Promise(r => { const t = setTimeout(r, limiteMs); if (t.unref) t.unref(); })]);
  }

  // ── Contexto por operação (trace) ─────────────────────────────────────────
  function criarContexto({ etapa, sessionId = null, traceId = crypto.randomUUID().replace(/-/g, ''), props = {} }) {
    const ctx = {
      traceId,
      rootSpanId: novoSpanId(),
      etapa,
      inicio: Date.now(),
      amostrado: amostrado(traceId, cfg.sampleRate),
      forcado: false,
      geracoes: 0,
      filhos: 0,
      custoUsd: 0,
      custoDesconhecido: false,
      tokens: { entrada: 0, saida: 0, total: 0 },
      meta: {},
      ...props
    };
    // sessionId pode ser calculado de forma preguiçosa (a sessão só é conhecida
    // depois que o handler roda).
    Object.defineProperty(ctx, 'sessionId', {
      enumerable: true,
      get: typeof sessionId === 'function' ? sessionId : () => sessionId
    });
    return ctx;
  }

  const contexto = () => als.getStore() || null;
  const executar = (ctx, fn) => als.run(ctx, fn);
  function definirContexto(patch) {
    const ctx = contexto();
    if (ctx) Object.assign(ctx.meta, patch);
  }

  function atributosComuns(ctx, extra = {}) {
    const meta = { etapa: ctx.etapa, ...ctx.meta, ...extra };
    const out = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined && v !== null && v !== '') out[`langfuse.observation.metadata.${k}`] = v;
    }
    return out;
  }

  function span({ ctx, nome, inicio, fim, attrs, erro = null, root = false }) {
    return {
      traceId: ctx.traceId,
      spanId: root ? ctx.rootSpanId : novoSpanId(),
      ...(root ? {} : { parentSpanId: ctx.rootSpanId }),
      name: nome,
      kind: 1,
      startTimeUnixNano: nanos(inicio),
      endTimeUnixNano: nanos(fim),
      attributes: atributos(attrs),
      status: erro ? { code: 2, message: String(erro).slice(0, 500) } : { code: 1 }
    };
  }

  // Retorna true quando o evento deve ser enviado (amostrado ou falha/incompleto).
  function deveEnviar(ctx, forcar) {
    if (forcar) ctx.forcado = true;
    return cfg.enabled && (ctx.amostrado || ctx.forcado);
  }

  function texto(valor) {
    const s = typeof valor === 'string' ? valor : JSON.stringify(valor ?? '');
    return mascarar(s);
  }

  // Registra uma chamada ao LLM como generation. `usage` normalizado:
  // { prompt_tokens, completion_tokens, total_tokens }. Sempre acumula
  // tokens/custo no contexto (UI e geracao_log.json), mesmo sem Langfuse.
  function registrarGeneration({ nome, modelo, parametros = {}, input, output, usage, finishReason, inicio, fim = Date.now(), erro = null, extra = {} }) {
    const ctx = contexto();
    if (!ctx) return null;
    const custo = calcularCusto(usage, modelo, tabelaPrecos);
    ctx.geracoes += 1;
    ctx.tokens.entrada += usage?.prompt_tokens || 0;
    ctx.tokens.saida += usage?.completion_tokens || 0;
    ctx.tokens.total += usage?.total_tokens || 0;
    if (custo === null) { if (usage) ctx.custoDesconhecido = true; } else ctx.custoUsd += custo;

    const resumo = { traceId: ctx.traceId, nome, modelo, usage, finishReason, custoUsd: custo, latenciaMs: fim - inicio, erro: erro ? String(erro) : null, ...extra };
    const incompleta = finishReason === 'length';
    if (!deveEnviar(ctx, !!erro || incompleta)) return resumo;
    ctx.filhos += 1;

    const attrs = {
      'langfuse.observation.type': 'generation',
      'langfuse.observation.model.name': modelo,
      'langfuse.observation.model.parameters': parametros,
      'langfuse.observation.usage_details': usage
        ? { input: usage.prompt_tokens || 0, output: usage.completion_tokens || 0, total: usage.total_tokens || 0 }
        : undefined,
      'langfuse.observation.cost_details': custo === null ? undefined : { total: custo },
      'langfuse.observation.level': erro ? 'ERROR' : (incompleta ? 'WARNING' : 'DEFAULT'),
      ...atributosComuns(ctx, { finish_reason: finishReason, latencia_ms: fim - inicio, custo_usd: custo ?? undefined, ...extra })
    };
    const tamEntrada = typeof input === 'string' ? input.length : JSON.stringify(input ?? '').length;
    const tamSaida = typeof output === 'string' ? output.length : JSON.stringify(output ?? '').length;
    if (cfg.capture === 'completo') {
      if (input !== undefined) attrs['langfuse.observation.input'] = texto(input);
      if (output !== undefined) attrs['langfuse.observation.output'] = texto(output);
    } else {
      attrs['langfuse.observation.metadata.entrada_chars'] = tamEntrada;
      attrs['langfuse.observation.metadata.saida_chars'] = tamSaida;
    }
    enfileirar(span({ ctx, nome, inicio, fim, attrs, erro }));
    return resumo;
  }

  // Chamada externa que não é LLM (Gamma, HeyGen, downloads).
  function registrarSpan({ nome, inicio, fim = Date.now(), status = null, erro = null, extra = {} }) {
    const ctx = contexto();
    if (!ctx || !deveEnviar(ctx, !!erro)) return;
    ctx.filhos += 1;
    const attrs = {
      'langfuse.observation.type': 'span',
      'langfuse.observation.level': erro ? 'ERROR' : 'DEFAULT',
      ...atributosComuns(ctx, { http_status: status ?? undefined, duracao_ms: fim - inicio, ...extra })
    };
    enfileirar(span({ ctx, nome, inicio, fim, attrs, erro }));
  }

  // Fecha o trace: envia o span raiz (nome da etapa, sessão e metadados).
  function finalizarContexto(ctx, { erro = null } = {}) {
    if (!ctx || !cfg.enabled || !ctx.filhos || !(ctx.amostrado || ctx.forcado)) return;
    const attrs = {
      'langfuse.trace.name': ctx.etapa,
      'langfuse.session.id': ctx.sessionId || undefined,
      'langfuse.observation.type': 'span',
      'langfuse.observation.metadata.etapa': ctx.etapa,
      'langfuse.trace.metadata.etapa': ctx.etapa,
      'langfuse.trace.metadata.tokens_total': ctx.tokens.total,
      'langfuse.trace.metadata.custo_usd': ctx.custoUsd
    };
    enfileirar(span({ ctx, nome: ctx.etapa, inicio: ctx.inicio, fim: Date.now(), attrs, erro, root: true }));
  }

  // Nota de qualidade anexada ao trace atual (POST /api/public/scores).
  function registrarScore(nome, valor, { comentario = null, ctx = contexto() } = {}) {
    if (!cfg.enabled || !ctx || typeof valor !== 'number' || !Number.isFinite(valor)) return;
    if (!(ctx.amostrado || ctx.forcado)) return;
    const p = Promise.resolve().then(async () => {
      try {
        const resp = await fetchImpl(`${cfg.host}/api/public/scores`, {
          method: 'POST',
          headers: cabecalhos(),
          body: JSON.stringify({
            traceId: ctx.traceId, name: nome, value: valor, dataType: 'NUMERIC',
            ...(comentario ? { comment: mascarar(String(comentario)) } : {})
          }),
          signal: AbortSignal.timeout(TIMEOUT_ENVIO_MS)
        });
        if (!resp.ok) avisar(`Langfuse respondeu ${resp.status} ao registrar o score "${nome}"`);
      } catch (err) {
        avisar(`falha ao registrar o score "${nome}": ${err.message}`);
      }
    }).finally(() => pendentes.delete(p));
    pendentes.add(p);
  }

  // Envolve um stream de chat.completions: repassa os chunks sem alterá-los e,
  // ao terminar (ou falhar), entrega o resumo (texto, usage, finish_reason).
  function envolverStream(stream, aoTerminar) {
    return (async function* () {
      let texto = '';
      let usage; let finishReason; let erro = null;
      try {
        for await (const chunk of stream) {
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (delta) texto += delta;
          if (chunk?.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
          if (chunk?.usage) usage = chunk.usage;
          yield chunk;
        }
      } catch (err) {
        erro = err;
        throw err;
      } finally {
        try { aoTerminar({ texto, usage, finishReason, erro }); } catch { /* observabilidade nunca quebra a geração */ }
      }
    })();
  }

  const urlTrace = (traceId) => (cfg.enabled ? `${cfg.host}/trace/${traceId}` : null);

  return {
    config: cfg,
    enabled: cfg.enabled,
    contexto, criarContexto, executar, definirContexto, finalizarContexto,
    registrarGeneration, registrarSpan, registrarScore, envolverStream,
    flush, shutdown, urlTrace,
    _fila: fila
  };
}

const obs = criarObservabilidade();

// Esvazia a fila ao encerrar o processo (sem segurar o evento de saída).
// Só registra os handlers quando a integração está ligada (evita alterar o
// comportamento de sinais e acumular listeners nos testes).
if (obs.enabled) {
  let encerrando = false;
  for (const sinal of ['SIGINT', 'SIGTERM']) {
    process.once(sinal, () => {
      if (encerrando) return;
      encerrando = true;
      obs.shutdown().finally(() => process.exit(0));
    });
  }
  process.once('beforeExit', () => { obs.shutdown(); });
}

module.exports = { criarObservabilidade, obs, mascarar, calcularCusto, carregarPrecos, amostrado, lerConfig };
