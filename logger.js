'use strict';

// Logger estruturado (change custo-e-logs): uma linha JSON por evento com
// nível, mensagem e contexto da requisição (etapa, aula, reqId). Sem
// dependência externa. Escreve via console.* (stdout para info, stderr para
// warn/error), então os testes continuam podendo silenciá-lo, e respeita
// LOG_LEVEL (debug | info | warn | error | silent; padrão info).
//
// Segredos nunca saem: chaves de API, cabeçalhos Authorization/Cookie e o
// valor literal de qualquer variável de ambiente com nome de segredo.

const NIVEIS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const PADROES_SEGREDO = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [oculto]'],
  [/\b(?:pk|sk)-[A-Za-z0-9_-]{8,}/g, '[oculto]'],
  [/\b(authorization|cookie|set-cookie)\s*["']?\s*[:=]\s*[^\n"',}]+/gi, '$1=[oculto]'],
  [/\b(api[_-]?key|token|secret|password|senha|passphrase)\s*["']?\s*[:=]\s*[^\s"',;}]+/gi, '$1=[oculto]']
];

const NOME_SEGREDO = /(key|token|secret|password|senha|passphrase|authorization|cookie)/i;

function valoresSecretosDoAmbiente(env) {
  return Object.entries(env)
    .filter(([nome, valor]) => NOME_SEGREDO.test(nome) && typeof valor === 'string' && valor.length >= 8)
    .map(([, valor]) => valor);
}

function criarLogger({ env = process.env, contexto = () => null, saida = console } = {}) {
  const nivelAtual = () => NIVEIS[String(env.LOG_LEVEL || 'info').toLowerCase()] ?? NIVEIS.info;

  function ocultar(texto) {
    let t = String(texto);
    for (const v of valoresSecretosDoAmbiente(env)) t = t.split(v).join('[oculto]');
    for (const [re, sub] of PADROES_SEGREDO) t = t.replace(re, sub);
    return t;
  }

  function normalizar(valor) {
    if (valor instanceof Error) return valor.message;
    if (typeof valor === 'string') return valor;
    try { return JSON.stringify(valor); } catch { return String(valor); }
  }

  // log(nivel, mensagem, ...resto): `resto` aceita strings/erros (juntados à
  // mensagem, compatível com o antigo console.warn(msg, err.message)) e objetos
  // simples (viram campos extras do JSON).
  function emitir(nivel, mensagem, ...resto) {
    if (NIVEIS[nivel] < nivelAtual()) return;
    const extras = {};
    const partes = [normalizar(mensagem)];
    for (const r of resto) {
      if (r && typeof r === 'object' && !(r instanceof Error) && !Array.isArray(r)) Object.assign(extras, r);
      else partes.push(normalizar(r));
    }
    const ctx = contexto() || {};
    const linha = {
      ts: new Date().toISOString(),
      nivel,
      etapa: ctx.etapa,
      aula: ctx.meta?.aula,
      reqId: ctx.traceId,
      mensagem: partes.join(' '),
      ...extras
    };
    // Máscara aplicada a cada valor de texto (e por nome de campo), não à linha pronta: o JSON continua válido.
    const json = JSON.stringify(linha, (chave, valor) =>
      typeof valor !== 'string' ? valor : (chave && NOME_SEGREDO.test(chave) ? '[oculto]' : ocultar(valor)));
    if (nivel === 'error') saida.error(json);
    else if (nivel === 'warn') saida.warn(json);
    else saida.log(json);
  }

  return {
    debug: (...a) => emitir('debug', ...a),
    info: (...a) => emitir('info', ...a),
    warn: (...a) => emitir('warn', ...a),
    error: (...a) => emitir('error', ...a),
    log: emitir,
    ocultar
  };
}

module.exports = { criarLogger, NIVEIS };
