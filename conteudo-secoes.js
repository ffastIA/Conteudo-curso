'use strict';

// Funções puras da geração de conteúdo por seções (change
// conteudo-completo-por-secoes): leitura do roteiro da aula, metas de palavras,
// verificação mecânica de completude e estado da aula. Sem I/O e sem chamadas
// à OpenAI — tudo testável de forma isolada.

const MAX_SECOES = 12;
const FATOR_MINIMO = 0.8; // abaixo de 80% da meta a seção é considerada curta
const PESO_SINTESE = 0.5; // a síntese é mais curta que as seções de objetivo

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function contarPalavras(texto) {
  const t = String(texto || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

const ehSintese = (titulo) => norm(titulo).includes('sintese');

// Mesmo título, tolerante a caixa, acentos, pontuação e numeração ("1. Loops").
function ehMesmoTitulo(a, b) {
  const x = norm(a).replace(/^\d+\s*/, '');
  const y = norm(b).replace(/^\d+\s*/, '');
  return !!x && !!y && (x === y || x.includes(y));
}

// Lê a resposta (JSON) da skill de roteiro da aula. Aceita cercas ```json e
// texto ao redor. Devolve null quando o formato é inválido. Garante que a última
// seção seja a síntese e remove títulos duplicados.
function parseRoteiroAula(resposta) {
  let texto = String(resposta || '').trim();
  const cerca = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) texto = cerca[1].trim();
  const ini = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  let obj;
  try { obj = JSON.parse(texto.slice(ini, fim + 1)); } catch { return null; }
  if (!Array.isArray(obj?.secoes) || !obj.secoes.length) return null;

  const vistos = new Set();
  const secoes = [];
  for (const s of obj.secoes) {
    const titulo = String(s?.titulo || '').replace(/^#+\s*/, '').trim();
    if (titulo.length < 3 || titulo.length > 90) return null;
    const chave = norm(titulo);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    secoes.push({ titulo, objetivo: String(s?.objetivo || '').trim(), tipo: String(s?.tipo || '').trim() });
  }
  if (!secoes.length || secoes.length > MAX_SECOES) return null;

  // Síntese sempre por último (move a existente ou acrescenta uma).
  const idxSintese = secoes.findIndex(s => ehSintese(s.titulo));
  if (idxSintese >= 0) secoes.push(...secoes.splice(idxSintese, 1));
  else secoes.push({ titulo: 'Síntese', objetivo: 'Consolidar o que o instrutor deve garantir ao final da aula', tipo: 'sintese' });
  return secoes;
}

// Meta total de palavras da aula, a partir da duração (min) e do nível.
// Referência: ~30 palavras de material de apoio por minuto de aula, ajustada
// pelo nível; limitada a [800, 6000].
function estimarMetaPalavrasAula({ duracao, nivel } = {}) {
  const minutos = Number(duracao) > 0 ? Number(duracao) : 60;
  const n = norm(nivel);
  const fator = n.startsWith('basic') || n.startsWith('inic') ? 0.9 : n.startsWith('avanc') ? 1.15 : 1;
  return Math.max(800, Math.min(6000, Math.round(minutos * 30 * fator)));
}

// Distribui a meta total pelas seções (a síntese pesa metade das demais).
function distribuirMetaPalavras(total, secoes) {
  const pesos = secoes.map(s => (ehSintese(s.titulo) ? PESO_SINTESE : 1));
  const soma = pesos.reduce((a, b) => a + b, 0) || 1;
  return secoes.map((s, i) => Math.round((total * pesos[i]) / soma));
}

// A última linha não vazia termina "no ar": dois-pontos, vírgula, marcador de
// lista sem texto ou conector solto — sinal de resposta cortada.
function caudaAberta(texto) {
  const linhas = String(texto || '').trimEnd().split('\n');
  const ultima = (linhas[linhas.length - 1] || '').trim();
  if (!ultima) return false;
  if (/^([-*•]|\d+[.)])$/.test(ultima)) return true;
  return /[:,;]$/.test(ultima) || /\b(e|ou|de|do|da|que|para|com|em)$/i.test(ultima);
}

function blocoDeCodigoAberto(texto) {
  return ((String(texto || '').match(/^\s*```/gm)) || []).length % 2 === 1;
}

// Verificação mecânica de completude, independente do modelo.
// `secoes`: [{ titulo, texto, meta, truncada }] na ordem planejada, ou null no
// modo de passada única (só truncamento, código e lista abertos são avaliados).
function verificarCompletude({ texto, secoes = null, truncada = false }) {
  const motivos = [];
  const ausentes = [];
  const curtas = [];
  const textoFinal = secoes ? secoes.map(s => s.texto || '').join('\n\n') : String(texto || '');

  if (truncada) motivos.push('resposta cortada por limite de tokens (finish_reason=length)');
  if (secoes) {
    for (const s of secoes) {
      if (contarPalavras(s.texto) < 5) { ausentes.push(s.titulo); continue; }
      if (s.truncada) motivos.push(`seção "${s.titulo}" cortada por limite de tokens`);
      if (s.meta && contarPalavras(s.texto) < Math.round(s.meta * FATOR_MINIMO)) curtas.push(s.titulo);
    }
    if (ausentes.length) motivos.push(`seções ausentes: ${ausentes.join(', ')}`);
    const ultima = secoes[secoes.length - 1];
    if (ultima && !ehSintese(ultima.titulo)) motivos.push('a síntese não está no final da aula');
  }
  const codigoAberto = blocoDeCodigoAberto(textoFinal);
  if (codigoAberto) motivos.push('bloco de código aberto no final');
  const cauda = caudaAberta(textoFinal);
  if (cauda) motivos.push('o texto termina no meio de uma frase ou lista');

  const incompleta = motivos.length > 0;
  return {
    estado: incompleta ? 'incompleta' : (curtas.length ? 'curta' : 'completa'),
    motivos, ausentes, curtas,
    codigoAberto, caudaAberta: cauda,
    palavras: contarPalavras(textoFinal)
  };
}

module.exports = {
  contarPalavras, parseRoteiroAula, estimarMetaPalavrasAula, distribuirMetaPalavras,
  verificarCompletude, caudaAberta, blocoDeCodigoAberto, ehSintese, ehMesmoTitulo, FATOR_MINIMO
};
