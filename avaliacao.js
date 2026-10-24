'use strict';

// Funções puras da avaliação sobre o conteúdo INTEGRAL (change
// avaliacao-conteudo-integral): estimativa de tokens, divisão do texto em partes
// SEM perder nenhum trecho (map-reduce por seção), comparação de versões por
// seção e agregação de notas. Sem I/O e sem chamadas à OpenAI.
//
// Regra geral: nenhuma avaliação recebe texto cortado por contagem de
// caracteres. Quando o conteúdo não cabe numa chamada, ele é DIVIDIDO (partes
// que juntas reproduzem o texto original), nunca encurtado.

// Versão da fórmula de score — registrada em score_historico.json. Ciclos de
// versões diferentes não são comparados (a v2 avalia a aula inteira por seção e
// pode incluir o componente determinístico de fundamentação em fontes).
const FORMULA_VERSAO = '2';

const CRITERIOS = ['planoAula', 'planoEnsinoEmenta', 'nivelPublicoModalidade', 'qualidadeDidatica', 'clarezaEstrutura'];

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Aproximação para português (~3,5 caracteres por token).
function estimarTokens(texto) {
  return Math.ceil(String(texto || '').length / 3.5);
}

// Orçamento de tokens de entrada por chamada de avaliação. Acima disso a
// avaliação é dividida (map-reduce). Configurável por AVALIACAO_MAX_TOKENS_ENTRADA.
function limiteTokensEntrada(env = process.env) {
  const n = Number(env.AVALIACAO_MAX_TOKENS_ENTRADA);
  return Number.isFinite(n) && n > 0 ? n : 24_000;
}

function contarPalavras(texto) {
  const t = String(texto || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

// Subdivide um texto grande em pedaços de no máximo `maxTokens`, quebrando em
// limites de parágrafo (depois de frase, depois de palavra, só se preciso). Os
// pedaços concatenados reproduzem EXATAMENTE o texto original.
function subdividir(texto, maxTokens) {
  const maxChars = Math.max(200, Math.floor(maxTokens * 3.5));
  if (texto.length <= maxChars) return [texto];
  const pedacos = [];
  let atual = '';
  const empurrar = () => { if (atual) { pedacos.push(atual); atual = ''; } };
  // Unidades com o separador junto (preserva o texto): parágrafos → frases → palavras.
  const unidades = (t, re) => t.split(re).filter(u => u !== '');
  const paragrafos = unidades(texto, /(?<=\n\n)/);
  const adicionar = (unidade) => {
    if (unidade.length > maxChars) {
      empurrar();
      const frases = unidade.length > maxChars ? unidades(unidade, /(?<=[.!?]\s)/) : [unidade];
      for (const f of frases) {
        if (f.length > maxChars) {
          empurrar();
          for (const palavra of unidades(f, /(?<=\s)/)) {
            if (atual.length + palavra.length > maxChars) empurrar();
            atual += palavra;
          }
        } else {
          if (atual.length + f.length > maxChars) empurrar();
          atual += f;
        }
      }
      return;
    }
    if (atual.length + unidade.length > maxChars) empurrar();
    atual += unidade;
  };
  paragrafos.forEach(adicionar);
  empurrar();
  return pedacos;
}

// Divide o texto da aula em partes por seção (`## Título`), subdividindo as
// seções que não cabem em `maxTokens`. Nada é descartado: as partes juntas
// reproduzem o texto original (verificado nos testes). Texto antes da primeira
// seção vira "Abertura"; texto sem seções é dividido só por tamanho.
function dividirEmPartes(texto, maxTokens = limiteTokensEntrada()) {
  const t = String(texto || '');
  if (!t) return [];
  const re = /^##\s+(.+?)\s*$/gm;
  const marcas = [...t.matchAll(re)].map(m => ({ titulo: m[1], inicio: m.index }));
  const secoes = [];
  if (!marcas.length) {
    secoes.push({ titulo: 'Aula', texto: t });
  } else {
    if (marcas[0].inicio > 0) secoes.push({ titulo: 'Abertura', texto: t.slice(0, marcas[0].inicio) });
    marcas.forEach((m, k) => {
      const fim = k + 1 < marcas.length ? marcas[k + 1].inicio : t.length;
      secoes.push({ titulo: m.titulo, texto: t.slice(m.inicio, fim) });
    });
  }
  const partes = [];
  for (const s of secoes) {
    const pedacos = subdividir(s.texto, maxTokens);
    pedacos.forEach((p, k) => partes.push({
      titulo: pedacos.length > 1 ? `${s.titulo} (parte ${k + 1} de ${pedacos.length})` : s.titulo,
      secao: s.titulo,
      texto: p
    }));
  }
  return partes;
}

// Compara duas versões do texto por seção (título normalizado). Devolve as
// seções alteradas, novas ou removidas, com o texto dos dois lados.
function secoesAlteradas(textoOriginal, textoCandidato) {
  const mapa = (texto) => {
    const m = new Map();
    for (const p of dividirEmPartes(texto, Number.MAX_SAFE_INTEGER)) {
      const chave = norm(p.secao);
      m.set(chave, { titulo: p.secao, texto: (m.get(chave)?.texto || '') + p.texto });
    }
    return m;
  };
  const a = mapa(textoOriginal);
  const b = mapa(textoCandidato);
  const alteradas = [];
  const ordem = [...new Set([...b.keys(), ...a.keys()])];
  for (const chave of ordem) {
    const o = a.get(chave);
    const c = b.get(chave);
    if (o && c && o.texto.trim() === c.texto.trim()) continue;
    alteradas.push({
      titulo: (c || o).titulo,
      tipo: !o ? 'nova' : (!c ? 'removida' : 'alterada'),
      original: o ? o.texto : '',
      candidato: c ? c.texto : ''
    });
  }
  return { alteradas, titulos: [...b.values()].map(s => s.titulo) };
}

// Pares (original, candidato) de UMA seção alterada que cabem em `maxTokens`
// cada lado; seções muito grandes são divididas em partes emparelhadas por
// posição (parte faltante vira vazia). Nada é cortado.
function emparelharPartes(original, candidato, maxTokens) {
  const po = original ? subdividir(original, maxTokens) : [];
  const pc = candidato ? subdividir(candidato, maxTokens) : [];
  const n = Math.max(po.length, pc.length, 1);
  return Array.from({ length: n }, (_, k) => ({ original: po[k] || '', candidato: pc[k] || '' }));
}

// Média ponderada (por palavras) das notas por critério de várias seções.
// `itens`: [{ criterios: { planoAula: N, ... }, peso }]. Critério ausente em
// todas as seções vira null.
function mediaPonderadaCriterios(itens) {
  const out = {};
  for (const c of CRITERIOS) {
    let soma = 0; let pesos = 0;
    for (const it of itens) {
      const v = it?.criterios?.[c];
      if (typeof v !== 'number' || Number.isNaN(v)) continue;
      const p = Math.max(1, it.peso || 1);
      soma += v * p; pesos += p;
    }
    out[c] = pesos ? Math.round((soma / pesos) * 100) / 100 : null;
  }
  return out;
}

// Visão global enxuta da aula (título + primeiras palavras de cada seção) para
// a checagem de coerência quando o texto não cabe inteiro numa chamada. É um
// resumo para o juiz, não uma amostra do início do texto: TODAS as seções entram.
function resumoSecoes(texto, palavras = 40) {
  return dividirEmPartes(texto, Number.MAX_SAFE_INTEGER).map(p => {
    const corpo = p.texto.replace(/^\s*#{1,6}[^\n]*\n/, '').replace(/#{1,6}\s*/g, '').trim().split(/\s+/).filter(Boolean);
    return `- ${p.secao} (${contarPalavras(p.texto)} palavras): ${corpo.slice(0, palavras).join(' ')}${corpo.length > palavras ? '…' : ''}`;
  }).join('\n');
}

module.exports = {
  FORMULA_VERSAO, CRITERIOS, estimarTokens, limiteTokensEntrada, contarPalavras,
  dividirEmPartes, subdividir, secoesAlteradas, emparelharPartes,
  mediaPonderadaCriterios, resumoSecoes
};
