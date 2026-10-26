'use strict';

// Cache local das consultas de pesquisa web (change otimizacao-de-tokens).
// A pesquisa é a etapa mais cara (cerca de 86% do custo na linha de base), então
// repetir a MESMA consulta com a MESMA entrada não chama a OpenAI de novo.
//
// A chave é o hash do prompt final + modelo + parâmetros da ferramenta: qualquer
// mudança em ementa, nível, público, modalidade, metodologia, consulta ou ano gera
// outra chave sozinha. Só respostas bem-sucedidas (texto + ao menos uma citação)
// entram; falha, resposta de memória e o fallback "sem pesquisa web" nunca são
// guardados. Arquivo corrompido ou de outra versão é ignorado, sem derrubar nada.
//
//   PESQUISA_CACHE=false          desliga leitura e gravação
//   PESQUISA_CACHE_TTL_DIAS=30    validade (0 desliga a leitura, mantendo a gravação)
//   PESQUISA_CACHE_DIR            pasta (padrão: .cache-pesquisa na raiz do app)

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSAO_FORMATO = 1;
const DIA_MS = 24 * 60 * 60 * 1000;

function lerConfig(env = process.env) {
  const ligado = String(env.PESQUISA_CACHE ?? '').trim().toLowerCase() !== 'false';
  const bruto = String(env.PESQUISA_CACHE_TTL_DIAS ?? '').trim();
  const n = Number(bruto);
  const ttlDias = bruto !== '' && Number.isFinite(n) && n >= 0 ? n : 30;
  const dir = String(env.PESQUISA_CACHE_DIR ?? '').trim() || path.join(__dirname, '.cache-pesquisa');
  return { ligado, ttlDias, dir };
}

function criarCachePesquisa({ env = process.env, agora = () => Date.now(), logger = null } = {}) {
  const aviso = (msg) => { try { logger?.warn?.(msg); } catch { /* log é opcional */ } };

  // Hash do que define a resposta: versão do formato, modelo, contexto de busca,
  // instruções, entrada e teto de saída.
  function chave(skill, maxOutputTokens = null) {
    const base = JSON.stringify([
      VERSAO_FORMATO, skill?.model || '', skill?.searchContextSize || 'medium',
      skill?.system || '', skill?.user || '', maxOutputTokens
    ]);
    return crypto.createHash('sha256').update(base).digest('hex');
  }

  const arquivo = (cfg, k) => path.join(cfg.dir, `${k}.json`);

  // Devolve a entrada válida ou null (desligado, ausente, expirada, corrompida).
  function ler(k) {
    const cfg = lerConfig(env);
    if (!cfg.ligado || cfg.ttlDias === 0) return null;
    let bruto;
    try { bruto = fs.readFileSync(arquivo(cfg, k), 'utf-8'); } catch { return null; }
    let e;
    try { e = JSON.parse(bruto); } catch { aviso(`[pesquisa-cache] entrada ilegível ignorada (${k.slice(0, 12)})`); return null; }
    const geradoEm = Date.parse(e?.geradoEm);
    if (e?.versao !== VERSAO_FORMATO || typeof e.texto !== 'string' || !e.texto.trim()
      || !Array.isArray(e.annotations) || !e.annotations.length || !Number.isFinite(geradoEm)) {
      aviso(`[pesquisa-cache] entrada de outro formato ignorada (${k.slice(0, 12)})`);
      return null;
    }
    const idadeMs = agora() - geradoEm;
    if (idadeMs > cfg.ttlDias * DIA_MS) return null;
    return { texto: e.texto, annotations: e.annotations, modelo: e.modelo, geradoEm: e.geradoEm, idadeDias: Math.max(0, Math.floor(idadeMs / DIA_MS)) };
  }

  // Só grava sucesso: texto não vazio e ao menos uma citação. Gravação atômica.
  function gravar(k, { texto, annotations, modelo }) {
    const cfg = lerConfig(env);
    if (!cfg.ligado) return false;
    if (!String(texto || '').trim() || !Array.isArray(annotations) || !annotations.length) return false;
    try {
      fs.mkdirSync(cfg.dir, { recursive: true });
      const destino = arquivo(cfg, k);
      const tmp = `${destino}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify({ versao: VERSAO_FORMATO, modelo, geradoEm: new Date(agora()).toISOString(), texto, annotations }), 'utf-8');
      fs.renameSync(tmp, destino);
      return true;
    } catch (err) {
      aviso(`[pesquisa-cache] não foi possível gravar a entrada: ${err.message}`);
      return false;
    }
  }

  return { chave, ler, gravar, lerConfig: () => lerConfig(env) };
}

module.exports = { criarCachePesquisa, lerConfig, VERSAO_FORMATO };
