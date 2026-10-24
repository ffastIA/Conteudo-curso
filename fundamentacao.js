'use strict';

// Funções puras da fundamentação do conteúdo em pesquisa (change
// conteudo-fundamentado-em-pesquisa): módulos do curso, seleção de achados e
// fontes por aula (IDs [F#] locais à aula), verificação mecânica de citações,
// bloco de referências e limpeza do texto para slides/roteiros/vídeo.
// Sem I/O e sem chamadas à OpenAI.

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const MODULO_PADRAO = 'Módulo único';
const MAX_ACHADOS_POR_AULA = 6;

function dominioDe(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Agrupa as aulas por módulo (na ordem do primeiro aparecimento). Aula sem
// módulo cai em "Módulo único".
function agruparModulos(aulas) {
  const porChave = new Map();
  (aulas || []).forEach((aula, indice) => {
    const titulo = String(aula?.modulo || '').trim() || MODULO_PADRAO;
    const chave = norm(titulo);
    if (!porChave.has(chave)) porChave.set(chave, { id: `m${porChave.size + 1}`, titulo, aulas: [], objetivos: [] });
    const m = porChave.get(chave);
    m.aulas.push(indice);
    if (aula?.objetivos) m.objetivos.push(`Aula ${indice + 1} (${aula.titulo || 'sem título'}): ${aula.objetivos}`);
  });
  return [...porChave.values()];
}

function termos(texto) {
  return new Set(norm(texto).split(' ').filter(t => t.length > 3));
}

// Sobreposição de termos (Jaccard) entre dois textos — mesmo espírito do
// textSimilarity usado no restante do sistema.
function similaridade(a, b) {
  const A = termos(a);
  const B = termos(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

// Seleciona, para UMA aula, os achados do módulo dela e — havendo espaço — os
// achados gerais (pesquisa geral e de outros módulos) mais próximos por
// sobreposição de termos. Nunca corta um achado no meio. Reatribui IDs locais
// F1..Fk (por ordem de primeiro uso) às fontes escolhidas, de modo que `[F#]`
// no texto da aula sempre aponte para o dossiê DESTA aula.
function selecionarFontesParaAula({ aula, aulas, pesquisaModulos = null, pesquisaGeral = null, maxAchados = MAX_ACHADOS_POR_AULA }) {
  const tituloModulo = String(aula?.modulo || '').trim() || MODULO_PADRAO;
  const modulo = (pesquisaModulos?.modulos || []).find(m => norm(m.titulo) === norm(tituloModulo));
  const candidatos = [];
  for (const a of pesquisaModulos?.achados || []) {
    candidatos.push({ ...a, pool: pesquisaModulos.fontes || [], doModulo: !!modulo && a.moduloId === modulo.id });
  }
  for (const a of pesquisaGeral?.achados || []) {
    candidatos.push({ ...a, pool: pesquisaGeral.fontes || [], doModulo: false });
  }
  const referencia = `${aula?.titulo || ''} ${aula?.objetivos || ''}`;
  const doModulo = candidatos.filter(c => c.doModulo);
  const gerais = candidatos
    .filter(c => !c.doModulo)
    .map(c => ({ c, s: similaridade(referencia, `${c.tema} ${c.resumo}`) }))
    .filter(x => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .map(x => x.c);
  const escolhidos = [...doModulo, ...gerais].slice(0, maxAchados);

  const fontes = [];
  const idPorUrl = new Map();
  const achados = escolhidos.map(c => {
    const fonteIds = [];
    for (const id of c.fonteIds || []) {
      const f = c.pool.find(x => x.id === id);
      if (!f) continue;
      if (!idPorUrl.has(f.url)) {
        const novoId = `F${fontes.length + 1}`;
        idPorUrl.set(f.url, novoId);
        fontes.push({ id: novoId, url: f.url, titulo: f.titulo || f.url, dominio: f.dominio || dominioDe(f.url) });
      }
      const local = idPorUrl.get(f.url);
      if (!fonteIds.includes(local)) fonteIds.push(local);
    }
    return { tema: c.tema, resumo: c.resumo, fonteIds };
  }).filter(a => a.fonteIds.length);
  return { achados, fontes };
}

// ── Verificação mecânica de citações ────────────────────────────────────────
const RE_NUMERO = /\d+(?:[.,]\d+)?\s*%|\bR\$|\bUS\$|\b(?:19|20)\d{2}\b|\b\d{3,}\b/;

function paragrafosForaDeCodigo(texto) {
  const semCodigo = String(texto || '').replace(/```[\s\S]*?```/g, '\n');
  return semCodigo.split(/\n{2,}/).map(p => p.trim()).filter(p => p && !/^#{1,6}\s/.test(p));
}

// Todo [F#] existe no dossiê? Quantas fontes distintas foram usadas? Há dado
// numérico sem citação? Só informa — nunca bloqueia a gravação.
function verificarCitacoes(texto, fontes) {
  const permitidos = new Set((fontes || []).map(f => f.id));
  const citados = [...String(texto || '').matchAll(/\[F(\d+)\]/g)].map(m => `F${m[1]}`);
  const idsInvalidos = [...new Set(citados.filter(id => !permitidos.has(id)))];
  const usadas = [...new Set(citados.filter(id => permitidos.has(id)))];
  const urls = new Set(usadas.map(id => (fontes.find(f => f.id === id) || {}).url));
  // Dado numérico sem citação: conta frases (não parágrafos inteiros) com número
  // relevante e sem [F#]; títulos, blocos de código e a seção de referências ficam de fora.
  const numerosSemCitacao = paragrafosForaDeCodigo(texto)
    .filter(p => !/^Refer[eê]ncias da aula/i.test(p))
    .flatMap(p => p.split(/(?<=[.!?])\s+/))
    .filter(frase => RE_NUMERO.test(frase) && !/\[F\d+\]/.test(frase)).length;
  return {
    idsInvalidos,
    usadas,
    distintas: urls.size,
    numerosSemCitacao,
    minimoAtingido: urls.size >= 2
  };
}

// ── Referências e limpeza do texto ──────────────────────────────────────────
const RE_SECAO_REFERENCIAS = /^#{2,4}\s*Refer[eê]ncias da aula\b[^\n]*\n[\s\S]*?(?=^#{1,4}\s|(?![\s\S]))/gim;

function removerSecaoReferencias(texto) {
  return String(texto || '').replace(RE_SECAO_REFERENCIAS, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

// Bloco "### Referências da aula" montado a partir do dossiê (autoridade
// determinística: URL e título reais, só das fontes efetivamente citadas).
function montarReferencias(fontes, usadas) {
  const citadas = (fontes || []).filter(f => (usadas || []).includes(f.id));
  if (!citadas.length) return '### Referências da aula\n\nNenhuma fonte do dossiê de pesquisa foi citada nesta aula.';
  return '### Referências da aula\n\n' + citadas.map(f => `- [${f.id}] ${f.titulo} — ${f.url}`).join('\n');
}

function substituirReferencias(texto, fontes, usadas) {
  return `${removerSecaoReferencias(texto)}\n\n${montarReferencias(fontes, usadas)}\n`;
}

// Slides, roteiros e vídeos recebem o texto sem marcadores [F#] e sem a seção de
// referências — material falado ou projetado não deve ter citações em linha.
function removerMarcadoresFonte(texto) {
  return String(texto || '')
    .replace(/[ \t]*\[F\d+(?:\s*[,;]\s*F\d+)*\]/g, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1');
}

function limparParaMidia(texto) {
  return removerMarcadoresFonte(removerSecaoReferencias(texto));
}

module.exports = {
  agruparModulos, selecionarFontesParaAula, similaridade, verificarCitacoes,
  montarReferencias, substituirReferencias, removerSecaoReferencias,
  removerMarcadoresFonte, limparParaMidia, dominioDe, MODULO_PADRAO, MAX_ACHADOS_POR_AULA
};
