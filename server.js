// Auto-descriptografia: se .env não existe mas .env.encrypted + .env.key existem,
// descriptografa em memória e injeta em process.env antes de qualquer outro código.
(function autoDecryptEnv() {
  const path = require('node:path');
  const fs   = require('node:fs');
  const ROOT = __dirname;
  const envPath = path.join(ROOT, '.env');
  const encPath = path.join(ROOT, '.env.encrypted');
  const keyPath = path.join(ROOT, '.env.key');
  if (!fs.existsSync(envPath) && fs.existsSync(encPath) && fs.existsSync(keyPath)) {
    try {
      const { decryptEnv } = require('./scripts/env-crypto');
      const plaintext = decryptEnv(encPath, keyPath);
      const dotenv = require('dotenv');
      const parsed = dotenv.parse(plaintext);
      dotenv.populate(process.env, parsed, { override: false });
      console.log('[env] Variáveis carregadas de .env.encrypted');
    } catch (err) {
      process.stderr.write(`[env] Falha ao descriptografar .env.encrypted — verifique .env.key\n`);
      process.stderr.write(`[env] Detalhe: ${err.message}\n`);
      process.exit(1);
    }
  }
})();

require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execFile } = require('child_process');
const multer = require('multer');
const mammoth = require('mammoth');
const skills = require('./skills');
const { obs: observabilidade } = require('./observabilidade');
const conteudoSecoes = require('./conteudo-secoes');
const fundamentacao = require('./fundamentacao');
const bnccData = require('./bncc-data');
console.log(`[BNCC] Carregado: ${bnccData.competenciasGerais.length} competências, ` +
  `${bnccData.habilidades.ef1.length} EF1, ${bnccData.habilidades.ef2.length} EF2, ` +
  `${bnccData.habilidades.em.length} EM`);
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, PageNumber, Header, Footer, Table,
  TableRow, TableCell, WidthType, BorderStyle, NumberFormat
} = require('docx');

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 6 });

// Ponto único de chamada à OpenAI (change observabilidade-langfuse): toda
// chamada passa por aqui para virar uma `generation` (modelo, parâmetros,
// usage, finish_reason, latência, custo) no trace da requisição atual. Um teste
// estático (tests/unit/observabilidade-wrapper.test.js) proíbe chamadas diretas
// ao SDK fora desta função. A observabilidade nunca altera nem atrasa o
// resultado: o retorno é exatamente o do SDK (streams são repassados chunk a
// chunk, sem modificação).
async function chamarOpenAI(tipo, params, options, meta = {}) {
  const inicio = Date.now();
  const ctx = observabilidade.contexto();
  const nome = meta.nome || `openai.${tipo}`;
  const parametros = {
    max_tokens: params?.max_tokens ?? params?.max_output_tokens,
    temperature: params?.temperature,
    stream: !!params?.stream,
    ferramenta: tipo === 'responses' ? 'web_search' : undefined
  };
  const entrada = tipo === 'responses'
    ? { instructions: params?.instructions, input: params?.input }
    : params?.messages;

  const registrar = (r) => {
    const resumo = observabilidade.registrarGeneration({
      nome, modelo: params?.model, parametros, input: entrada, inicio, ...r, extra: { tentativa: meta.tentativa }
    });
    if (resumo) registrarGeracaoLog(ctx, resumo);
  };

  let resultado;
  try {
    resultado = tipo === 'responses'
      ? await openai.responses.create(params, options)
      : await openai.chat.completions.create(params, options);
  } catch (err) {
    registrar({ erro: err.message || String(err) });
    throw err;
  }

  if (tipo === 'chat' && params?.stream) {
    return observabilidade.envolverStream(resultado, ({ texto, usage, finishReason, erro }) =>
      registrar({ output: texto, usage, finishReason, erro: erro ? (erro.message || String(erro)) : null }));
  }
  if (tipo === 'responses') {
    let texto = '';
    for (const item of resultado?.output || []) {
      if (item.type !== 'message') continue;
      for (const c of item.content || []) if (typeof c.text === 'string') texto += c.text;
    }
    registrar({
      output: texto || resultado?.output_text || '',
      usage: resultado?.usage ? {
        prompt_tokens: resultado.usage.input_tokens || 0,
        completion_tokens: resultado.usage.output_tokens || 0,
        total_tokens: resultado.usage.total_tokens || 0
      } : undefined,
      finishReason: resultado?.status === 'incomplete' ? 'length' : 'stop'
    });
    return resultado;
  }
  registrar({
    output: resultado?.choices?.[0]?.message?.content,
    usage: resultado?.usage,
    finishReason: resultado?.choices?.[0]?.finish_reason
  });
  return resultado;
}

const upload = multer({ storage: multer.memoryStorage() });

// ── Gamma (Etapa 8 — Slides) ────────────────────────────────────────────────
// Único motor externo além da OpenAI neste projeto — mesmo padrão de chave
// (.env, nunca commitada) usado para OPENAI_API_KEY.
const GAMMA_API_KEY = process.env.GAMMA_API_KEY;
const GAMMA_API_BASE = 'https://public-api.gamma.app/v1.0';
// Cadência do polling (a API do Gamma não tem webhook). Configuráveis por env
// apenas para encurtar a espera nos testes — em produção valem os padrões;
// valor ausente ou não-numérico cai no padrão.
const GAMMA_POLL_INTERVAL_MS = Number(process.env.GAMMA_POLL_INTERVAL_MS) || 5_000;
const GAMMA_POLL_TIMEOUT_MS = Number(process.env.GAMMA_POLL_TIMEOUT_MS) || 5 * 60_000;

// ── HeyGen (Etapa 10 — Vídeo com avatar) ────────────────────────────────────
// Mesmo padrão do Gamma: sem SDK, fetch nativo, chave via .env. Usa o endpoint
// "Avatar Video" da API v3 (POST /v3/videos, type:"avatar") — determinístico,
// narra o script literalmente — não o "Video Agent" (prompt criativo, só
// acessível via MCP/CLI/agente, que reescreve o texto livremente).
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const HEYGEN_API_BASE = 'https://api.heygen.com';
const HEYGEN_POLL_INTERVAL_MS = Number(process.env.HEYGEN_POLL_INTERVAL_MS) || 5_000;
// Vídeo de avatar demora mais que slides — teto maior que o do Gamma (5 min).
const HEYGEN_POLL_TIMEOUT_MS = Number(process.env.HEYGEN_POLL_TIMEOUT_MS) || 10 * 60_000;

// Lista de IDs separados por vírgula (ex.: "id1, id2,id3") -> array trimado
// sem entradas vazias. Usado para restringir avatares/vozes exibidos na
// Etapa 10 a um subconjunto curado do workspace HeyGen (ver HEYGEN_AVATAR_IDS
// e HEYGEN_VOICE_IDS abaixo) — vazio/ausente significa "sem filtro".
function parseCsvEnv(value) {
  return (value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

const HEYGEN_AVATAR_IDS = parseCsvEnv(process.env.HEYGEN_AVATAR_IDS);
const HEYGEN_VOICE_IDS = parseCsvEnv(process.env.HEYGEN_VOICE_IDS);

// Mesmo padrão acima, para restringir os templates Gamma customizados
// oferecidos na Etapa 8 (ver listarTemplatesGamma) — vazio/ausente
// significa "funcionalidade de template desativada" (comportamento igual
// ao anterior a esta feature).
const GAMMA_TEMPLATE_IDS = parseCsvEnv(process.env.GAMMA_TEMPLATE_IDS);

const SEARCH_TIMEOUT_MS = 90_000;
const SEARCH_RETRY_TIMEOUT_MS = 60_000;
// Novas tentativas da mesma consulta de pesquisa após falha transitória.
const PESQUISA_MAX_RETENTATIVAS = 2;
const SEARCH_FALLBACK_TIMEOUT_MS = 30_000;
// Pausa entre aulas consecutivas (proteção simples contra rate limit; padrão 4 s).
// CONTEUDO_PAUSA_MS=0 desliga — usado nos testes. A espera adaptativa por 429
// (change geracao-retomavel) substitui esta pausa fixa.
const PAUSA_ENTRE_AULAS_MS = Number(process.env.CONTEUDO_PAUSA_MS ?? 4000);
const STALL_TIMEOUT_MS = 45_000;
const CONTEUDO_SEARCH_TIMEOUT_MS = 90_000;
// Teto de tokens de saída por aula, uniforme em todas as gerações de conteúdo
// (streaming e web-search) — teto prático de saída do gpt-4o-mini. Elevado de
// 10.000 para 16.000 em 2026-07-05 após aulas densas truncarem mesmo após
// continuação (ver change aumentar-teto-e-continuacoes-melhorias).
const MAX_TOKENS_AULA = 16_000;
// Máximo de tentativas de continuação quando a aplicação de melhorias corta
// por limite de tokens antes de desistir e preservar o conteúdo anterior.
const MAX_CONTINUACOES_MELHORIA = 2;

function isRetriable(err) {
  if (err instanceof OpenAI.AuthenticationError) return false;
  if (err instanceof OpenAI.BadRequestError) return false;
  if (err?.configInvalida) return false;
  return true;
}

function makeAbortSignal(ms) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ac = new AbortController();
  setTimeout(() => ac.abort(), ms);
  return ac.signal;
}

// Valida a presença de uma API key externa obrigatória (GAMMA_API_KEY,
// HEYGEN_API_KEY) antes de qualquer chamada de rede. Diferente de
// OPENAI_API_KEY — cuja ausência já derruba o servidor na inicialização com
// um erro claro do próprio SDK (`new OpenAI(...)`, linha ~24) — GAMMA_API_KEY
// e HEYGEN_API_KEY ausentes não impedem o servidor de subir; sem este guard,
// o único sintoma seria um 401 cru vindo da API externa, sem apontar a causa
// raiz (variável de ambiente não configurada).
function requireApiKey(value, envVarName) {
  if (!value?.trim()) {
    throw new Error(`${envVarName} não está configurada. Adicione a chave em .env (veja .env.example) antes de usar esta etapa.`);
  }
}

// Rastreia desconexão prematura do cliente numa rota SSE e expõe um signal
// combinável com timeouts. 'close' com writableEnded=false = cliente sumiu.
function clientAbort(res) {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ac.abort();
  });
  return {
    signal: ac.signal,
    get disconnected() { return ac.signal.aborted; }
  };
}

// Combina o signal de desconexão com um timeout (AbortSignal.any existe no
// Node 20+; fallback manual para Node 18).
function combineSignals(a, b) {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b]);
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return ac.signal;
}

// Remove parâmetros de rastreamento (utm_*) que a busca web anexa às URLs das
// fontes (ex.: ?utm_source=openai), mantendo o restante da URL intacto.
function limparUrlFonte(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (k.toLowerCase().startsWith('utm_')) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Mínimo de fontes e de domínios distintos para considerar a pesquisa como
// realmente feita na web (resposta de memória não traz citações).
const PESQUISA_MIN_FONTES = 3;
const PESQUISA_MIN_DOMINIOS = 2;

function avaliarFontesPesquisa(sites) {
  const dominios = new Set();
  for (const s of sites) {
    try { dominios.add(new URL(s.url).hostname.replace(/^www\./, '')); } catch { /* URL inválida não conta */ }
  }
  return {
    fontes: sites.length,
    dominios: dominios.size,
    ok: sites.length >= PESQUISA_MIN_FONTES && dominios.size >= PESQUISA_MIN_DOMINIOS
  };
}

// Selo gravado no topo de uma pesquisa gerada sem busca web (decisão explícita
// do usuário) — visível em .txt/.docx e lido pelas etapas seguintes.
const SELO_SEM_PESQUISA_WEB =
  '> ⚠️ SEM PESQUISA WEB: este texto foi gerado a partir do conhecimento do modelo, sem consulta a fontes. ' +
  'Não cite este conteúdo como fonte nem como referência verificada.\n\n';

// Busca web via Responses API (ferramenta `web_search`). O caminho antigo
// (chat.completions + web_search_options com gpt-4o) é rejeitado pela API com
// 400 "Web search options not supported with this model", e gpt-4o-search-preview
// foi descontinuado (404) — ver docs/decisoes/pesquisa-api.md. O retorno é
// normalizado para o formato de chat.completions (choices[0].message com
// content e annotations url_citation, mais usage) que a rota /api/search já consome.
async function tentarPesquisaWeb(skill, timeoutMs, clientCtx = null, maxOutputTokens = 3000) {
  const timeoutSignal = makeAbortSignal(timeoutMs);
  const resp = await chamarOpenAI('responses', 
    {
      model: skill.model,
      tools: [{ type: 'web_search', search_context_size: skill.searchContextSize || 'medium' }],
      instructions: skill.system,
      input: skill.user,
      max_output_tokens: maxOutputTokens
    },
    { signal: clientCtx ? combineSignals(clientCtx.signal, timeoutSignal) : timeoutSignal }
  );

  let texto = '';
  const annotations = [];
  for (const item of resp.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) {
      if (typeof c.text === 'string') texto += c.text;
      for (const a of c.annotations || []) {
        if (a.type === 'url_citation' && a.url) {
          annotations.push({ type: 'url_citation', url_citation: { url: a.url, title: a.title || a.url } });
        }
      }
    }
  }
  return {
    choices: [{ message: { content: texto || resp.output_text || '', annotations }, finish_reason: resp.status === 'incomplete' ? 'length' : 'stop' }],
    usage: resp.usage ? {
      prompt_tokens: resp.usage.input_tokens || 0,
      completion_tokens: resp.usage.output_tokens || 0,
      total_tokens: resp.usage.total_tokens || 0
    } : undefined
  };
}

// Execução de uma consulta de pesquisa web com timeout e até PESQUISA_MAX_RETENTATIVAS
// novas tentativas em falhas transitórias. Erro 400 (modelo/parâmetro de busca
// rejeitado) é configuração inválida: mensagem clara, sem retentativa e sem
// fallback automático.
async function executarPesquisaWeb(skill, { clientCtx = null, onRetry = null, maxOutputTokens = 3000 } = {}) {
  let ultimoErro = null;
  for (let tentativa = 0; tentativa <= PESQUISA_MAX_RETENTATIVAS; tentativa++) {
    try {
      return await tentarPesquisaWeb(skill, tentativa === 0 ? SEARCH_TIMEOUT_MS : SEARCH_RETRY_TIMEOUT_MS, clientCtx, maxOutputTokens);
    } catch (err) {
      if (err instanceof OpenAI.BadRequestError) {
        const invalida = new Error(
          `Configuração de pesquisa inválida: o modelo "${skill.model}" ou o parâmetro de busca web foi rejeitado ` +
          `pela API (${err.message}). Verifique OPENAI_RESEARCH_MODEL.`
        );
        invalida.configInvalida = true;
        throw invalida;
      }
      if (clientCtx?.disconnected || !isRetriable(err)) throw err;
      ultimoErro = err;
      if (tentativa < PESQUISA_MAX_RETENTATIVAS && onRetry) onRetry(tentativa + 1);
    }
  }
  throw ultimoErro;
}

// Aviso de inicialização: modelo de pesquisa que provavelmente não aceita a
// ferramenta web_search (descontinuado ou fora das famílias que a suportam).
function validarModeloPesquisa(modelo = skills.modeloPesquisa()) {
  if (/search-preview/i.test(modelo)) {
    return `OPENAI_RESEARCH_MODEL="${modelo}" foi descontinuado pela OpenAI — use um modelo como gpt-4o (Responses API + web_search).`;
  }
  if (!/^(gpt-4|gpt-5|o3|o4)/i.test(modelo)) {
    return `OPENAI_RESEARCH_MODEL="${modelo}" pode não suportar a ferramenta web_search — a Etapa 2 pode falhar.`;
  }
  return null;
}

// ── Resultado estruturado da pesquisa (scr/pesquisa.json) ───────────────────
// Além do .txt/.docx, guarda consultas, fontes (com id, url, título, domínio)
// e achados por consulta, para as etapas seguintes citarem fontes por id.
// Projetos antigos (só pesquisa.txt) são lidos como { status: 'legado' }.
function dominioDe(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function escreverPesquisaMeta(sess, meta) {
  const scrDir = courseScrDir(sess);
  const destino = path.join(scrDir, 'pesquisa.json');
  const tmp = `${destino}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf-8');
    fs.renameSync(tmp, destino);
  } catch (err) {
    console.error('[pesquisa] Erro ao gravar pesquisa.json:', err.message);
    try { fs.unlinkSync(tmp); } catch { /* temporário ausente */ }
    return;
  }
  sess.pesquisaMeta = meta;
}

function lerPesquisaMeta(sess) {
  try {
    return JSON.parse(fs.readFileSync(path.join(courseScrDir(sess), 'pesquisa.json'), 'utf-8'));
  } catch { /* ausente ou inválido — cai no legado */ }
  if (readMemory(sess, 'pesquisa')) {
    return { status: 'legado', fonte: 'legado', modelo: null, geradoEm: null, consultas: [], fontes: [], achados: [] };
  }
  return null;
}

app.use(express.json());
app.use(cookieParser());

// Etapa 5 bloqueada: enquanto houver aula de conteúdo incompleto (resposta
// cortada), as etapas que dependem do conteúdo não rodam — a aula precisa ser
// regenerada antes (GET /api/conteudo?aulas=N). Rotas SSE respondem com o evento
// `error`; as demais, com 409.
app.use([
  '/api/qualidade', '/api/ppc', '/api/revisao-qualidade', '/api/aplicar-melhorias',
  '/api/slides/gerar', '/api/video-avatar/roteiro/gerar', '/api/video-avatar/gerar'
], (req, res, next) => {
  const sess = getSession(req, res);
  const incompletas = aulasIncompletas(sess);
  if (!incompletas.length) return next();
  const lista = incompletas.map(n => String(n).padStart(2, '0')).join(', ');
  const mensagem = `Conteúdo incompleto: a(s) aula(s) ${lista} foi(ram) cortada(s) por limite de tokens e não foi(ram) gravada(s) como pronta(s). ` +
    `Regenere-a(s) na Etapa 5 antes de continuar.`;
  if (req.method === 'GET') return sseError(res, mensagem);
  return res.status(409).json({ error: mensagem });
});

// Um trace de observabilidade por requisição /api (operação do usuário): o id da
// requisição é o traceId (32 hex), usado também nos eventos SSE `done`. A sessão
// do projeto vira o sessionId do trace (slug do curso, ou o cookie antes da
// configuração). O contexto trafega por AsyncLocalStorage até chamarOpenAI.
app.use('/api', (req, res, next) => {
  const etapa = req.path.replace(/^\/+/, '').replace(/\//g, '_') || 'raiz';
  const ctx = observabilidade.criarContexto({
    etapa,
    sessionId: () => {
      const s = sessions[req.cookies?.sessionId];
      return s?.config?.nome ? slugify(s.config.nome) : (req.cookies?.sessionId || null);
    }
  });
  Object.defineProperty(ctx, 'sess', { enumerable: false, get: () => sessions[req.cookies?.sessionId] });
  req.id = ctx.traceId;
  res.on('close', () => observabilidade.finalizarContexto(ctx));
  observabilidade.executar(ctx, next);
});
app.use(express.static(path.join(__dirname, 'public')));

// ── Sessões em memória ──────────────────────────────────────────────────────
const sessions = {};

function getSession(req, res) {
  let id = req.cookies?.sessionId;
  if (!id || !sessions[id]) {
    id = uuidv4();
    sessions[id] = {
      // Base pedagógica (Etapa 0)
      bncc: { ativo: false, publico: null, nivel: null, itens: [] },
      metodologia: '',
      // Configuração do curso (Etapa 1)
      config: {},
      // Pipeline principal (Etapas 2–5)
      ementa: '',
      pesquisa: '',
      planoEnsino: '',
      planoAula: '',
      aulas: null,
      conteudoPorAula: [],
      conteudo: '',
      // Ciclo de revisão e melhoria (Etapas 5★ e 6)
      revisaoQualidade: '',
      observacoesMelhorias: null,
      modoLegadoMelhorias: false,
      conteudoFinal: '',
      // Agente de qualidade e PPC
      relatorioQualidade: '',
      // Inputs do usuário por etapa (Etapas 2–4)
      inputs: {}
    };
    res.cookie('sessionId', id, { httpOnly: true });
  }
  return sessions[id];
}

// Metodologia com fallback de leitura em disco — a sessão in-memory pode ter
// sido perdida (restart do servidor) sem o usuário recarregar o projeto.
function getMetodologia(sess) {
  return sess.metodologia || readMemory(sess, 'metodologia');
}

// Monta bloco de contexto pedagógico para injetar nos prompts das skills.
// Retorna string vazia se nem modalidade, nem BNCC, nem metodologia estiverem definidos.
function buildPedagogicalContext(sess) {
  const parts = [];
  const modBlock = skills.modalidadeBlock(sess.config?.modalidade, {
    distribuicaoHibrida: sess.config?.distribuicaoHibrida,
    cargaSincronaPorAula: sess.config?.cargaSincronaPorAula
  });
  if (modBlock) parts.push(modBlock);
  const metodologia = getMetodologia(sess);
  if (metodologia) {
    parts.push(`## Metodologia Pedagógica\n${metodologia}`);
  }
  if (sess.bncc?.ativo && sess.bncc.itens?.length) {
    const itensStr = sess.bncc.itens
      .map(item => `- ${item.codigo ? `[${item.codigo}] ` : ''}${item.descricao}`)
      .join('\n');
    parts.push(`## Alinhamento BNCC — ${sess.bncc.nivel === 'competencias' ? 'Competências Gerais' : sess.bncc.nivel?.toUpperCase()}\n${itensStr}`);
  }
  return parts.join('\n\n');
}

function truncate(text, max = 1500) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

// Extrai o bloco de texto de UMA aula específica dentro do texto integral do
// plano de aula (que é organizado em seções "# Aula N: Título"). Evita o
// problema de truncate() sempre devolver o início do texto (≈ Aula 1).
function extractLessonBlock(fullText, index) {
  if (!fullText) return '';
  const matches = [...fullText.matchAll(/^# Aula (\d+):.*$/gm)];
  if (!matches.length) {
    throw new Error(`O plano de aula não tem cabeçalhos "# Aula N:" — não foi possível localizar o trecho da Aula ${index + 1}. Gere o plano de aula novamente.`);
  }
  // Localiza pelo NÚMERO capturado no cabeçalho, não pela posição na lista.
  const posicao = matches.findIndex(m => Number(m[1]) === index + 1);
  if (posicao < 0) {
    throw new Error(`O plano de aula não contém o cabeçalho "# Aula ${index + 1}:" — não foi possível localizar o trecho dessa aula. Gere o plano de aula novamente.`);
  }
  const start = matches[posicao].index;
  const end = (posicao + 1 < matches.length) ? matches[posicao + 1].index : fullText.length;
  return fullText.slice(start, end).trim();
}

// Substitui o bloco de UMA aula no texto integral do plano de aula, mantendo
// a linha de título "# Aula N: ..." original e as demais seções intactas.
// Contraparte de extractLessonBlock — usada pela fase de realinhamento da
// Etapa 6. Índice sem heading correspondente devolve o texto inalterado.
function replaceLessonBlock(fullText, index, novoCorpo) {
  if (!fullText) return fullText;
  const regex = /^# Aula (\d+):.*$/gm;
  const matches = [...fullText.matchAll(regex)];
  const posicao = matches.findIndex(m => Number(m[1]) === index + 1);
  const target = posicao >= 0 ? matches[posicao] : undefined;
  if (!target) return fullText;
  const headingLine = target[0];
  const start = target.index;
  const end = (posicao + 1 < matches.length) ? matches[posicao + 1].index : fullText.length;
  const antes = fullText.slice(0, start);
  const depois = fullText.slice(end);
  return antes + headingLine + '\n\n' + (novoCorpo || '').trim() + (depois ? '\n\n' + depois : '\n');
}

// ── Template do roteiro de vídeo (Etapa 9) ──────────────────────────────────
// Lido uma única vez (lazy) e cacheado em memória — PromptRoteiro.docx é
// estático no repo, não muda em runtime. Leitura lazy (não no boot) para que
// um arquivo ausente/corrompido só falhe no primeiro uso, sem derrubar o servidor.
let _roteiroTemplateCache = null;
async function getRoteiroTemplate() {
  if (_roteiroTemplateCache) return _roteiroTemplateCache;
  const buffer = fs.readFileSync(path.join(__dirname, 'PromptRoteiro.docx'));
  _roteiroTemplateCache = (await mammoth.extractRawText({ buffer })).value;
  return _roteiroTemplateCache;
}

// Substitui os placeholders do template do roteiro. Tolerante a espaço interno
// (o template real tem "[%% TEMA%%]", com um espaço espúrio entre %% e TEMA) —
// os colchetes ao redor são texto literal do template e não são tocados aqui.
// Depois da substituição, remove as anotações "(tema da aula + objetivos
// especificos)" e "(já vem do sistema)" — são notas de orientação de quem
// preencheu o template, não fazem parte do prompt a enviar para a IA.
function preencherTemplateRoteiro(template, { temaObjetivos, idade, blocos }) {
  return template
    .replace(/%%\s*TEMA\s*%%/g, temaObjetivos)
    .replace(/%%\s*IDADE\s*%%/g, idade)
    .replace(/%%\s*BLOCOS\s*%%/g, String(blocos))
    .replace(/[ \t]*\(tema da aula \+ objetivos espec[ií]ficos\)/gi, '')
    .replace(/[ \t]*\(j[áa] vem do sistema\)/gi, '');
}

// Extrai o texto do bloco "VOZ DO AVATAR (OBRIGATÓRIA EM TODOS OS BLOCOS):"
// do template (entre esse cabeçalho e o próximo, "FALAS:") — é o texto que
// o prompt instrui a IA a repetir literalmente em cada bloco do roteiro.
function extrairBlocoVozAvatar(template) {
  const match = template.match(/VOZ DO AVATAR[^:]*:\s*([\s\S]*?)\n\s*FALAS:/i);
  if (!match) return '';
  return match[1].trim().replace(/\n{3,}/g, '\n\n');
}

// Substitui, no roteiro já gerado pela IA, o placeholder literal que o
// template instrui a repetir ("[REPETIR EXATAMENTE O BLOCO DE VOZ ACIMA]")
// pelo texto de fato do bloco de voz — modelos como o gpt-4o-mini às vezes
// copiam essa instrução ao pé da letra em vez de expandi-la, então o
// preenchimento é garantido aqui de forma determinística, não só via prompt.
function preencherBlocoVozNoRoteiro(texto, blocoVoz) {
  if (!blocoVoz) return texto;
  return texto.replace(/\[?REPETIR EXATAMENTE O BLOCO DE VOZ ACIMA\]?/gi, blocoVoz);
}

// Extrai (e remove) as linhas "> ⚠️ ALERTA DE ESCOPO:" de uma seção realinhada —
// os alertas vão apenas para o relatório de melhorias, nunca para o plano persistido.
function extractScopeAlerts(texto) {
  const alertas = [];
  const secao = (texto || '')
    .replace(/^>\s*⚠️?\s*ALERTA DE ESCOPO:\s*(.*)$/gim, (_, msg) => { alertas.push(msg.trim()); return ''; })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { secao, alertas };
}

// Extrai os bullets de "### Resumo de Melhorias Propostas" da revisão de UMA
// aula — alimenta a seção consolidada "Melhorias a serem Aplicadas" do relatório.
function extractResumoMelhorias(textoAula) {
  const m = (textoAula || '').match(/###\s*Resumo de Melhorias Propostas\s*\n([\s\S]*?)(?=\n###\s|\n#\s|$)/i);
  if (!m) return [];
  return m[1].split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(l => l && !/^nenhuma\.?$/i.test(l));
}

// Parser da seção "Melhorias a serem Aplicadas" do documento de revisão
// anotado pelo revisor humano. Única zona lida pelo sistema; o resto do
// documento é livre. Retorna null se a seção não existir (aciona o fallback
// legado de "Observações do Revisor"). Regras (ver change melhorias-secao-
// estruturada): âncora = ÚLTIMA linha que inicia com o título (tolerante a
// acentos/caixa/#); blocos por linha "Aula NN" mapeados PELO NÚMERO; cada
// linha não vazia = 1 melhoria (mammoth descarta marcadores de lista do Word
// — prefixos são removidos, nunca exigidos); "Nenhuma" pula a aula. O
// marcador `[user]` sinaliza itens forçados (ver change marcador-user-forca-
// aplicacao-e-filtro-aulas-listadas), aceito em duas formas — sozinho numa
// linha (força todos os itens do bloco a partir dali) ou como prefixo de um
// item (`[user] texto`, mesmo padrão já usado pela tag `[Critério]` deste
// projeto — força só aquele item, com o prefixo removido do texto antes de
// seguir para o modelo). Essas melhorias entram na mesma lista de itens, mas
// a aula é sinalizada em `forcadoPorAula` para que o gate de score seja
// ignorado por completo.
function parseMelhoriasEstruturadas(texto, totalAulas) {
  if (!texto) return null;
  const normLine = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const lines = texto.split(/\r?\n/);

  let anchor = -1;
  for (let i = 0; i < lines.length; i++) {
    if (normLine(lines[i]).replace(/^#+\s*/, '').startsWith('melhorias a serem aplicadas')) anchor = i;
  }
  if (anchor === -1) return null;

  const porAula = Array.from({ length: totalAulas }, () => []);
  const forcadoPorAula = Array.from({ length: totalAulas }, () => false);
  const avisos = [];
  let atual = -1;
  let apósMarcador = false;

  for (let i = anchor + 1; i < lines.length; i++) {
    const bruta = lines[i].trim();
    if (!bruta) continue;
    const mAula = bruta.match(/^aula\s*(\d{1,3})\b/i);
    if (mAula) {
      const num = parseInt(mAula[1], 10);
      if (num >= 1 && num <= totalAulas) {
        atual = num - 1;
      } else {
        atual = -1;
        avisos.push(`Bloco "Aula ${num}" ignorado — o curso tem ${totalAulas} aula(s).`);
      }
      apósMarcador = false;
      continue;
    }
    if (atual === -1) continue;
    if (normLine(bruta).replace(/\.$/, '') === '[user]') {
      apósMarcador = true;
      continue;
    }
    const item = bruta.replace(/^(?:[-*•]|\d+[.)])\s*/, '').trim();
    if (!item) continue;
    if (/^nenhuma\.?$/i.test(item)) {
      porAula[atual] = [];
      forcadoPorAula[atual] = false;
      atual = -1; // trava o bloco: linhas seguintes até a próxima "Aula NN" são ignoradas
      continue;
    }
    const mInline = item.match(/^\[user\]\.?\s*(.*)$/i);
    if (mInline) {
      const textoForcado = mInline[1].trim();
      if (textoForcado) {
        porAula[atual].push(textoForcado);
        forcadoPorAula[atual] = true;
      }
      continue;
    }
    porAula[atual].push(item);
    if (apósMarcador) forcadoPorAula[atual] = true;
  }
  return { porAula, avisos, forcadoPorAula };
}

// Uma resposta de melhorias é completa quando não foi cortada por limite de
// tokens, não tem bloco <<<SECAO:>>> aberto sem fechamento, e contém a seção
// final obrigatória "### Melhorias Aplicadas".
function isRespostaMelhoriasCompleta(texto, finishReason) {
  if (finishReason === 'length') return false;
  const t = texto || '';
  const abertos = (t.match(/<<<SECAO:/g) || []).length;
  const fechados = (t.match(/<<<FIM_SECAO>>>/g) || []).length;
  if (abertos !== fechados) return false;
  return /###\s*Melhorias Aplicadas/i.test(t);
}

function normalizeTitulo(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Limiar de similaridade acima do qual uma seção "substituída" é sinalizada
// como possivelmente sem mudança real — calibrado empiricamente (ver design.md
// do change verificacao-mecanica-melhorias): seção idêntica devolvida pelo
// modelo mediu 1.000; seção alongada mas declarada "resumida" mediu 0.931;
// uma reescrita genuína e substancial mediu 0.431. Investigação nasceu de um
// caso real em que o modelo declarava melhorias aplicadas que nunca
// aconteceram no texto — esta checagem não corrige isso, só torna visível.
const LIMIAR_SECAO_SUSPEITA = 0.85;

// Extrai a lista FIXA de seções do texto original — calculada uma única vez,
// nunca reexaminada depois de alguma alteração. Cabeçalho válido é uma linha
// não vazia, isolada por linha em branco antes E depois, curta e sem terminar
// em pontuação de frase. Essa dupla exigência (isolamento + sem pontuação)
// evita dois falsos positivos reais: uma frase de corpo que MENCIONA o título
// de outra seção como substring (ex.: "...os erros comuns e pontos de
// atenção devem ser evitados...") nunca é isolada por linha em branco nos
// dois lados, e quase sempre termina em ponto — não vira candidata a
// cabeçalho. Ver design.md do change corrigir-duplicacao-patch-secional para
// o histórico do bug que isso corrige (duplicação de seções após múltiplos
// ciclos de melhorias).
function parseSecoesFixas(texto) {
  const linhas = (texto || '').split('\n');
  const candidatos = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!l) continue;
    const antesVazia = i === 0 || linhas[i - 1].trim() === '';
    const depoisVazia = i === linhas.length - 1 || linhas[i + 1].trim() === '';
    const pareceTitulo = l.length < 90 && !/[.,:;!?]$/.test(l) && /^[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ0-9#*]/.test(l);
    if (antesVazia && depoisVazia && pareceTitulo) candidatos.push({ linha: i, titulo: l });
  }
  return candidatos.map((c, idx) => ({
    titulo: c.titulo,
    tituloNorm: normalizeTitulo(c.titulo),
    inicioHeading: c.linha,
    inicioCorpo: c.linha + 1,
    fimCorpo: idx + 1 < candidatos.length ? candidatos[idx + 1].linha : linhas.length
  }));
}

// Remove, do corpo de uma seção substituída, uma eventual primeira linha
// (após linhas em branco iniciais) que apenas ecoa o título normalizado da
// seção-alvo. O modelo às vezes reafirma o título como abertura do próprio
// corpo, mesmo instruído a não reproduzi-lo — sem esta limpeza, a reconstrução
// insere esse eco logo após o cabeçalho real, criando uma segunda ocorrência
// do mesmo título que a rede de segurança de duplicação (corretamente) rejeita
// como se fosse uma duplicação real. Só remove eco EXATO da linha inteira —
// nunca uma menção parcial ou diferente.
function removerEcoTitulo(corpo, tituloNorm) {
  const linhas = corpo.split('\n');
  let i = 0;
  while (i < linhas.length && linhas[i].trim() === '') i++;
  if (i < linhas.length && normalizeTitulo(linhas[i]) === tituloNorm) {
    linhas.splice(0, i + 1);
    while (linhas.length && linhas[0].trim() === '') linhas.shift();
    return linhas.join('\n');
  }
  return corpo;
}

// Funde um patch por seção ("<<<SECAO: título>>>...<<<FIM_SECAO>>>", um ou mais
// blocos) no texto original de uma aula. Localiza cada título por igualdade
// EXATA (normalizada) contra a lista fixa de `parseSecoesFixas(textoOriginal)`
// — nunca por substring contra uma linha qualquer, e nunca reexaminando um
// texto que já foi parcialmente reconstruído (as duas causas raiz da
// duplicação de seções corrigida por este change). A reconstrução do
// resultado é feita em um único passe sobre essa lista fixa. Título não
// encontrado na lista vira seção nova, acrescentada ao final. Sem nenhum
// "<<<SECAO:" no patch, devolve o patch como reescrita integral (fallback —
// mesmo comportamento anterior a esta mudança).
// Retorna { texto, substituidas: [], novas: [], suspeitas: [...] } — suspeitas
// cobre: seção substituída cujo corpo novo mal difere do antigo
// ({titulo, similaridade}); bloco duplicado no mesmo patch, deduplicado
// ({titulo, motivo: 'duplicado_no_patch'}); título ambíguo no original
// ({titulo, motivo: 'titulo_ambiguo', ocorrencias}); ou merge inteiro
// rejeitado pela rede de segurança pós-merge ({titulo, motivo:
// 'merge_rejeitado_duplicacao'}), caso em que `texto` volta a ser o original.
function mergeSecoesConteudo(textoOriginal, patchTexto) {
  const blocoRegex = /<<<SECAO:\s*([^\n>]+?)\s*>>>\n?([\s\S]*?)<<<FIM_SECAO>>>/g;
  const blocosBrutos = [...(patchTexto || '').matchAll(blocoRegex)];
  if (!blocosBrutos.length) {
    return { texto: patchTexto, substituidas: [], novas: [], suspeitas: [] };
  }

  const suspeitas = [];

  // Deduplica blocos do mesmo título dentro do MESMO patch — cenário real:
  // uma continuação por truncamento reescreve do zero uma seção que já
  // tinha sido fechada na tentativa anterior. Mantém o último (versão mais
  // completa) e sinaliza o(s) descartado(s).
  const blocosPorTitulo = new Map();
  for (const [, tituloBruto, corpoBruto] of blocosBrutos) {
    const titulo = tituloBruto.trim();
    const corpo = corpoBruto.trim();
    const tituloNorm = normalizeTitulo(titulo);
    if (blocosPorTitulo.has(tituloNorm)) suspeitas.push({ titulo, motivo: 'duplicado_no_patch' });
    blocosPorTitulo.set(tituloNorm, { titulo, corpo });
  }
  const blocos = [...blocosPorTitulo.values()];

  const linhasOriginais = (textoOriginal || '').split('\n');
  const secoesFixas = parseSecoesFixas(textoOriginal);

  const substituidas = [];
  const novas = [];
  const corpoPorSecao = new Map(); // índice em secoesFixas -> corpo novo

  for (const { titulo, corpo } of blocos) {
    const alvo = normalizeTitulo(titulo);
    const ocorrencias = secoesFixas.filter(s => s.tituloNorm === alvo);

    if (!ocorrencias.length) {
      novas.push(titulo);
      continue;
    }
    if (ocorrencias.length > 1) {
      suspeitas.push({ titulo, motivo: 'titulo_ambiguo', ocorrencias: ocorrencias.length });
    }

    // Nunca adivinha qual ocorrência era a pretendida — aplica sempre à
    // primeira, a opção menos destrutiva possível.
    const idx = secoesFixas.indexOf(ocorrencias[0]);
    const corpoSanitizado = removerEcoTitulo(corpo, alvo);
    corpoPorSecao.set(idx, corpoSanitizado);
    substituidas.push(titulo);

    const corpoAntigo = linhasOriginais.slice(ocorrencias[0].inicioCorpo, ocorrencias[0].fimCorpo).join('\n').trim();
    const similaridade = textSimilarity(corpoAntigo, corpoSanitizado);
    if (similaridade >= LIMIAR_SECAO_SUSPEITA) suspeitas.push({ titulo, similaridade });
  }

  // Reconstrução em um único passe: preâmbulo (texto antes do primeiro
  // cabeçalho, preservado sempre, mesmo se nenhum cabeçalho for reconhecido)
  // + cada seção original (corpo novo se substituída, corpo original
  // byte a byte caso contrário) + seções novas ao final, na ordem do patch.
  const fimPreambulo = secoesFixas.length ? secoesFixas[0].inicioHeading : linhasOriginais.length;
  const linhasResultado = linhasOriginais.slice(0, fimPreambulo);
  secoesFixas.forEach((secao, idx) => {
    linhasResultado.push(linhasOriginais[secao.inicioHeading]);
    if (corpoPorSecao.has(idx)) linhasResultado.push('', corpoPorSecao.get(idx), '');
    else linhasResultado.push(...linhasOriginais.slice(secao.inicioCorpo, secao.fimCorpo));
  });
  for (const { titulo, corpo } of blocos) {
    if (novas.includes(titulo)) linhasResultado.push('', titulo, '', corpo, '');
  }

  const textoReconstruido = linhasResultado.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const texto = textoReconstruido ? textoReconstruido + '\n' : (textoOriginal || '');

  // Rede de segurança: nenhum título pode aparecer, no resultado, mais vezes
  // do que o esperado (ocorrências originais + seções genuinamente novas).
  // Se acontecer, é sinal de que o próprio corpo novo introduziu, por
  // acidente, algo que parece um cabeçalho duplicado — rejeita o merge
  // inteiro em vez de arriscar persistir a duplicação.
  const contagemEsperada = new Map();
  secoesFixas.forEach(s => contagemEsperada.set(s.tituloNorm, (contagemEsperada.get(s.tituloNorm) || 0) + 1));
  novas.forEach(t => {
    const n = normalizeTitulo(t);
    contagemEsperada.set(n, (contagemEsperada.get(n) || 0) + 1);
  });
  const contagemResultado = new Map();
  parseSecoesFixas(texto).forEach(s => contagemResultado.set(s.tituloNorm, (contagemResultado.get(s.tituloNorm) || 0) + 1));

  for (const [tituloNorm, count] of contagemResultado) {
    if (count > (contagemEsperada.get(tituloNorm) || 0)) {
      return {
        texto: textoOriginal || '',
        substituidas: [],
        novas: [],
        suspeitas: [{ titulo: tituloNorm, motivo: 'merge_rejeitado_duplicacao' }]
      };
    }
  }

  return { texto, substituidas, novas, suspeitas };
}

// Extrai termos que uma melhoria espera ver refletidos no resultado final:
// trechos entre aspas (ex.: "Círculo de Histórias") e siglas em maiúsculas
// (ex.: BNCC). Usado pela checagem de termo-chave — segunda frente da
// verificação mecânica, complementar à similaridade de seção (pega o caso em
// que a seção mudou bastante mas nunca tocou no termo pedido).
function extrairTermosEsperados(melhoria) {
  const termos = [];
  for (const m of (melhoria || '').matchAll(/"([^"]{3,60})"/g)) termos.push(m[1].trim());
  for (const m of (melhoria || '').matchAll(/\b[A-ZÇÃÕÁÉÍÓÚÊÂÀ]{2,8}\b/g)) termos.push(m[0]);
  return termos;
}

// Verdadeiro se `termo` não aparece (tolerante a acento/caixa) em nenhum dos
// dois textos finais — conteúdo da aula e plano de aula. Presente em qualquer
// um dos dois já basta para não sinalizar (a correção pode legitimamente ter
// acontecido em qualquer um dos dois documentos).
function termoAusente(termo, conteudoFinal, planoFinal) {
  const alvo = normalizeTitulo(termo);
  if (!alvo) return false;
  return !normalizeTitulo(conteudoFinal).includes(alvo) && !normalizeTitulo(planoFinal).includes(alvo);
}

// Similaridade simples por sobreposição de palavras (Jaccard truncado) — usada
// para detectar duplicação de conteúdo entre aulas (Ajuste 5).
function textSimilarity(a, b) {
  const words = s => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 120);
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size);
}

// ── Sistema de score de qualidade (ver capability quality-scoring) ─────────
// Score = 0.7 × RubricaLLM + 0.3 × Determinístico. A rubrica (5 critérios,
// avaliada por LLM) captura nuance pedagógica; o determinístico (3 funções
// puras, sem chamada de API) ancora o score contra o ruído de calibração do
// LLM entre chamadas — é o que torna "score do ciclo N" comparável com
// "score do ciclo N+1", ao contrário da nota holística anterior.
const PESOS_RUBRICA = {
  planoAula: 0.30,
  planoEnsinoEmenta: 0.25,
  nivelPublicoModalidade: 0.20,
  qualidadeDidatica: 0.15,
  clarezaEstrutura: 0.10
};
// Limiar de ganho mínimo para aceitar um candidato revisado (gate do ciclo
// de melhorias) e para considerar um ciclo "convergido" (early stopping).
// Mesma ordem de grandeza nos dois contextos — "ganho insignificante" tem
// o mesmo significado em ambos.
const EPSILON_ACEITE = 0.02;
const EPSILON_CONVERGENCIA = 0.02;

// Seções esperadas no conteúdo de uma aula (conteudoSkill) — usadas para
// medir completude estrutural. Busca tolerante por título (mesmo padrão de
// normalizeTitulo/mergeSecoesConteudo), não por nível de heading Markdown.
const SECOES_ESPERADAS_CONTEUDO = [
  'fundamentacao tecnica',
  'exemplos praticos',
  'erros comuns',
  'sintese'
];

// Componentes determinísticos do score (0-1 cada, sem chamada de API):
// (1) cobertura de objetivos — fração dos termos significativos de
// aula.objetivos presentes no texto; (2) penalidade de sobreposição —
// 1 - max(0, maiorSimilaridadeComOutraAula - 0.55), mesmo limiar já usado
// no sistema; (3) completude estrutural — fração das seções esperadas
// detectáveis por título tolerante no texto.
function computeScoreDeterministico(texto, aula, sobreposicaoMaxima = 0) {
  const textoNorm = normalizeTitulo(texto);

  const termosObjetivo = normalizeTitulo(aula?.objetivos)
    .split(' ')
    .filter(w => w.length > 3);
  const cobertura = termosObjetivo.length
    ? termosObjetivo.filter(t => textoNorm.includes(t)).length / termosObjetivo.length
    : 1;

  const penalidadeSobreposicao = Math.max(0, 1 - Math.max(0, sobreposicaoMaxima - 0.55));

  const secoesPresentes = SECOES_ESPERADAS_CONTEUDO.filter(s => textoNorm.includes(s)).length;
  const completudeEstrutural = secoesPresentes / SECOES_ESPERADAS_CONTEUDO.length;

  const determ = (cobertura + penalidadeSobreposicao + completudeEstrutural) / 3;
  return {
    determ: Math.max(0, Math.min(1, determ)),
    componentes: { cobertura, penalidadeSobreposicao, completudeEstrutural }
  };
}

// Compõe o score final a partir da rubrica (5 critérios 0-10) e do
// determinístico (0-1). Retorna também rubricaLLM (0-1) para o relatório.
function computeScoreComposto(rubrica10, determ0a1, pesos = PESOS_RUBRICA) {
  const r = rubrica10 || {};
  const rubricaLLM =
    ((r.planoAula ?? 0) / 10) * pesos.planoAula +
    ((r.planoEnsinoEmenta ?? 0) / 10) * pesos.planoEnsinoEmenta +
    ((r.nivelPublicoModalidade ?? 0) / 10) * pesos.nivelPublicoModalidade +
    ((r.qualidadeDidatica ?? 0) / 10) * pesos.qualidadeDidatica +
    ((r.clarezaEstrutura ?? 0) / 10) * pesos.clarezaEstrutura;

  const score = 0.7 * rubricaLLM + 0.3 * (determ0a1 ?? 0);
  return {
    score: Math.round(Math.max(0, Math.min(1, score)) * 100) / 100,
    rubricaLLM: Math.round(Math.max(0, Math.min(1, rubricaLLM)) * 100) / 100
  };
}

// Extrai os 5 critérios da rubrica de um texto de revisão (formato pedido em
// revisaoQualidadeSkill: "Critério: N/10"). Retorna null se nenhum critério
// for reconhecido — aciona o fallback para o formato antigo de nota única.
function parseRubricaCriterios(texto) {
  const t = texto || '';
  const buscar = (label) => {
    const re = new RegExp(label + '\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*/\\s*10', 'i');
    const m = t.match(re);
    return m ? Math.max(0, Math.min(10, parseFloat(m[1]))) : null;
  };
  const criterios = {
    planoAula: buscar('Ader[êe]ncia ao Plano de Aula'),
    planoEnsinoEmenta: buscar('Ader[êe]ncia ao Plano de Ensino e Ementa'),
    nivelPublicoModalidade: buscar('Adequa[çc][ãa]o a N[íi]vel[/,]P[úu]blico[/,]Modalidade'),
    qualidadeDidatica: buscar('Qualidade Did[áa]tica'),
    clarezaEstrutura: buscar('Clareza e Estrutura')
  };
  const valores = Object.values(criterios);
  if (valores.some(v => v === null)) return null;
  // determ=0 aqui é só para reaproveitar o cálculo da média ponderada da
  // rubrica dentro de computeScoreComposto — o campo `rubricaLLM` retornado
  // já é o valor puro (0-1), sem o fator de composição 0.7/0.3.
  const { rubricaLLM } = computeScoreComposto(criterios, 0);
  return { criterios, rubricaLLM };
}

// Rótulos legíveis dos critérios da rubrica (chave interna → nome exibido).
const ROTULOS_CRITERIOS = {
  planoAula: 'Aderência ao Plano de Aula',
  planoEnsinoEmenta: 'Aderência ao Plano de Ensino e Ementa',
  nivelPublicoModalidade: 'Adequação a Nível/Público/Modalidade',
  qualidadeDidatica: 'Qualidade Didática',
  clarezaEstrutura: 'Clareza e Estrutura'
};

// Monta a linha "Foco sugerido desta rodada" a partir dos critérios parseados
// da rubrica — o critério de menor nota é onde uma melhoria tem mais espaço
// de ganho (nivelamento) e, pelos pesos do score composto, é a única direção
// com chance sistemática de passar no gate de aceite (+0.02). Retorna '' se
// todos os critérios estiverem ≥ 9 (sem foco: sinal de convergência).
function buildFocoSugerido(criterios) {
  const entradas = Object.entries(criterios || {}).filter(([, v]) => typeof v === 'number');
  if (!entradas.length) return '';
  const [chaveMin, notaMin] = entradas.reduce((min, e) => (e[1] < min[1] ? e : min));
  if (notaMin >= 9) return '';
  return `\n\n**Foco sugerido desta rodada:** ${ROTULOS_CRITERIOS[chaveMin] || chaveMin} (${notaMin}/10)\n`;
}

// ── Diretório "saídas" — memória persistente entre etapas ──────────────────
const SAIDAS_ROOT = path.join(__dirname, 'saídas');

function slugify(s) {
  return (s || 'curso')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'curso';
}

function courseRootDir(sess) {
  const dir = sess.config?.pastaProjeto?.trim() || path.join(SAIDAS_ROOT, slugify(sess.config?.nome));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function courseScrDir(sess) {
  const dir = path.join(courseRootDir(sess), 'scr');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Subpasta dos vídeos de avatar gerados (Etapa 10) — criada sob demanda no
// primeiro download, não antecipadamente (mesmo padrão de courseScrDir, mas
// só chamada quando de fato há um vídeo pronto para gravar).
function videosDir(sess) {
  const dir = path.join(courseRootDir(sess), 'videos');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Abre o diálogo nativo de seleção de pasta do Windows a partir do processo do
// servidor (necessário porque navegadores não expõem caminhos absolutos de
// pastas ao JavaScript da página). Só faz sentido para uso local, com servidor
// e navegador na mesma máquina — ver capability native-folder-picker.
// Última pasta escolhida no seletor (persistida no servidor, para o diálogo
// abrir nela da próxima vez em vez de na raiz do usuário). O caminho do arquivo
// pode ser redirecionado por ULTIMA_PASTA_FILE (usado nos testes).
function ultimaPastaFile() {
  return process.env.ULTIMA_PASTA_FILE || path.join(__dirname, '.ultima-pasta.json');
}

// Devolve a última pasta lembrada, ou null se não houver, o arquivo estiver
// ilegível ou a pasta não existir mais.
function lerUltimaPasta() {
  try {
    const { pasta } = JSON.parse(fs.readFileSync(ultimaPastaFile(), 'utf-8'));
    if (typeof pasta === 'string' && pasta && fs.existsSync(pasta)) return pasta;
  } catch { /* sem arquivo ou ilegível: sem pasta lembrada */ }
  return null;
}

function gravarUltimaPasta(pasta) {
  try {
    fs.writeFileSync(ultimaPastaFile(), JSON.stringify({ pasta, atualizadoEm: new Date().toISOString() }, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[escolher-pasta] Não foi possível gravar a última pasta: ${err.message}`);
  }
}

function escolherPastaWindows(pastaInicial = null) {
  return new Promise((resolve, reject) => {
    // Usa um Form invisível TopMost como dono do diálogo em vez de tentar
    // reaproveitar o HWND do navegador via GetForegroundWindow/P-Invoke: mais
    // simples (sem compilação de C# via Add-Type) e mais confiável, porque
    // TopMost força o diálogo acima de qualquer janela independentemente de
    // qual processo está com foco no instante em que o script roda.
    const script = `
      Add-Type -AssemblyName System.Windows.Forms

      $owner = New-Object System.Windows.Forms.Form
      $owner.TopMost = $true
      $owner.StartPosition = 'CenterScreen'
      $owner.Width = 0
      $owner.Height = 0
      $owner.ShowInTaskbar = $false
      [void]$owner.Show()
      [void]$owner.Focus()

      $f = New-Object System.Windows.Forms.FolderBrowserDialog
      $f.Description = 'Selecione a pasta do projeto'
      if ($env:PASTA_INICIAL) { $f.SelectedPath = $env:PASTA_INICIAL }

      $result = $f.ShowDialog($owner)
      $owner.Close()

      if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $f.SelectedPath
      }
    `;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', script],
      // A pasta inicial vai por variável de ambiente (não interpolada no script).
      { timeout: 120_000, env: { ...process.env, PASTA_INICIAL: pastaInicial || '' } },
      (err, stdout, stderr) => {
        if (err) {
          if (stderr) err.message += `\n${stderr}`;
          return reject(err);
        }
        const pasta = stdout.trim();
        resolve(pasta || null);
      }
    );
  });
}

// Lê a "memória" (texto puro) de uma etapa já persistida, se existir.
function readMemory(sess, baseName) {
  try {
    return fs.readFileSync(path.join(courseScrDir(sess), `${baseName}.txt`), 'utf-8');
  } catch {
    return '';
  }
}

// Reconstrói sess.aulas a partir dos arquivos aula{NN}_conteudo.txt em disco,
// para projetos cujo projeto.json ficou com "aulas": [] (ex.: sessão perdida
// em memória antes de sess.aulas ser persistida), mas cujo conteúdo de cada
// aula já foi gerado e gravado normalmente. Extrai o título da primeira linha
// de cada arquivo (formato "# Aula N - Título" / "# Aula N: Título").
function reconstruirAulasApartirDosArquivos(sess) {
  let arquivos;
  try {
    arquivos = fs.readdirSync(courseScrDir(sess));
  } catch {
    return [];
  }
  const indices = arquivos
    .map(f => f.match(/^aula(\d+)_conteudo\.txt$/))
    .filter(Boolean)
    .map(m => Number(m[1]))
    .sort((a, b) => a - b);

  return indices.map(n => {
    const idx = String(n).padStart(2, '0');
    const primeiraLinha = readMemory(sess, `aula${idx}_conteudo`).split('\n')[0] || '';
    const tituloMatch = primeiraLinha.match(/Aula\s*\d+\s*[-:–]\s*(.+)$/i);
    return { titulo: tituloMatch ? tituloMatch[1].trim() : `Aula ${n}`, modulo: '', objetivos: '' };
  });
}

// Restaura sess.conteudoPorAula a partir do disco quando a sessão in-memory
// está vazia (ex.: restart do servidor, refresh de página sem carregar projeto).
// Opera em cascata: sess.aulas → projeto.json → arquivos em disco → erro 400
// (responsabilidade do caller).
function restoreConteudoPorAula(sess) {
  if (sess.conteudoPorAula?.length) return;

  if (!sess.aulas?.length && sess.config?.nome) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(courseScrDir(sess), 'projeto.json'), 'utf-8'));
      if (p.aulas?.length) {
        sess.aulas = p.aulas;
        if (p.config) Object.assign(sess.config, p.config);
      }
    } catch { /* projeto.json ausente ou corrompido — caller verifica resultado */ }
  }

  if (!sess.aulas?.length && sess.config?.nome) {
    const reconstruidas = reconstruirAulasApartirDosArquivos(sess);
    if (reconstruidas.length) {
      console.warn(`[restoreConteudoPorAula] projeto.json com "aulas" vazio para "${sess.config.nome}" — reconstruído a partir de ${reconstruidas.length} arquivo(s) aula*_conteudo.txt em disco.`);
      sess.aulas = reconstruidas;
      saveProject(sess);
    }
  }

  if (sess.aulas?.length) {
    sess.conteudoPorAula = sess.aulas.map((aula, i) => {
      const idx = String(i + 1).padStart(2, '0');
      return { ...aula, texto: readMemory(sess, `aula${idx}_conteudo`) };
    });
  }
}

// Serializa os campos não-textuais da sessão em projeto.json para recuperação futura.
function saveProject(sess, stageInfo = null) {
  if (!sess.config?.nome) return;
  const scrDir = courseScrDir(sess);
  const projetoPath = path.join(scrDir, 'projeto.json');
  let projeto = {};
  try {
    projeto = JSON.parse(fs.readFileSync(projetoPath, 'utf-8'));
  } catch { /* arquivo novo ou corrompido */ }

  projeto.config = sess.config;
  projeto.bncc = sess.bncc || { ativo: false, publico: null, nivel: null, itens: [] };
  projeto.metodologia = sess.metodologia || '';
  projeto.aulas = sess.aulas || [];
  projeto.inputs = sess.inputs || {};
  projeto.estiloVisual = sess.estiloVisual || null;
  projeto.slidesTemplate = sess.slidesTemplate || null;
  projeto.roteiroBlocos = sess.roteiroBlocos || null;
  projeto.roteirosGerados = sess.roteirosGerados || [];
  projeto.slidesObservacaoDefault = sess.slidesObservacaoDefault || '';
  projeto.slidesQuantidadeDefault = sess.slidesQuantidadeDefault || null;
  projeto.slidesGerados = sess.slidesGerados || [];
  projeto.heygenConfig = sess.heygenConfig || null;
  projeto.roteirosAvatarGerados = sess.roteirosAvatarGerados || [];
  projeto.duracaoAvatarDefault = sess.duracaoAvatarDefault || null;
  projeto.videosAvatarGerados = sess.videosAvatarGerados || [];
  // Estado de completude do conteúdo por aula (completa | curta | incompleta);
  // ausente em projetos antigos = completa.
  if (sess.estadoAulas) projeto.estadoAulas = sess.estadoAulas;
  projeto.ultimaModificacao = new Date().toISOString();
  if (!projeto.stages) projeto.stages = {};
  if (stageInfo?.baseName) {
    projeto.stages[stageInfo.baseName] = {
      fonte: stageInfo.fonte || 'ia',
      geradoEm: new Date().toISOString()
    };
  }
  // Escrita atômica: arquivo temporário + rename, para nunca deixar um
  // projeto.json parcial (ou com restos de uma versão mais longa anterior).
  const tmpPath = `${projetoPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(projeto, null, 2), 'utf-8');
    fs.renameSync(tmpPath, projetoPath);
  } catch (err) {
    console.error('[saveProject] Erro ao gravar projeto.json:', err.message);
    try { fs.unlinkSync(tmpPath); } catch { /* temporário já ausente */ }
  }
}

// Persiste o resultado de uma etapa em disco: um .txt em /scr (memória, lido pelas
// próximas etapas) e um .docx na raiz (entregável formatado, igual ao da exportação).
async function persistStage(sess, baseName, label, content, sites = [], fonte = 'ia') {
  try {
    const scrDir = courseScrDir(sess);
    const rootDir = courseRootDir(sess);
    fs.writeFileSync(path.join(scrDir, `${baseName}.txt`), content, 'utf-8');
    const doc = buildDocx(sess.config, label, content, sites);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(rootDir, `${baseName}.docx`), buffer);
    saveProject(sess, { baseName, fonte });
  } catch (err) {
    console.error(`Erro ao persistir "${baseName}":`, err.message);
  }
}

// ── Integração com a API do Gamma (Etapa 8 — Slides) ────────────────────────
// Cria uma geração no Gamma (POST /generations) — primeiro passo do fluxo
// assíncrono create → poll → download. Nenhum SDK oficial é usado: é uma API
// REST simples, chamada via fetch nativo do Node (sem dependência nova).
async function criarGeracaoGamma(payload, client = null, endpointPath = '/generations') {
  requireApiKey(GAMMA_API_KEY, 'GAMMA_API_KEY');
  const timeoutSignal = makeAbortSignal(30_000);
  const resp = await fetchObs(`${GAMMA_API_BASE}${endpointPath}`, {
    method: 'POST',
    headers: { 'X-API-KEY': GAMMA_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: client ? combineSignals(client.signal, timeoutSignal) : timeoutSignal
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error(`Gamma retornou ${resp.status} ao criar a geração dos slides.${detalhe ? ' ' + detalhe : ''}`);
  }
  return resp.json();
}

// Aguarda a conclusão de uma geração do Gamma via polling (a API não oferece
// webhook). Respeita a desconexão do cliente SSE e um teto de tempo total —
// a maioria das gerações conclui em 1-3 min, segundo a documentação do Gamma.
async function aguardarGeracaoGamma(generationId, client) {
  const prazo = Date.now() + GAMMA_POLL_TIMEOUT_MS;
  while (Date.now() < prazo) {
    if (client.disconnected) throw new Error('Cliente desconectado durante a geração dos slides.');

    const timeoutSignal = makeAbortSignal(30_000);
    const resp = await fetchObs(`${GAMMA_API_BASE}/generations/${generationId}`, {
      headers: { 'X-API-KEY': GAMMA_API_KEY },
      signal: combineSignals(client.signal, timeoutSignal)
    });
    if (!resp.ok) {
      throw new Error(`Gamma retornou ${resp.status} ao consultar o andamento da geração.`);
    }
    const data = await resp.json();
    if (data.status === 'completed') return data;
    if (data.status === 'failed') {
      throw new Error(data.error?.message || 'A geração dos slides falhou no Gamma.');
    }
    await new Promise(r => setTimeout(r, GAMMA_POLL_INTERVAL_MS));
  }
  throw new Error('Tempo limite excedido aguardando a geração dos slides no Gamma.');
}

// Baixa o .pptx pronto a partir do exportUrl retornado pelo Gamma e grava no
// mesmo local/nome de sempre (aula{NN}_slides.pptx em courseRootDir) — mesmo
// contrato de saída do antigo persistPptxStage, só a origem do arquivo muda.
// exportUrl é um link de download efêmero (~1 semana) sem controle de acesso;
// nunca é logado nem devolvido ao cliente — o download acontece só aqui.
async function persistGammaSlidesStage(sess, baseName, exportUrl) {
  const resp = await fetchObs(exportUrl);
  if (!resp.ok) {
    throw new Error(`Falha ao baixar o .pptx gerado pelo Gamma (status ${resp.status}).`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const rootDir = courseRootDir(sess);
  const fullPath = path.join(rootDir, `${baseName}.pptx`);
  fs.writeFileSync(fullPath, buffer);
  saveProject(sess, { baseName, fonte: 'ia' });
  return fullPath;
}

// Resolve o nome de cada template configurado em GAMMA_TEMPLATE_IDS
// consultando GET /gammas/{id}. Diferente do HeyGen (lista tudo do
// workspace e filtra), a API do Gamma não expõe um endpoint de listagem
// geral de gammas da conta — só consulta por ID já conhecido — por isso o
// caminho é o inverso: um GET por ID já configurado. Um ID inacessível ou
// removido é logado e omitido do resultado, sem derrubar a lista inteira.
async function listarTemplatesGamma() {
  if (!GAMMA_TEMPLATE_IDS.length) return [];
  requireApiKey(GAMMA_API_KEY, 'GAMMA_API_KEY');
  const templates = await Promise.all(GAMMA_TEMPLATE_IDS.map(async (id) => {
    try {
      const timeoutSignal = makeAbortSignal(30_000);
      const resp = await fetchObs(`${GAMMA_API_BASE}/gammas/${id}`, {
        headers: { 'X-API-KEY': GAMMA_API_KEY },
        signal: timeoutSignal
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const data = await resp.json();
      return { id, title: data.title || id };
    } catch (err) {
      console.warn(`[listarTemplatesGamma] Template ${id} indisponível: ${err.message}`);
      return null;
    }
  }));
  return templates.filter(Boolean);
}

// ── Integração com a API do HeyGen (Etapa 10 — Vídeo com avatar) ───────────
// Busca todas as páginas de um endpoint HeyGen paginado (contrato comum a
// /v3/voices: array em `data`, mais `has_more`/`next_token`) — usado porque
// o catálogo (principalmente vozes públicas) costuma passar de uma única
// página, e um item além da primeira ficava invisível na Etapa 10 mesmo
// estando no workspace do usuário.
// maxPaginas é uma salvaguarda contra loop infinito, não um limite prático
// (o maior catálogo observado, vozes públicas, tem ~2.400 itens em ~24
// páginas de 100).
async function paginarHeygen(path, baseParams = {}, { maxPaginas = 100 } = {}) {
  const itens = [];
  let token = null;
  for (let i = 0; i < maxPaginas; i++) {
    const params = new URLSearchParams(baseParams);
    if (token) params.set('token', token);
    const timeoutSignal = makeAbortSignal(30_000);
    const resp = await fetchObs(`${HEYGEN_API_BASE}${path}?${params.toString()}`, {
      headers: { 'x-api-key': HEYGEN_API_KEY },
      signal: timeoutSignal
    });
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => '');
      throw new Error(`HeyGen retornou ${resp.status} ao buscar ${path}.${detalhe ? ' ' + detalhe : ''}`);
    }
    const data = await resp.json();
    itens.push(...(data.data || []));
    if (!data.has_more) break;
    token = data.next_token;
  }
  return itens;
}

// Lista os avatares próprios do usuário (grupos custom — digital twins,
// studio avatars, photo avatars — e os "looks" dentro de cada grupo), para
// o menu de configuração da Etapa 10. NÃO usa GET /v3/avatars/looks: esse
// endpoint devolve o catálogo PÚBLICO inteiro do HeyGen misturado com os
// avatares do usuário (milhares de itens, sem nenhum parâmetro de filtro
// por dono — `type`/`owner`/`source` são todos rejeitados com "Extra inputs
// are not permitted"), então paginar até o fim levaria minutos.
// Tenta primeiro /v3/avatar_groups; os endpoints v2 (avatar_group.list?
// include_public=false + avatar_group/{id}/avatars) são legados (sunset
// 2026-10-31) e só servem de fallback enquanto a v3 responde 404 ou formato
// não reconhecido. Devolve { avatares, origem: 'v3' | 'v2' }.
async function listarAvataresHeygen() {
  requireApiKey(HEYGEN_API_KEY, 'HEYGEN_API_KEY');
  let resultado = await listarAvataresHeygenV3();
  if (!resultado) resultado = { avatares: await listarAvataresHeygenV2(), origem: 'v2' };
  const { avatares, origem } = resultado;
  if (!HEYGEN_AVATAR_IDS.length) return { avatares, origem };
  return { avatares: avatares.filter(a => HEYGEN_AVATAR_IDS.includes(a.id)), origem };
}

// Normaliza uma lista de grupos/looks da v3 (`data` array, tolerando também
// `data.<lista>`) — formato ainda não confirmado com a chave real (ver
// scripts/smoke-pesquisa.js e a change verificacao-pesquisa-e-prazos), por
// isso é defensivo: formato inesperado devolve null e aciona o fallback v2.
function extrairListaHeygenV3(json, chaves) {
  if (Array.isArray(json?.data)) return json.data;
  for (const k of chaves) if (Array.isArray(json?.data?.[k])) return json.data[k];
  return null;
}

async function listarAvataresHeygenV3() {
  const respGrupos = await fetchObs(`${HEYGEN_API_BASE}/v3/avatar_groups?include_public=false`, {
    headers: { 'x-api-key': HEYGEN_API_KEY },
    signal: makeAbortSignal(30_000)
  });
  if (respGrupos.status === 404) return null;
  if (!respGrupos.ok) {
    const detalhe = await respGrupos.text().catch(() => '');
    throw new Error(`HeyGen retornou ${respGrupos.status} ao listar grupos de avatares.${detalhe ? ' ' + detalhe : ''}`);
  }
  const grupos = extrairListaHeygenV3(await respGrupos.json(), ['avatar_groups', 'avatar_group_list']);
  if (!grupos) return null;

  const looksPorGrupo = [];
  for (const grupo of grupos) {
    const resp = await fetchObs(`${HEYGEN_API_BASE}/v3/avatar_groups/${grupo.id}/avatars`, {
      headers: { 'x-api-key': HEYGEN_API_KEY },
      signal: makeAbortSignal(30_000)
    });
    if (resp.status === 404) return null;
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => '');
      throw new Error(`HeyGen retornou ${resp.status} ao listar avatares do grupo ${grupo.name || grupo.id}.${detalhe ? ' ' + detalhe : ''}`);
    }
    const looks = extrairListaHeygenV3(await resp.json(), ['avatars', 'avatar_list']);
    if (!looks) return null;
    const avatarType = `${(grupo.group_type || grupo.type || 'custom').toLowerCase()}_avatar`;
    looksPorGrupo.push(looks.map(look => ({
      id: look.id,
      name: look.name || grupo.name,
      avatar_type: avatarType,
      preview_image_url: look.image_url || look.preview_image_url || grupo.preview_image || ''
    })));
  }
  return { avatares: looksPorGrupo.flat(), origem: 'v3' };
}

async function listarAvataresHeygenV2() {
  const timeoutSignalGrupos = makeAbortSignal(30_000);
  const respGrupos = await fetchObs(`${HEYGEN_API_BASE}/v2/avatar_group.list?include_public=false`, {
    headers: { 'x-api-key': HEYGEN_API_KEY },
    signal: timeoutSignalGrupos
  });
  if (!respGrupos.ok) {
    const detalhe = await respGrupos.text().catch(() => '');
    throw new Error(`HeyGen retornou ${respGrupos.status} ao listar grupos de avatares.${detalhe ? ' ' + detalhe : ''}`);
  }
  const dataGrupos = await respGrupos.json();
  const grupos = dataGrupos.data?.avatar_group_list || [];

  const looksPorGrupo = await Promise.all(grupos.map(async (grupo) => {
    const timeoutSignal = makeAbortSignal(30_000);
    const resp = await fetchObs(`${HEYGEN_API_BASE}/v2/avatar_group/${grupo.id}/avatars`, {
      headers: { 'x-api-key': HEYGEN_API_KEY },
      signal: timeoutSignal
    });
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => '');
      throw new Error(`HeyGen retornou ${resp.status} ao listar avatares do grupo ${grupo.name || grupo.id}.${detalhe ? ' ' + detalhe : ''}`);
    }
    const data = await resp.json();
    const looks = data.data?.avatar_list || [];
    const avatarType = `${(grupo.group_type || 'custom').toLowerCase()}_avatar`;
    return looks.map(look => ({
      id: look.id,
      name: look.name || grupo.name,
      avatar_type: avatarType,
      preview_image_url: look.image_url || grupo.preview_image || ''
    }));
  }));

  return looksPorGrupo.flat();
}

// Lista as vozes do workspace (públicas do HeyGen + privadas/clonadas pelo
// usuário), com filtros opcionais de idioma/gênero/tipo. Quando `type` não é
// especificado, busca públicas E privadas e combina — a API do HeyGen só
// devolve o catálogo público se `type` for omitido, então vozes clonadas do
// usuário nunca apareceriam com uma única chamada sem type. Vozes privadas
// não recebem o filtro de idioma: elas tipicamente vêm sem idioma marcado
// (`language: "unknown"`) e o filtro de idioma do HeyGen as excluiria mesmo
// sendo vozes legítimas do usuário.
async function listarVozesHeygen({ type, language, gender } = {}) {
  requireApiKey(HEYGEN_API_KEY, 'HEYGEN_API_KEY');
  const baseParams = { limit: '100' };
  if (gender) baseParams.gender = gender;

  if (type) {
    const params = { ...baseParams, type };
    if (language) params.language = language;
    const vozes = await paginarHeygen('/v3/voices', params);
    return HEYGEN_VOICE_IDS.length ? vozes.filter(v => HEYGEN_VOICE_IDS.includes(v.voice_id)) : vozes;
  }

  const paramsPublicas = { ...baseParams, type: 'public' };
  if (language) paramsPublicas.language = language;
  const paramsPrivadas = { ...baseParams, type: 'private' };

  const [publicas, privadas] = await Promise.all([
    paginarHeygen('/v3/voices', paramsPublicas),
    paginarHeygen('/v3/voices', paramsPrivadas)
  ]);
  const vozes = [...privadas, ...publicas];
  if (!HEYGEN_VOICE_IDS.length) return vozes;
  return vozes.filter(v => HEYGEN_VOICE_IDS.includes(v.voice_id));
}

// Cria o vídeo do avatar (fluxo "Avatar Video", determinístico — narra o
// script literalmente, diferente do "Video Agent" que reescreve o texto).
async function criarVideoHeygen(payload, client = null) {
  requireApiKey(HEYGEN_API_KEY, 'HEYGEN_API_KEY');
  const timeoutSignal = makeAbortSignal(30_000);
  const resp = await fetchObs(`${HEYGEN_API_BASE}/v3/videos`, {
    method: 'POST',
    headers: { 'x-api-key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: client ? combineSignals(client.signal, timeoutSignal) : timeoutSignal
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error(`HeyGen retornou ${resp.status} ao criar o vídeo do avatar.${detalhe ? ' ' + detalhe : ''}`);
  }
  const data = await resp.json();
  return data.data;
}

// Aguarda a conclusão do vídeo via polling (sem webhook nesta primeira
// versão — mesmo padrão do Gamma). Respeita a desconexão do cliente SSE e um
// teto de tempo total maior que o do Gamma (vídeo de avatar demora mais).
async function aguardarVideoHeygen(videoId, client) {
  const prazo = Date.now() + HEYGEN_POLL_TIMEOUT_MS;
  while (Date.now() < prazo) {
    if (client.disconnected) throw new Error('Cliente desconectado durante a geração do vídeo.');

    const timeoutSignal = makeAbortSignal(30_000);
    const resp = await fetchObs(`${HEYGEN_API_BASE}/v3/videos/${videoId}`, {
      headers: { 'x-api-key': HEYGEN_API_KEY },
      signal: combineSignals(client.signal, timeoutSignal)
    });
    if (!resp.ok) {
      throw new Error(`HeyGen retornou ${resp.status} ao consultar o andamento do vídeo.`);
    }
    const { data } = await resp.json();
    if (data.status === 'completed') return data;
    if (data.status === 'failed') {
      throw new Error(data.error?.message || 'A geração do vídeo falhou no HeyGen.');
    }
    await new Promise(r => setTimeout(r, HEYGEN_POLL_INTERVAL_MS));
  }
  throw new Error('Tempo limite excedido aguardando a geração do vídeo no HeyGen.');
}

// Baixa o .mp4 pronto e grava em videos/aula{NN}_video.mp4 dentro da pasta do
// projeto — mesmo contrato de persistGammaSlidesStage, mas em videosDir().
async function persistHeygenVideoStage(sess, baseName, videoUrl) {
  const resp = await fetchObs(videoUrl);
  if (!resp.ok) {
    throw new Error(`Falha ao baixar o .mp4 gerado pelo HeyGen (status ${resp.status}).`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const fullPath = path.join(videosDir(sess), `${baseName}.mp4`);
  fs.writeFileSync(fullPath, buffer);
  saveProject(sess, { baseName, fonte: 'ia' });
  return fullPath;
}

// ── SSE helper ──────────────────────────────────────────────────────────────
function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function send(res, obj) {
  if (obj && obj.type === 'done') obj = enriquecerDone(obj);
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// Erro de pré-condição em rota SSE: EventSource não lê corpo de resposta
// não-200, então a recusa precisa chegar como evento SSE.
function sseError(res, message) {
  sseHeaders(res);
  send(res, { type: 'error', message });
  res.end();
}

// ── Contador global de tokens utilizados (todas as etapas/sessões) ─────────
const tokenUsage = { prompt: 0, completion: 0, total: 0 };

// Nome estável do span de uma chamada externa: provedor + método + caminho sem
// ids (ex.: "heygen.get.v3/videos", "gamma.post.generations", "download.get.arquivo").
function nomeSpanExterno(url, init) {
  const prov = String(url).startsWith(GAMMA_API_BASE) ? 'gamma' : String(url).startsWith(HEYGEN_API_BASE) ? 'heygen' : 'download';
  let seg = 'raiz';
  try {
    const partes = new URL(url).pathname.split('/').filter(Boolean)
      .filter(p => !/^[0-9a-f-]{8,}$/i.test(p) && !/^[A-Za-z0-9_]{16,}$/.test(p));
    seg = prov === 'download' ? 'arquivo' : (partes.slice(0, 3).join('/') || 'raiz');
  } catch { /* URL inválida cai em "raiz" */ }
  return `${prov}.${String(init?.method || 'GET').toLowerCase()}.${seg}`;
}

// fetch das integrações externas (Gamma, HeyGen e downloads) com span de
// observabilidade (status e duração). Devolve exatamente a resposta do fetch.
async function fetchObs(url, init) {
  const inicio = Date.now();
  const nome = nomeSpanExterno(url, init);
  try {
    const resp = await fetch(url, init);
    observabilidade.registrarSpan({ nome, inicio, status: resp.status, erro: resp.status >= 500 ? `HTTP ${resp.status}` : null });
    return resp;
  } catch (err) {
    observabilidade.registrarSpan({ nome, inicio, erro: err.message || String(err) });
    throw err;
  }
}

// Fecha o `done` SSE com os números reais da etapa: tokens, custo (USD) e, com
// o Langfuse ligado, o link do trace. Só quando houve chamadas ao LLM.
function enriquecerDone(obj) {
  const ctx = observabilidade.contexto();
  if (!ctx || !ctx.geracoes) return obj;
  const traceUrl = observabilidade.urlTrace(ctx.traceId);
  return {
    ...obj,
    traceId: ctx.traceId,
    tokens: ctx.tokens.total,
    custoUsd: ctx.custoDesconhecido && !ctx.custoUsd ? null : Number(ctx.custoUsd.toFixed(6)),
    ...(traceUrl ? { traceUrl } : {})
  };
}

// scr/geracao_log.json — uma linha por chamada ao LLM, com o traceId para
// cruzar o registro local com o painel do Langfuse. Só com projeto identificável.
// Acrescenta uma entrada em scr/geracao_log.json (últimas 2000), só com projeto
// identificável. Nunca interrompe a geração.
function anexarGeracaoLog(sess, entrada) {
  if (!sess || !(sess.config?.nome || sess.config?.pastaProjeto)) return;
  try {
    const arquivo = path.join(courseScrDir(sess), 'geracao_log.json');
    let dados = [];
    try { dados = JSON.parse(fs.readFileSync(arquivo, 'utf-8')); } catch { /* arquivo novo ou ilegível */ }
    if (!Array.isArray(dados)) dados = [];
    dados.push({ ...entrada, em: new Date().toISOString() });
    fs.writeFileSync(arquivo, JSON.stringify(dados.slice(-2000), null, 2), 'utf-8');
  } catch (err) {
    console.warn('[geracao_log] não foi possível gravar geracao_log.json:', err.message);
  }
}

// Uma linha por chamada ao LLM, com o traceId para cruzar com o painel do Langfuse.
function registrarGeracaoLog(ctx, resumo) {
  anexarGeracaoLog(ctx?.sess, {
    traceId: resumo.traceId,
    etapa: ctx?.etapa,
    ...ctx?.meta,
    modelo: resumo.modelo,
    tokens: resumo.usage ? { entrada: resumo.usage.prompt_tokens || 0, saida: resumo.usage.completion_tokens || 0, total: resumo.usage.total_tokens || 0 } : null,
    finishReason: resumo.finishReason || null,
    custoUsd: resumo.custoUsd,
    latenciaMs: resumo.latenciaMs,
    erro: resumo.erro
  });
}

// Resumo por aula: finish_reason, tokens de saída e palavras — para acompanhar
// truncamento e tamanho dos cursos ao longo do tempo.
function registrarGeracaoAula(sess, resumo) {
  const ctx = observabilidade.contexto();
  anexarGeracaoLog(sess, { tipo: 'aula', traceId: ctx?.traceId, etapa: 'conteudo', ...resumo });
}

function addUsage(usage, sess) {
  if (!usage) return;
  tokenUsage.prompt += usage.prompt_tokens || 0;
  tokenUsage.completion += usage.completion_tokens || 0;
  tokenUsage.total += usage.total_tokens || 0;
  // Histórico persistido por projeto — só quando há projeto identificável
  // (evita criar pasta "curso" antes da configuração da Etapa 1).
  if (sess?.config?.nome || sess?.config?.pastaProjeto) persistTokenUsage(sess, usage);
}

// ── Histórico de uso de tokens por projeto (scr/token_usage.json) ───────────
// Acumula o total e a quebra por dia; leitura tolerante a arquivo ausente ou
// corrompido (recomeça zerado sem interromper a geração).
function acumulaTokenUsage(atual, usage, dia) {
  const zero = () => ({ prompt: 0, completion: 0, total: 0 });
  const d = (atual && typeof atual === 'object' && !Array.isArray(atual)) ? atual : {};
  d.total = d.total || zero();
  d.porDia = d.porDia || {};
  d.porDia[dia] = d.porDia[dia] || zero();
  const somas = [['prompt', usage.prompt_tokens], ['completion', usage.completion_tokens], ['total', usage.total_tokens]];
  for (const [k, v] of somas) {
    d.total[k] = (d.total[k] || 0) + (v || 0);
    d.porDia[dia][k] = (d.porDia[dia][k] || 0) + (v || 0);
  }
  d.atualizadoEm = new Date().toISOString();
  return d;
}

function readTokenUsage(sess) {
  try {
    return JSON.parse(fs.readFileSync(path.join(courseScrDir(sess), 'token_usage.json'), 'utf-8'));
  } catch {
    return null;
  }
}

function persistTokenUsage(sess, usage) {
  try {
    const dia = new Date().toISOString().slice(0, 10);
    const dados = acumulaTokenUsage(readTokenUsage(sess), usage, dia);
    fs.writeFileSync(path.join(courseScrDir(sess), 'token_usage.json'), JSON.stringify(dados, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erro ao persistir token_usage.json:', e.message);
  }
}

// ── Histórico de scores por ciclo de melhorias (scr/score_historico.json) ──
// Alimenta o aviso de convergência (early stopping) no upload da próxima
// revisão anotada. Tolerante a arquivo ausente/corrompido (nunca bloqueia o
// ciclo de melhorias).
function readScoreHistorico(sess) {
  try {
    const dados = JSON.parse(fs.readFileSync(path.join(courseScrDir(sess), 'score_historico.json'), 'utf-8'));
    return Array.isArray(dados?.ciclos) ? dados : { ciclos: [] };
  } catch {
    return { ciclos: [] };
  }
}

function persistScoreHistorico(sess, registroCiclo) {
  try {
    const dados = readScoreHistorico(sess);
    dados.ciclos.push(registroCiclo);
    fs.writeFileSync(path.join(courseScrDir(sess), 'score_historico.json'), JSON.stringify(dados, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erro ao persistir score_historico.json:', e.message);
  }
}

// ── GET /api/bncc ───────────────────────────────────────────────────────────
app.get('/api/bncc', (req, res) => {
  const { nivel, tipo } = req.query;
  if (tipo === 'competencias') {
    return res.json({ itens: bnccData.competenciasGerais });
  }
  const nivelMap = { ef1: 'ef1', ef2: 'ef2', em: 'em' };
  const key = nivelMap[nivel];
  if (!key) {
    return res.status(400).json({ error: 'Parâmetro inválido. Use nivel=ef1|ef2|em ou tipo=competencias.' });
  }
  res.json({ itens: bnccData.habilidades[key] });
});

// ── POST /api/bncc/selecionar ────────────────────────────────────────────────
app.post('/api/bncc/selecionar', (req, res) => {
  const sess = getSession(req, res);
  const { publico, nivel, itens } = req.body;
  if (!itens || !itens.length) {
    return res.status(400).json({ error: 'Selecione ao menos um item antes de continuar.' });
  }
  sess.bncc = { ativo: true, publico: publico || 'adulto', nivel: nivel || 'competencias', itens };
  res.json({ ok: true });
});

// ── POST /api/bncc/pular ─────────────────────────────────────────────────────
app.post('/api/bncc/pular', (req, res) => {
  const sess = getSession(req, res);
  sess.bncc = { ativo: false, publico: null, nivel: null, itens: [] };
  res.json({ ok: true });
});

// ── GET /api/metodologia ─────────────────────────────────────────────────────
app.get('/api/metodologia', async (req, res) => {
  const sess = getSession(req, res);
  const client = clientAbort(res);
  const { nome, publico, carga, nivel, proporcaoTeoricoPratico, modalidade } = sess.config;
  try {
    const skill = skills.metodologiaSkill({ nome, publico, carga, nivel, proporcaoTeoricoPratico, modalidade });
    const completion = await chamarOpenAI('chat', {
      model: skill.model,
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    }, { signal: client.signal });
    addUsage(completion.usage, sess);
    sess.metodologia = completion.choices[0]?.message?.content?.trim() || '';
    res.json({ ok: true, metodologia: getMetodologia(sess) });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a geração da metodologia — interrompendo /api/metodologia');
      return;
    }
    console.error('Erro ao gerar metodologia:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/metodologia/confirmar — torna a metodologia definitiva ───────
// Ponto de confirmação explícito: gera a ementa pendente (se houver) usando a
// metodologia final (gerada por IA ou reimportada editada) e persiste a
// metodologia em disco, seguindo o mesmo padrão das demais etapas.
app.post('/api/metodologia/confirmar', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.metodologia) return res.status(400).json({ error: 'Gere a metodologia antes de confirmar.' });

  try {
    if (sess._precisaGerarEmenta) {
      const { nome, publico, carga, duracao, nivel, objetivos, modalidade } = sess.config;
      const skill = skills.ementaSkill({
        nome, publico, carga, duracao, nivel, objetivos, modalidade,
        metodologia: getMetodologia(sess),
        preRequisitos: sess.config.preRequisitos,
        bnccContext: buildPedagogicalContext(sess)
      });
      const completion = await chamarOpenAI('chat', {
        model: skill.model,
        messages: [
          { role: 'system', content: skill.system },
          { role: 'user', content: skill.user }
        ]
      });
      addUsage(completion.usage, sess);
      sess.ementa = completion.choices[0]?.message?.content?.trim() || '';
      sess._precisaGerarEmenta = false;
    }

    if (sess.ementa) await persistStage(sess, 'ementa', 'Ementa do Curso', sess.ementa);
    await persistStage(sess, 'metodologia', 'Metodologia Pedagógica', sess.metodologia);

    res.json({ ok: true, ementa: sess.ementa });
  } catch (err) {
    console.error('Erro ao confirmar metodologia:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/qualidade (SSE) ─────────────────────────────────────────────────
app.get('/api/qualidade', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.conteudo && !sess.conteudoPorAula?.length) {
    return sseError(res, 'Conclua ao menos a Etapa 5 antes de gerar o relatório de qualidade.');
  }
  sseHeaders(res);
  const client = clientAbort(res);
  send(res, { type: 'progress', message: 'Iniciando análise pedagógica...' });

  const resumosAulas = (sess.conteudoPorAula || [])
    .map((c, i) => `Aula ${i + 1}: ${c.titulo}\n${truncate(c.texto, 1500)}`)
    .join('\n\n---\n\n');

  const skill = skills.qualidadeSkill({
    config: sess.config,
    ementa: sess.ementa,
    planoEnsino: sess.planoEnsino,
    planoAula: sess.planoAula,
    resumosAulas,
    metodologia: getMetodologia(sess),
    bncc: sess.bncc,
    pesquisaBloco: blocoPesquisaGeral(sess)
  });

  try {
    send(res, { type: 'progress', message: 'Analisando coerência pedagógica...' });
    const stream = await chamarOpenAI('chat', {
      model: skill.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    }, { signal: client.signal });

    let fullText = '';
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        fullText += text;
        send(res, { type: 'token', text });
      }
      if (chunk.usage) addUsage(chunk.usage, sess);
    }
    if (client.disconnected) return;

    sess.relatorioQualidade = fullText;
    await persistStage(sess, 'relatorio_qualidade', 'Relatório Técnico-Pedagógico', fullText);
    send(res, { type: 'progress', message: 'Relatório concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a geração do relatório de qualidade — interrompendo /api/qualidade');
      return;
    }
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar relatório de qualidade' });
  } finally {
    res.end();
  }
});

// ── GET /api/ppc (SSE) ───────────────────────────────────────────────────────
app.get('/api/ppc', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.conteudo) {
    return sseError(res, 'Conclua a Etapa 5 antes de gerar o PPC.');
  }
  sseHeaders(res);
  const client = clientAbort(res);
  send(res, { type: 'progress', message: 'Gerando PPC — Perfil do Egresso...' });

  const pedagCtx = buildPedagogicalContext(sess);

  try {
    const perfilEgressoSkill = skills.perfilEgressoSkill({ config: sess.config, ementa: sess.ementa, planoEnsino: sess.planoEnsino });
    const perfilEgressoResp = await chamarOpenAI('chat', { model: perfilEgressoSkill.model, messages: [{ role: 'system', content: perfilEgressoSkill.system }, { role: 'user', content: perfilEgressoSkill.user }] }, { signal: client.signal });
    addUsage(perfilEgressoResp.usage, sess);
    const perfilEgresso = perfilEgressoResp.choices[0]?.message?.content?.trim() || '';
    if (client.disconnected) return;
    send(res, { type: 'progress', message: 'Gerando PPC — Competências e Habilidades...' });

    const competenciasSkill = skills.competenciasSkill({ config: sess.config, ementa: sess.ementa, planoEnsino: sess.planoEnsino, bncc: sess.bncc });
    const competenciasResp = await chamarOpenAI('chat', { model: competenciasSkill.model, messages: [{ role: 'system', content: competenciasSkill.system }, { role: 'user', content: competenciasSkill.user }] }, { signal: client.signal });
    addUsage(competenciasResp.usage, sess);
    const competencias = competenciasResp.choices[0]?.message?.content?.trim() || '';
    if (client.disconnected) return;
    send(res, { type: 'progress', message: 'Gerando PPC — Perfil Docente...' });

    const perfilDocenteSkill = skills.perfilDocenteSkill({ config: sess.config, ementa: sess.ementa });
    const perfilDocenteResp = await chamarOpenAI('chat', { model: perfilDocenteSkill.model, messages: [{ role: 'system', content: perfilDocenteSkill.system }, { role: 'user', content: perfilDocenteSkill.user }] }, { signal: client.signal });
    addUsage(perfilDocenteResp.usage, sess);
    const perfilDocente = perfilDocenteResp.choices[0]?.message?.content?.trim() || '';
    if (client.disconnected) return;
    send(res, { type: 'progress', message: 'Gerando PPC — Infraestrutura...' });

    const infraestruturaSkill = skills.infraestruturaSkill({ config: sess.config, conteudo: truncate(sess.conteudo, 3000) });
    const infraestruturaResp = await chamarOpenAI('chat', { model: infraestruturaSkill.model, messages: [{ role: 'system', content: infraestruturaSkill.system }, { role: 'user', content: infraestruturaSkill.user }] }, { signal: client.signal });
    addUsage(infraestruturaResp.usage, sess);
    const infraestrutura = infraestruturaResp.choices[0]?.message?.content?.trim() || '';
    if (client.disconnected) return;
    send(res, { type: 'progress', message: 'Montando documento PPC...' });

    const assemblySkill = skills.ppcAssemblySkill({
      config: sess.config, ementa: sess.ementa,
      pesquisa: blocoPesquisaGeral(sess) ? '' : truncate(sess.pesquisa, 1500), pesquisaBloco: blocoPesquisaGeral(sess),
      planoEnsino: truncate(sess.planoEnsino, 2000), planoAula: truncate(sess.planoAula, 1500),
      metodologia: getMetodologia(sess), bncc: sess.bncc,
      perfilEgresso, competencias, perfilDocente, infraestrutura
    });

    const stream = await chamarOpenAI('chat', {
      model: assemblySkill.model, stream: true, stream_options: { include_usage: true },
      messages: [{ role: 'system', content: assemblySkill.system }, { role: 'user', content: assemblySkill.user }]
    }, { signal: client.signal });

    let fullText = '';
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) { fullText += text; send(res, { type: 'token', text }); }
      if (chunk.usage) addUsage(chunk.usage, sess);
    }
    if (client.disconnected) return;

    await persistStage(sess, 'ppc_completo', 'Projeto Pedagógico de Curso', fullText);
    send(res, { type: 'progress', message: 'PPC concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a geração do PPC — interrompendo /api/ppc');
      return;
    }
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar PPC' });
  } finally {
    res.end();
  }
});

// ── GET /api/estilos-visuais — menu de estilos para a Etapa 8 ───────────────
// Mesmo padrão de GET /api/bncc: gera opções para o usuário escolher antes de
// prosseguir. Não-streaming — resposta rápida, SSE seria over-engineering aqui.
app.get('/api/estilos-visuais', async (req, res) => {
  const sess = getSession(req, res);
  const { nome, publico, nivel, objetivos, modalidade } = sess.config;
  try {
    const skill = skills.estiloVisualSkill({ nome, publico, nivel, objetivos, modalidade });
    const completion = await chamarOpenAI('chat', {
      model: skill.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    });
    addUsage(completion.usage, sess);
    let estilos = [];
    try {
      estilos = JSON.parse(completion.choices[0]?.message?.content || '{}').estilos || [];
    } catch {
      estilos = [];
    }
    res.json({ estilos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao gerar estilos visuais.' });
  }
});

// ── POST /api/estilos-visuais/selecionar ────────────────────────────────────
app.post('/api/estilos-visuais/selecionar', (req, res) => {
  const sess = getSession(req, res);
  const { id, titulo, housePrompt } = req.body || {};
  if (!housePrompt) {
    return res.status(400).json({ error: 'Selecione um estilo antes de continuar.' });
  }
  sess.estiloVisual = { id, titulo, housePrompt };
  saveProject(sess);
  res.json({ ok: true });
});

// ── Configuração do HeyGen (Etapa 10 — Vídeo com avatar), uma vez por curso ─
// Mesmo padrão do estiloVisual: menu → confirmar → persistir em sess/projeto.json.
// Diferença: as opções vêm direto do workspace HeyGen do usuário (via API),
// não são geradas por IA.
app.get('/api/heygen/avatares', async (req, res) => {
  try {
    const { avatares, origem } = await listarAvataresHeygen();
    res.json({ avatares, legado: origem === 'v2' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao listar avatares do HeyGen.' });
  }
});

// Filtra vozes em português por padrão (curso é sempre em português) — a API
// do HeyGen não distingue variantes (só existe o valor "Portuguese", sem
// separar Brasil/Portugal). `?language=` na query ainda permite sobrepor o
// padrão se algum dia fizer sentido buscar outro idioma.
const HEYGEN_VOZES_LANGUAGE_DEFAULT = 'Portuguese';

app.get('/api/heygen/vozes', async (req, res) => {
  try {
    const { type, language, gender } = req.query;
    const vozes = await listarVozesHeygen({ type, language: language || HEYGEN_VOZES_LANGUAGE_DEFAULT, gender });
    res.json({ vozes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao listar vozes do HeyGen.' });
  }
});

app.post('/api/heygen/config', (req, res) => {
  const sess = getSession(req, res);
  const { avatarId, avatarName, avatarType, voiceId, voiceName, expressiveness, motionPrompt } = req.body || {};
  if (!avatarId || !voiceId) {
    return res.status(400).json({ error: 'Selecione um avatar e uma voz antes de continuar.' });
  }
  sess.heygenConfig = {
    avatarId, avatarName: avatarName || '', avatarType: avatarType || '',
    voiceId, voiceName: voiceName || '',
    expressiveness: expressiveness || null,
    motionPrompt: motionPrompt?.trim() || ''
  };
  saveProject(sess);
  res.json({ ok: true });
});

// ── Etapa 8 — Slides, via API do Gamma, opcional e independente ────────────
// Reorganiza o conteúdo JÁ gerado de cada aula em slides — não gera conteúdo
// pedagógico novo, apenas estrutura/resume o que já existe. Pausa para
// revisão humana (quantidade de slides + observações) antes de cada aula,
// mesmo padrão de duas fases já usado na Etapa 9 (Roteiros): monta parâmetros
// (sem IA) → aprova → gera via SSE, com avanço automático entre aulas.

// Instrução fixa enviada em toda geração via template (modo
// POST /generations/from-template), antes de qualquer conteúdo específico
// da aula — preserva os elementos de marca fixos do template (logo etc.)
// independentemente do que a IA decidir sobre o resto do conteúdo.
const GAMMA_TEMPLATE_PROMPT_FIXO =
  'Preserve as logo do na parte superior direita e inferior esquerda. Essa logos sempre devem estar presentes e na mesma posição. ' +
  'Altere apenas os textos dentro dos cards e insira imagens que tenham relação com o tema, nas quadros reservados para as imagens. ' +
  'A explicação de cada imagem deve ficar na caixa de texto abaixo da respectiva imagem.';

// GET /api/slides/templates — resolve os templates Gamma configurados em
// GAMMA_TEMPLATE_IDS (nome via API); lista vazia quando não configurada,
// caso em que a seleção de template fica inativa na Etapa 8.
app.get('/api/slides/templates', async (req, res) => {
  try {
    const templates = await listarTemplatesGamma();
    res.json({ templates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao listar templates do Gamma.' });
  }
});

// POST /api/slides/template — grava a escolha do template Gamma para todo o
// curso (todas as aulas geradas neste ciclo usam o mesmo template).
app.post('/api/slides/template', async (req, res) => {
  const sess = getSession(req, res);
  const { templateId } = req.body || {};
  if (!templateId || !GAMMA_TEMPLATE_IDS.includes(templateId)) {
    return res.status(400).json({ error: 'Selecione um template válido antes de continuar.' });
  }
  try {
    const templates = await listarTemplatesGamma();
    const template = templates.find(t => t.id === templateId);
    if (!template) {
      return res.status(400).json({ error: 'Template indisponível no momento. Tente novamente.' });
    }
    sess.slidesTemplate = template;
    saveProject(sess);
    res.json({ ok: true, template: sess.slidesTemplate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao salvar o template escolhido.' });
  }
});

// GET /api/slides/parametros?index=N — metadados da aula + valores sticky
// atuais (quantidade/observação), sem chamar IA nenhuma.
app.get('/api/slides/parametros', (req, res) => {
  const sess = getSession(req, res);
  restoreConteudoPorAula(sess);
  if (!sess.conteudo && !sess.conteudoPorAula?.length) {
    return res.status(400).json({ error: 'Conclua a Etapa 5 antes de gerar os slides.' });
  }
  if (!sess.estiloVisual) {
    return res.status(400).json({ error: 'Escolha um estilo visual antes de gerar os slides.' });
  }
  if (GAMMA_TEMPLATE_IDS.length && !sess.slidesTemplate) {
    return res.status(400).json({ error: 'Escolha um template do Gamma antes de gerar os slides.' });
  }

  const aulas = sess.conteudoPorAula;
  const index = Number(req.query.index);
  if (!Number.isInteger(index) || index < 0 || index >= aulas.length) {
    return res.status(400).json({ error: 'Índice de aula inválido.' });
  }

  const aula = aulas[index];
  res.json({
    index,
    numero: String(index + 1).padStart(2, '0'),
    titulo: aula.titulo,
    total: aulas.length,
    observacaoPadrao: sess.slidesObservacaoDefault || '',
    quantidadePadrao: sess.slidesQuantidadeDefault || 3
  });
});

// POST /api/slides/parametros — aprova quantidade (1-5) e observação da aula,
// guardadas para a próxima chamada a GET /api/slides/gerar.
app.post('/api/slides/parametros', (req, res) => {
  const sess = getSession(req, res);
  const { index, texto, quantidade } = req.body || {};
  const i = Number(index);
  const q = Number(quantidade);
  if (!Number.isInteger(i) || !sess.conteudoPorAula?.[i]) {
    return res.status(400).json({ error: 'Índice de aula inválido.' });
  }
  if (!Number.isInteger(q) || q < 1 || q > 5) {
    return res.status(400).json({ error: 'Escolha uma quantidade de slides entre 1 e 5.' });
  }
  sess.slidesPendente = { index: i, texto: texto?.trim() || '', quantidade: q };
  res.json({ ok: true });
});

// GET /api/slides/gerar (SSE) — chama o Gamma para a aula pendente, persiste
// o .pptx e indica a próxima aula pendente (se houver) para avanço automático.
app.get('/api/slides/gerar', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.slidesPendente) {
    return sseError(res, 'Nenhum parâmetro de slides aprovado. Monte e confirme os parâmetros da aula antes de gerar.');
  }
  sseHeaders(res);
  const client = clientAbort(res);
  const { index, texto, quantidade } = sess.slidesPendente;
  const aulas = sess.conteudoPorAula;
  const aula = aulas[index];
  const numero = String(index + 1).padStart(2, '0');

  try {
    send(res, { type: 'progress', message: `Gerando slides da aula ${index + 1} de ${aulas.length}: ${aula.titulo}` });

    const payload = sess.slidesTemplate ? {
      gammaId: sess.slidesTemplate.id,
      prompt: [
        GAMMA_TEMPLATE_PROMPT_FIXO,
        `Público-alvo: ${sess.config.publico || 'não especificado'}. Nível do curso: ${sess.config.nivel || 'não especificado'} — ` +
          `adeque a densidade de informação e o vocabulário a esse nível, com tom leve, descontraído e acolhedor, adequado à faixa etária do público-alvo.`,
        `Gere exatamente ${quantidade} card(s) de conteúdo para esta aula, além dos cards fixos do template.`,
        `Conteúdo da aula "${aula.titulo}":\n${fundamentacao.limparParaMidia(aula.texto)}`,
        ...(texto ? [`Observações complementares desta aula: ${texto}`] : [])
      ].join('\n\n'),
      exportAs: 'pptx'
    } : {
      inputText: fundamentacao.limparParaMidia(aula.texto),
      textMode: 'condense',
      format: 'presentation',
      numCards: quantidade,
      textOptions: {
        amount: 'brief',
        audience: sess.config.publico || '',
        tone: `Tom leve, descontraído e acolhedor, adequado à faixa etária do público-alvo. ` +
          `Nível do curso: ${sess.config.nivel || 'não especificado'} — adeque a densidade de informação e o vocabulário a esse nível.`,
        language: 'pt-br'
      },
      imageOptions: {
        source: 'aiGenerated',
        style: `${sess.estiloVisual.housePrompt} A cena deve remeter ao tema desta aula: ${aula.titulo}.`
      },
      cardOptions: { dimensions: '16x9' },
      ...(texto ? { additionalInstructions: texto } : {}),
      exportAs: 'pptx'
    };

    const criacao = await criarGeracaoGamma(payload, client, sess.slidesTemplate ? '/generations/from-template' : '/generations');
    send(res, { type: 'progress', message: `Aguardando o Gamma concluir a geração da aula ${index + 1}...` });

    const resultado = await aguardarGeracaoGamma(criacao.generationId, client);
    if (client.disconnected) return;

    const baseName = `aula${numero}_slides`;

    // Atualiza os campos sticky/histórico ANTES de persistir — saveProject()
    // (chamado dentro de persistGammaSlidesStage) serializa o sess atual para
    // projeto.json, então a ordem importa: se fosse depois, a entrada desta
    // aula só apareceria em disco na próxima geração (nunca, se for a última).
    sess.slidesObservacaoDefault = texto;
    sess.slidesQuantidadeDefault = quantidade;
    sess.slidesGerados = sess.slidesGerados || [];
    sess.slidesGerados.push({ index, numero, titulo: aula.titulo, baseName, observacao: texto, quantidade, geradoEm: new Date().toISOString() });
    sess.slidesPendente = null;

    await persistGammaSlidesStage(sess, baseName, resultado.exportUrl);

    const proximoIndex = index + 1 < aulas.length ? index + 1 : null;
    send(res, { type: 'progress', message: `Slides da aula ${index + 1} concluídos` });
    send(res, { type: 'done', index, numero, baseName, titulo: aula.titulo, proximoIndex });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a geração dos slides — interrompendo /api/slides/gerar');
      return;
    }
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar slides' });
  } finally {
    res.end();
  }
});

// ── Etapa 9 — Roteiros de vídeo com avatar, opcional e independente ────────
// Requer apenas a Etapa 4 (Plano de Aula) concluída — fonte de sess.aulas
// (título + objetivos por aula). Gera exatamente um roteiro por aula do curso
// (quantidade = sess.aulas.length, nunca um número fixo), com revisão humana
// do prompt antes de cada chamada à IA — por isso o fluxo é dividido em
// operações locais (sem IA) e uma chamada de geração em SSE por aula, em vez
// de um loop server-side único como em Slides/Conteúdo.

// POST /api/roteiro/blocos — escolha do nº de blocos (1-6), uma única vez por
// curso, reaplicada a todas as aulas.
app.post('/api/roteiro/blocos', (req, res) => {
  const sess = getSession(req, res);
  const { blocos } = req.body || {};
  const n = Number(blocos);
  if (!Number.isInteger(n) || n < 1 || n > 6) {
    return res.status(400).json({ error: 'Escolha um número de blocos entre 1 e 6.' });
  }
  sess.roteiroBlocos = n;
  saveProject(sess);
  res.json({ ok: true, blocos: n });
});

// GET /api/roteiro/prompt?index=N — monta o prompt da aula N a partir do
// template + tema/objetivos/público-alvo/blocos. Não chama a IA.
app.get('/api/roteiro/prompt', async (req, res) => {
  const sess = getSession(req, res);
  const index = Number(req.query.index);

  if (!sess.aulas?.length) {
    return res.status(400).json({ error: 'Conclua a Etapa 4 (Plano de Aula) antes de gerar roteiros.' });
  }
  if (!Number.isInteger(index) || index < 0 || index >= sess.aulas.length) {
    return res.status(400).json({ error: 'Índice de aula inválido.' });
  }
  if (!sess.roteiroBlocos) {
    return res.status(400).json({ error: 'Escolha o número de blocos antes de gerar o roteiro.' });
  }

  const aula = sess.aulas[index];
  const tema = aula.titulo || `Aula ${index + 1}`;
  const objetivos = aula.objetivos || '';
  const temaObjetivos = objetivos ? `${tema}. Objetivos específicos: ${objetivos}` : tema;
  const idade = sess.config?.publico?.trim() || 'não especificado';

  try {
    const template = await getRoteiroTemplate();
    const prompt = preencherTemplateRoteiro(template, { temaObjetivos, idade, blocos: sess.roteiroBlocos });
    res.json({
      ok: true,
      index,
      numero: String(index + 1).padStart(2, '0'),
      titulo: aula.titulo,
      total: sess.aulas.length,
      prompt
    });
  } catch (err) {
    console.error('[roteiro] Erro ao montar prompt:', err.message);
    res.status(500).json({ error: 'Erro ao montar o prompt do roteiro: ' + err.message });
  }
});

// POST /api/roteiro/aprovar — guarda o prompt (possivelmente editado pelo
// usuário) aprovado para geração, lido em seguida por GET /api/roteiro/gerar.
app.post('/api/roteiro/aprovar', (req, res) => {
  const sess = getSession(req, res);
  const { index, texto } = req.body || {};
  const i = Number(index);
  if (!Number.isInteger(i) || !sess.aulas?.[i]) {
    return res.status(400).json({ error: 'Índice de aula inválido.' });
  }
  if (!texto?.trim()) {
    return res.status(400).json({ error: 'O prompt não pode ficar vazio.' });
  }
  sess.roteiroPendente = { index: i, texto: texto.trim() };
  res.json({ ok: true });
});

// GET /api/roteiro/gerar (SSE) — chama a IA com o prompt aprovado, persiste
// roteiro{NN}.txt/.docx, e indica a próxima aula pendente (se houver) para o
// cliente avançar automaticamente.
app.get('/api/roteiro/gerar', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.roteiroPendente) {
    return sseError(res, 'Nenhum prompt de roteiro aprovado. Monte e aprove o prompt antes de gerar.');
  }
  sseHeaders(res);
  const client = clientAbort(res);
  const { index, texto } = sess.roteiroPendente;
  const aula = sess.aulas[index];
  const numero = String(index + 1).padStart(2, '0');

  try {
    send(res, { type: 'progress', message: `Gerando roteiro da aula ${index + 1} de ${sess.aulas.length}: ${aula.titulo}` });

    const skill = skills.roteiroSkill({
      promptPreenchido: texto,
      metodologia: getMetodologia(sess),
      bnccContext: buildPedagogicalContext(sess)
    });

    const stream = await chamarOpenAI('chat', {
      model: skill.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    }, { signal: client.signal });

    let fullText = '';
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) { fullText += text; send(res, { type: 'token', text }); }
      if (chunk.usage) addUsage(chunk.usage, sess);
    }
    if (client.disconnected) return;

    // A IA às vezes deixa "[REPETIR EXATAMENTE O BLOCO DE VOZ ACIMA]" literal
    // no texto em vez de repetir a descrição de voz do avatar — garantido de
    // forma determinística aqui, não só via instrução no prompt.
    const template = await getRoteiroTemplate();
    fullText = preencherBlocoVozNoRoteiro(fullText, extrairBlocoVozAvatar(template));

    const baseName = `roteiro${numero}`;

    // Atualiza o histórico ANTES de persistir — saveProject() (chamado dentro
    // de persistStage) serializa o sess atual para projeto.json; se fosse
    // depois, a entrada desta aula só apareceria em disco na próxima geração
    // (nunca, se for a última aula do curso).
    sess.roteirosGerados = sess.roteirosGerados || [];
    sess.roteirosGerados.push({ index, numero, titulo: aula.titulo, baseName });
    sess.roteiroPendente = null;

    await persistStage(sess, baseName, `Roteiro de Vídeo — Aula ${index + 1}: ${aula.titulo}`, fullText);

    const proximoIndex = index + 1 < sess.aulas.length ? index + 1 : null;
    send(res, { type: 'progress', message: `Roteiro da aula ${index + 1} concluído` });
    send(res, { type: 'done', fullText, index, numero, baseName, titulo: aula.titulo, proximoIndex });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a geração do roteiro — interrompendo /api/roteiro/gerar');
      return;
    }
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar roteiro' });
  } finally {
    res.end();
  }
});

// ── Etapa 10 — Vídeo com avatar (HeyGen), opcional e independente ──────────
// Requer a Etapa 5 (Conteúdo) concluída — fonte do texto de cada aula — e a
// configuração de avatar/voz do HeyGen (uma vez por curso, ver
// POST /api/heygen/config acima). Diferente de Slides/Roteiro, NÃO avança
// automaticamente entre aulas: o ciclo por aula é mais longo (gerar roteiro →
// revisar fora do app → reenviar → confirmar → gerar vídeo → revisar o .mp4
// fora do app) e o usuário escolhe manualmente qual aula trabalhar a cada vez.

const DURACAO_AVATAR_MIN_SEGUNDOS = 5;
const DURACAO_AVATAR_MAX_SEGUNDOS = 600;

// GET /api/video-avatar/parametros?index=N — metadados da aula + duração
// sticky atual, sem chamar IA nenhuma.
app.get('/api/video-avatar/parametros', (req, res) => {
  const sess = getSession(req, res);
  restoreConteudoPorAula(sess);
  if (!sess.conteudo && !sess.conteudoPorAula?.length) {
    return res.status(400).json({ error: 'Conclua a Etapa 5 antes de gerar vídeos com avatar.' });
  }
  if (!sess.heygenConfig) {
    return res.status(400).json({ error: 'Configure o avatar e a voz do HeyGen antes de continuar.' });
  }

  const aulas = sess.conteudoPorAula;
  const index = Number(req.query.index);
  if (!Number.isInteger(index) || index < 0 || index >= aulas.length) {
    return res.status(400).json({ error: 'Índice de aula inválido.' });
  }

  const aula = aulas[index];
  res.json({
    index,
    numero: String(index + 1).padStart(2, '0'),
    titulo: aula.titulo,
    total: aulas.length,
    duracaoPadrao: sess.duracaoAvatarDefault || 30
  });
});

// POST /api/video-avatar/parametros — aprova a duração (segundos, inteiro)
// da aula, guardada para a próxima chamada a GET /api/video-avatar/roteiro/gerar.
app.post('/api/video-avatar/parametros', (req, res) => {
  const sess = getSession(req, res);
  const { index, segundos } = req.body || {};
  const i = Number(index);
  const s = Number(segundos);
  if (!Number.isInteger(i) || !sess.conteudoPorAula?.[i]) {
    return res.status(400).json({ error: 'Índice de aula inválido.' });
  }
  if (!Number.isInteger(s) || s < DURACAO_AVATAR_MIN_SEGUNDOS || s > DURACAO_AVATAR_MAX_SEGUNDOS) {
    return res.status(400).json({ error: `Informe uma duração inteira entre ${DURACAO_AVATAR_MIN_SEGUNDOS} e ${DURACAO_AVATAR_MAX_SEGUNDOS} segundos.` });
  }
  sess.roteiroAvatarPendente = { index: i, segundos: s };
  res.json({ ok: true });
});

// GET /api/video-avatar/roteiro/gerar (SSE) — chama a IA com a duração
// aprovada, persiste roteiroAvatar{NN}.txt/.docx. Sem avanço automático
// (proximoIndex) — decisão de design D6, ver openspec/changes/video-avatar-generation.
app.get('/api/video-avatar/roteiro/gerar', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.roteiroAvatarPendente) {
    return sseError(res, 'Nenhuma duração aprovada. Defina a duração da aula antes de gerar o roteiro.');
  }
  sseHeaders(res);
  const client = clientAbort(res);
  const { index, segundos } = sess.roteiroAvatarPendente;
  const aula = sess.conteudoPorAula[index];
  const numero = String(index + 1).padStart(2, '0');

  try {
    send(res, { type: 'progress', message: `Gerando roteiro de avatar da aula ${index + 1} de ${sess.conteudoPorAula.length}: ${aula.titulo}` });

    const skill = skills.roteiroAvatarSkill({
      aulaTitulo: aula.titulo,
      aulaTexto: fundamentacao.limparParaMidia(aula.texto),
      segundos,
      publico: sess.config?.publico,
      nivel: sess.config?.nivel,
      metodologia: getMetodologia(sess),
      bnccContext: buildPedagogicalContext(sess)
    });

    const stream = await chamarOpenAI('chat', {
      model: skill.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    }, { signal: client.signal });

    let fullText = '';
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) { fullText += text; send(res, { type: 'token', text }); }
      if (chunk.usage) addUsage(chunk.usage, sess);
    }
    if (client.disconnected) return;

    const baseName = `roteiroAvatar${numero}`;

    sess.duracaoAvatarDefault = segundos;
    sess.roteirosAvatarGerados = sess.roteirosAvatarGerados || [];
    sess.roteirosAvatarGerados.push({ index, numero, titulo: aula.titulo, baseName, segundos });
    sess.roteiroAvatarPendente = null;

    await persistStage(sess, baseName, `Roteiro de Avatar — Aula ${index + 1}: ${aula.titulo}`, fullText);

    send(res, { type: 'progress', message: `Roteiro de avatar da aula ${index + 1} concluído` });
    send(res, { type: 'done', fullText, index, numero, baseName, titulo: aula.titulo });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a geração do roteiro de avatar — interrompendo /api/video-avatar/roteiro/gerar');
      return;
    }
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar roteiro de avatar' });
  } finally {
    res.end();
  }
});

// GET /api/video-avatar/gerar?index=N (SSE) — envia o roteiro CONFIRMADO
// (versão da IA ou reenviada pelo usuário via /api/importar/confirmar, ambas
// gravadas em scr/roteiroAvatar{NN}.txt) para o HeyGen e baixa o .mp4 pronto.
app.get('/api/video-avatar/gerar', async (req, res) => {
  const sess = getSession(req, res);
  const index = Number(req.query.index);
  if (!sess.heygenConfig) {
    return sseError(res, 'Configure o avatar e a voz do HeyGen antes de gerar o vídeo.');
  }
  if (!Number.isInteger(index) || !sess.conteudoPorAula?.[index]) {
    return sseError(res, 'Índice de aula inválido.');
  }
  const numero = String(index + 1).padStart(2, '0');
  const roteiroTexto = readMemory(sess, `roteiroAvatar${numero}`);
  if (!roteiroTexto) {
    return sseError(res, 'Gere e confirme o roteiro de avatar desta aula antes de enviar ao HeyGen.');
  }

  sseHeaders(res);
  const client = clientAbort(res);
  const aula = sess.conteudoPorAula[index];
  const { avatarId, avatarType, voiceId, expressiveness, motionPrompt } = sess.heygenConfig;

  try {
    send(res, { type: 'progress', message: `Enviando roteiro da aula ${index + 1} para o HeyGen...` });

    const payload = {
      type: 'avatar',
      avatar_id: avatarId,
      voice_id: voiceId,
      script: roteiroTexto,
      engine: { type: 'avatar_iv' },
      aspect_ratio: '16:9',
      resolution: '1080p',
      // expressiveness/motion_prompt só têm efeito em photo avatars (Avatar IV)
      // — enviados só quando configurados, o HeyGen ignora quando não se aplica.
      ...(expressiveness && avatarType === 'photo_avatar' ? { expressiveness } : {}),
      ...(motionPrompt ? { motion_prompt: motionPrompt } : {})
    };

    const criacao = await criarVideoHeygen(payload, client);
    send(res, { type: 'progress', message: `Aguardando o HeyGen gerar o vídeo da aula ${index + 1}... (pode levar alguns minutos)` });

    const resultado = await aguardarVideoHeygen(criacao.video_id, client);
    if (client.disconnected) return;

    const baseName = `aula${numero}_video`;

    sess.videosAvatarGerados = sess.videosAvatarGerados || [];
    sess.videosAvatarGerados.push({ index, numero, titulo: aula.titulo, baseName, geradoEm: new Date().toISOString() });

    await persistHeygenVideoStage(sess, baseName, resultado.video_url);

    send(res, { type: 'progress', message: `Vídeo da aula ${index + 1} concluído` });
    send(res, { type: 'done', index, numero, baseName, titulo: aula.titulo });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a geração do vídeo — interrompendo /api/video-avatar/gerar');
      return;
    }
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar vídeo do avatar' });
  } finally {
    res.end();
  }
});

// ── GET /api/escolher-pasta — abre o seletor nativo de pasta do Windows ─────
app.get('/api/escolher-pasta', async (req, res) => {
  try {
    const pasta = await escolherPastaWindows(lerUltimaPasta());
    if (pasta) gravarUltimaPasta(pasta);
    res.json({ pasta });
  } catch (err) {
    console.error('[escolher-pasta] Erro ao abrir seletor nativo:', err.message);
    res.status(500).json({ error: 'Não foi possível abrir o seletor de pasta. Digite o caminho manualmente.' });
  }
});

// ── POST /api/config ────────────────────────────────────────────────────────
app.post('/api/config', async (req, res) => {
  const sess = getSession(req, res);
  const { nome, publico, carga, duracao, nivel, objetivos, modalidade, preRequisitos, proporcaoTeoricoPratico, pastaProjeto } = req.body;
  const pastaProjetoAnterior = (sess.config.pastaProjeto || '').trim();
  if (!modalidade) return res.status(400).json({ error: 'O campo modalidade é obrigatório.' });
  if (!proporcaoTeoricoPratico) return res.status(400).json({ error: 'O campo proporção teórico/prático é obrigatório.' });
  if (!pastaProjeto?.trim()) return res.status(400).json({ error: 'O campo pasta do projeto é obrigatório.' });

  {
    const pasta = path.resolve(pastaProjeto.trim());
    if (pastaProjeto.includes('..')) return res.status(400).json({ error: 'Caminho inválido: não pode conter "..".' });
    if (pasta === path.resolve(__dirname) || pasta.startsWith(path.resolve(__dirname) + path.sep)) {
      return res.status(400).json({ error: 'Caminho inválido: não pode apontar para o diretório da aplicação.' });
    }
    try {
      fs.mkdirSync(pasta, { recursive: true });
      fs.accessSync(pasta, fs.constants.W_OK);
    } catch {
      return res.status(400).json({ error: `Pasta não acessível ou sem permissão de escrita: ${pasta}` });
    }
  }

  // Campos de conteúdo pedagógico que determinam se a ementa deve ser regerada.
  const camposConteudo = ['nome', 'publico', 'carga', 'duracao', 'nivel', 'objetivos'];
  const conteudoMudou = camposConteudo.some(k => (req.body[k] || '') !== (sess.config[k] || ''));

  sess.config = req.body;

  // pastaProjeto não entra em conteudoMudou (não deve reprocessar o pipeline),
  // mas precisa ser persistida imediatamente, sem depender da regeneração da
  // ementa abaixo — senão projeto.json fica desatualizado se a sessão for
  // perdida antes de qualquer outra etapa ser gerada.
  if ((pastaProjeto || '').trim() !== pastaProjetoAnterior) {
    saveProject(sess);
  }

  // A ementa deixa de ser gerada aqui — a Etapa 1 agora é preenchida ANTES da
  // metodologia existir (ver POST /api/metodologia/confirmar), então gerar a
  // ementa neste ponto produziria um texto sem alinhamento metodológico.
  // Apenas registra se será necessário gerá-la na confirmação da metodologia.
  sess._precisaGerarEmenta = !sess.ementa || conteudoMudou;

  res.json({ ok: true });
});

// ── GET /api/search (SSE) ───────────────────────────────────────────────────
// Pesquisa web real em 4–5 consultas focadas (mercado, ferramentas/documentação,
// referências didáticas, certificações e, com BNCC ativa, referências
// educacionais). Só grava pesquisa.txt/.docx/.json quando as consultas devolvem
// citações suficientes (≥3 fontes em ≥2 domínios); consulta sem nenhuma
// citação conta como falha (a resposta veio de memória). Sem isso — ou se a
// busca falhar — emite `error` (status 'falhou', `semPesquisaDisponivel`) e
// NÃO grava nada; o fallback para o conhecimento do modelo só roda por decisão
// explícita do usuário (`?semBusca=1`) e grava o texto com selo, status
// 'sem_web' e fonte 'modelo_sem_busca'.
app.get('/api/search', async (req, res) => {
  const sess = getSession(req, res);
  sseHeaders(res);
  const client = clientAbort(res);
  const { topicos = '', limite = 3, semBusca } = req.query;
  const semWeb = semBusca === '1';
  sess.inputs.topicos = topicos;
  sess.inputs.limite = Number(limite);
  const { nome, nivel, publico, modalidade } = sess.config;

  send(res, { type: 'progress', message: 'Iniciando pesquisa...' });

  // Skill de pesquisa na internet — usa o modelo com capacidade de busca web
  // (Responses API + web_search) e referencia a ementa já gerada para manter o foco.
  const skillArgs = { nome, nivel, publico, modalidade, topicos, ementa: sess.ementa, metodologia: getMetodologia(sess), bnccContext: buildPedagogicalContext(sess) };

  // Falha de pesquisa: nada é gravado; a UI oferece "tentar novamente" e
  // "continuar sem pesquisa web" (exceto chave inválida, que o fallback não resolve).
  const falhaPesquisa = (message, err = null) => send(res, {
    type: 'error',
    message,
    status: 'falhou',
    semPesquisaDisponivel: !(err instanceof OpenAI.AuthenticationError)
  });

  try {
    let fullText = '';
    let meta = null;
    const sitesCollected = [];

    if (semWeb) {
      send(res, { type: 'progress', message: '⚠️ Gerando a partir do conhecimento do modelo (sem pesquisa web)...' });
      const fbSkill = skills.pesquisaFallbackSkill(skillArgs);
      const completion = await chamarOpenAI('chat', {
        model: fbSkill.model,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: fbSkill.system },
          { role: 'user', content: fbSkill.user }
        ]
      }, { signal: combineSignals(client.signal, makeAbortSignal(SEARCH_FALLBACK_TIMEOUT_MS)) });
      if (client.disconnected) return;
      addUsage(completion.usage, sess);
      fullText = SELO_SEM_PESQUISA_WEB + (completion.choices[0]?.message?.content || '');
      meta = {
        status: 'sem_web', fonte: 'modelo_sem_busca', modelo: fbSkill.model,
        geradoEm: new Date().toISOString(), consultas: [], fontes: [], achados: []
      };
    } else {
      const ano = new Date().getFullYear();
      const consultas = skills.planejarConsultasPesquisa({ nome, nivel, publico, topicos, bnccAtivo: !!sess.bncc?.ativo, ano });
      const fontes = [];
      const fontePorUrl = new Map();
      const achados = [];
      const secoes = [];
      let ultimoErro = null;
      let modelo = skills.modeloPesquisa();

      for (let i = 0; i < consultas.length; i++) {
        if (client.disconnected) return;
        const consulta = consultas[i];
        observabilidade.definirContexto({ consulta: consulta.id });
        send(res, { type: 'progress', message: `Consulta ${i + 1}/${consultas.length}: ${consulta.titulo}...` });
        const skill = skills.pesquisaWebSkill({ ...skillArgs, consulta, ano });
        modelo = skill.model;

        let completion;
        try {
          completion = await executarPesquisaWeb(skill, {
            clientCtx: client,
            onRetry: () => send(res, { type: 'progress', message: 'Reconectando...' })
          });
        } catch (err) {
          // Erro de configuração/chave afeta todas as consultas: interrompe já.
          if (err.configInvalida || err instanceof OpenAI.AuthenticationError || client.disconnected) throw err;
          ultimoErro = err;
          send(res, { type: 'progress', message: `⚠️ Consulta "${consulta.titulo}" falhou: ${err.message}` });
          continue;
        }
        addUsage(completion.usage, sess);

        const message = completion.choices[0]?.message || {};
        const texto = (message.content || '').trim();
        const fonteIds = new Set();
        for (const ann of message.annotations || []) {
          if (ann.type !== 'url_citation' || !ann.url_citation?.url) continue;
          const url = limparUrlFonte(ann.url_citation.url);
          if (!fontePorUrl.has(url)) {
            const fonte = { id: `f${fontes.length + 1}`, url, titulo: ann.url_citation.title || url, dominio: dominioDe(url), consultaId: consulta.id };
            fontes.push(fonte);
            fontePorUrl.set(url, fonte);
          }
          fonteIds.add(fontePorUrl.get(url).id);
        }
        // Resposta sem nenhuma citação veio da memória do modelo: não conta.
        if (!fonteIds.size || !texto) {
          send(res, { type: 'progress', message: `⚠️ Consulta "${consulta.titulo}" não retornou fontes — descartada.` });
          continue;
        }
        secoes.push(`## ${consulta.titulo}\n\n${texto}`);
        achados.push({ tema: consulta.titulo, resumo: texto, fonteIds: [...fonteIds] });
      }
      if (client.disconnected) return;

      for (const f of fontes) sitesCollected.push({ url: f.url, title: f.titulo });
      const avaliacao = avaliarFontesPesquisa(sitesCollected);
      if (!achados.length || !avaliacao.ok) {
        if (!achados.length && ultimoErro) throw ultimoErro;
        const motivo = sitesCollected.length === 0
          ? 'A busca não retornou nenhuma fonte (a resposta pode ter vindo apenas da memória do modelo).'
          : `A busca retornou poucas fontes (${avaliacao.fontes} fonte(s) em ${avaliacao.dominios} domínio(s); mínimo ${PESQUISA_MIN_FONTES} em ${PESQUISA_MIN_DOMINIOS}).`;
        console.warn(`[pesquisa] descartada: ${avaliacao.fontes} fonte(s), ${avaliacao.dominios} domínio(s)`);
        falhaPesquisa(`${motivo} Nada foi gravado. Tente novamente ou continue sem pesquisa web.`);
        return;
      }

      send(res, { type: 'progress', message: 'Lendo fontes...' });
      for (const site of sitesCollected) send(res, { type: 'site', ...site });

      fullText = secoes.join('\n\n') +
        '\n\n## Fontes consultadas\n' + fontes.map(f => `- [${f.id}] ${f.titulo} — ${f.url}`).join('\n');
      meta = {
        status: 'web', fonte: 'ia', modelo, geradoEm: new Date().toISOString(),
        consultas: consultas.map(c => ({ id: c.id, texto: c.foco })), fontes, achados
      };
    }

    // Simula streaming progressivo do texto para manter a UX em tempo real
    const CHUNK_SIZE = 24;
    for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
      if (client.disconnected) break;
      send(res, { type: 'token', text: fullText.slice(i, i + CHUNK_SIZE) });
      await new Promise(r => setTimeout(r, 15));
    }
    if (client.disconnected) return;

    send(res, { type: 'progress', message: 'Sintetizando...' });
    sess.pesquisa = fullText;
    await persistStage(sess, 'pesquisa', 'Pesquisa Web', fullText, sitesCollected, meta.fonte);
    escreverPesquisaMeta(sess, meta);
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText, status: meta.status });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a pesquisa web — interrompendo /api/search');
      return;
    }
    console.error(err);
    falhaPesquisa(err.message || 'Erro na pesquisa', err);
  } finally {
    res.end();
  }
});

// ── GET /api/plano-ensino (SSE) ─────────────────────────────────────────────
app.get('/api/plano-ensino', async (req, res) => {
  const sess = getSession(req, res);
  sseHeaders(res);
  const client = clientAbort(res);
  const { ajustes = '' } = req.query;
  sess.inputs.ajustesEnsino = ajustes;
  const { nome, publico, carga, duracao, nivel, objetivos, modalidade } = sess.config;

  send(res, { type: 'progress', message: 'Preparando plano de ensino...' });

  // Consulta a memória persistente (ementa + pesquisa) para manter coerência.
  const ementa = sess.ementa || readMemory(sess, 'ementa');
  const pesquisa = sess.pesquisa || readMemory(sess, 'pesquisa');

  const skill = skills.planoEnsinoSkill({
    nome, publico, carga, duracao, nivel, objetivos, modalidade, ementa, pesquisa, ajustes,
    preRequisitos: sess.config.preRequisitos, pesquisaBloco: blocoPesquisaGeral(sess),
    metodologia: getMetodologia(sess), bnccContext: buildPedagogicalContext(sess),
    proporcaoTeoricoPratico: sess.config.proporcaoTeoricoPratico
  });

  try {
    const stream = await chamarOpenAI('chat', {
      model: skill.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    }, { signal: client.signal });

    let fullText = '';
    let firstChunk = true;

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        if (firstChunk) {
          send(res, { type: 'progress', message: 'Gerando plano de ensino...' });
          firstChunk = false;
        }
        fullText += text;
        send(res, { type: 'token', text });
      }
      if (chunk.usage) addUsage(chunk.usage, sess);
    }
    if (client.disconnected) return;

    sess.planoEnsino = fullText;
    await persistStage(sess, 'plano_de_ensino', 'Plano de Ensino', fullText);
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a geração do plano de ensino — interrompendo /api/plano-ensino');
      return;
    }
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar plano de ensino' });
  } finally {
    res.end();
  }
});

// ── GET /api/plano-aula (SSE) ───────────────────────────────────────────────
app.get('/api/plano-aula', async (req, res) => {
  const sess = getSession(req, res);
  sseHeaders(res);
  const client = clientAbort(res);
  const { observacoes = '' } = req.query;
  sess.inputs.observacoesAula = observacoes;
  const { nome, duracao, nivel, publico, modalidade } = sess.config;

  send(res, { type: 'progress', message: 'Planejando as aulas do curso...' });

  // Consulta a memória persistente para fundamentar o plano de aula.
  const ementa = sess.ementa || readMemory(sess, 'ementa');
  const planoEnsino = sess.planoEnsino || readMemory(sess, 'plano_de_ensino');

  try {
    const aulas = await planLessons(sess, planoEnsino, msg => send(res, { type: 'progress', message: msg }));
    sess.aulas = aulas;
    send(res, {
      type: 'progress',
      message: `${aulas.length} aula(s) identificada(s). Gerando plano de cada uma...`
    });

    let fullText = '';

    for (let i = 0; i < aulas.length; i++) {
      if (client.disconnected) break;

      const aula = aulas[i];
      observabilidade.definirContexto({ aula: i + 1 });
      const titulo = aula.titulo || `Aula ${i + 1}`;

      send(res, {
        type: 'progress',
        message: `Gerando plano da aula ${i + 1} de ${aulas.length}: ${titulo}`
      });

      const heading = `${i === 0 ? '' : '\n\n'}# Aula ${i + 1}: ${titulo}\n\n`;
      fullText += heading;
      send(res, { type: 'token', text: heading });

      // Ajuste 3 — consciência sequencial: mapa enxuto (título + objetivos) das
      // demais aulas, para evitar repetição/antecipação de conteúdo (Ajuste 4
      // reforça os limites de escopo desta aula específica no prompt da skill).
      const lessonSummaries = skills.summarizeLessons(aulas, { excludeIndex: i });

      const skill = skills.planoAulaSkill({
        nome, duracao, nivel, publico, modalidade, aula, index: i, total: aulas.length,
        ementa, planoEnsino, lessonSummaries, observacoes,
        preRequisitos: sess.config.preRequisitos, pesquisaBloco: blocoPesquisaGeral(sess),
        metodologia: getMetodologia(sess), bnccContext: buildPedagogicalContext(sess),
        proporcaoTeoricoPratico: sess.config.proporcaoTeoricoPratico
      });

      const stream = await chamarOpenAI('chat', {
        model: skill.model,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: skill.system },
          { role: 'user', content: skill.user }
        ]
      }, { signal: client.signal });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          fullText += text;
          send(res, { type: 'token', text });
        }
        if (chunk.usage) addUsage(chunk.usage, sess);
      }
    }
    if (client.disconnected) return;

    sess.planoAula = fullText;
    await persistStage(sess, 'plano_de_aula', 'Plano de Aula', fullText);
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a geração do plano de aula — interrompendo /api/plano-aula');
      return;
    }
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar plano de aula' });
  } finally {
    res.end();
  }
});

// ── Planeja a divisão do curso em aulas (título + módulo + objetivos) ──────
// Ajuste 2: usa EXCLUSIVAMENTE o plano de ensino como referência curricular
// (nunca truncado) e exige um campo "modulo" rastreável a um módulo real do
// plano de ensino, permitindo auditar a aderência da grade ao currículo.
async function planLessons(sess, planoEnsinoOverride, onProgress = () => {}) {
  const { nome, carga, duracao, nivel, publico, modalidade } = sess.config;
  const totalMinutos = Number(carga) * 60;
  const numAulas = Math.max(1, Math.round(totalMinutos / Number(duracao)));

  const planoEnsino = planoEnsinoOverride || sess.planoEnsino || readMemory(sess, 'plano_de_ensino');

  const chamarSkill = async (correcao) => {
    const skill = skills.planLessonsSkill({ nome, carga, duracao, nivel, publico, modalidade, planoEnsino, numAulas, correcao });
    const completion = await chamarOpenAI('chat', {
      model: skill.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    });
    addUsage(completion.usage, sess);
    let parsed = {};
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    } catch {
      parsed = {};
    }
    return Array.isArray(parsed.aulas) ? parsed.aulas : [];
  };

  let aulas = await chamarSkill();

  if (aulas.length !== numAulas && aulas.length > 0) {
    onProgress(`A IA retornou ${aulas.length} aula(s) em vez de ${numAulas}; tentando novamente...`);
    console.warn(`[planLessons] Esperado ${numAulas} aulas, recebido ${aulas.length}. Tentando novamente com prompt de correção.`);

    const retryAulas = await chamarSkill(aulas.length);
    if (retryAulas.length > 0) {
      const acertouRetry = retryAulas.length === numAulas;
      const retryMaisProximo = Math.abs(retryAulas.length - numAulas) < Math.abs(aulas.length - numAulas);
      if (acertouRetry || retryMaisProximo) aulas = retryAulas;
      if (!acertouRetry) {
        console.warn(`[planLessons] Segunda tentativa retornou ${retryAulas.length} aulas (esperado ${numAulas}). Prosseguindo com ${aulas.length} aula(s), o resultado mais próximo do esperado.`);
      }
    }
  }

  return aulas.length ? aulas : [{ titulo: nome, objetivos: 'Cobrir o conteúdo geral do curso' }];
}

// Executa uma chamada em streaming para uma skill de conteúdo e devolve o texto
// completo gerado, repassando os tokens via SSE para o cliente.
async function streamSkillToClient(res, skill, sess, meta = {}, clientCtx = null) {
  // Timeout de inatividade: aborta a chamada se nenhum delta chegar por
  // STALL_TIMEOUT_MS, sem limitar a duração total de uma geração legítima
  // que continua recebendo dados normalmente.
  const controller = new AbortController();
  if (clientCtx) clientCtx.signal.addEventListener('abort', () => controller.abort(), { once: true });
  let stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
  const resetStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
  };

  const stream = await chamarOpenAI('chat', {
    model: skill.model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: meta.maxTokens || MAX_TOKENS_AULA,
    messages: skill.messages || [
      { role: 'system', content: skill.system },
      { role: 'user', content: skill.user }
    ]
  }, { signal: controller.signal });
  let text = '';
  try {
    for await (const chunk of stream) {
      resetStallTimer();
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        send(res, { type: 'token', text: delta });
      }
      const fr = chunk.choices[0]?.finish_reason;
      if (fr) meta.finishReason = fr;
      if (chunk.usage) {
        addUsage(chunk.usage, sess);
        meta.completionTokens = chunk.usage.completion_tokens;
      }
    }
  } finally {
    clearTimeout(stallTimer);
  }
  if (meta.finishReason === 'length' && !meta.silenciarTruncamento) {
    console.warn(`[stream] resposta truncada (${text.length} chars, finish_reason=length)`);
    send(res, { type: 'warning', text: 'Resposta truncada pelo limite de tokens. O conteúdo gerado pode estar incompleto — revise o arquivo gerado.' });
  }
  return text;
}

// ── Pesquisa por módulo e fundamentação do conteúdo (change conteudo-fundamentado-em-pesquisa) ──
// Entre a Etapa 4 e a 5: uma consulta de pesquisa web por MÓDULO do plano de
// ensino (não por aula, para controlar custo e tempo). O resultado alimenta o
// conteúdo das aulas com fontes e achados citáveis por [F#].
const PESQUISA_MODULOS_PAUSA_MS = Number(process.env.PESQUISA_MODULOS_PAUSA_MS ?? 1500);

function lerPesquisaModulos(sess) {
  try {
    return JSON.parse(fs.readFileSync(path.join(courseScrDir(sess), 'pesquisa_modulos.json'), 'utf-8'));
  } catch {
    return null;
  }
}

function escreverPesquisaModulos(sess, meta) {
  const destino = path.join(courseScrDir(sess), 'pesquisa_modulos.json');
  const tmp = `${destino}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf-8');
    fs.renameSync(tmp, destino);
  } catch (err) {
    console.error('[pesquisa-modulos] Erro ao gravar pesquisa_modulos.json:', err.message);
    try { fs.unlinkSync(tmp); } catch { /* temporário ausente */ }
  }
}

// 'ok' (pesquisado), 'pulada' (escolha explícita de gerar sem pesquisa por
// módulo), 'legado' (projeto anterior à funcionalidade, com conteúdo já gerado) ou
// 'pendente' (a Etapa 5 ainda exige a pesquisa por módulo).
function statusPesquisaModulos(sess) {
  const meta = lerPesquisaModulos(sess);
  if (meta?.pulada) return 'pulada';
  if (meta?.completo) return 'ok';
  if (meta) return 'pendente';
  return readMemory(sess, 'aula01_conteudo') ? 'legado' : 'pendente';
}

// A Etapa 5 exige a pesquisa por módulo (ou a escolha explícita de pular).
// PESQUISA_MODULOS_OBRIGATORIA=false desliga a exigência (usado nos testes
// herdados; projetos legados com conteúdo já gerado nunca são bloqueados).
const exigePesquisaModulos = (sess) =>
  process.env.PESQUISA_MODULOS_OBRIGATORIA !== 'false' && statusPesquisaModulos(sess) === 'pendente';

function lerAulasDoProjeto(sess) {
  if (sess.aulas?.length) return sess.aulas;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(courseScrDir(sess), 'projeto.json'), 'utf-8'));
    return Array.isArray(p.aulas) ? p.aulas : [];
  } catch {
    return [];
  }
}

// Dossiê da pesquisa geral (Etapa 2) no formato dos prompts: IDs em maiúsculas
// (f1 → F1). Só existe quando a pesquisa foi feita na web.
function dossieDaPesquisaGeral(sess) {
  const meta = sess.pesquisaMeta || lerPesquisaMeta(sess);
  if (!meta || meta.status !== 'web' || !meta.fontes?.length) return null;
  const up = (id) => String(id).toUpperCase();
  return {
    fontes: meta.fontes.map(f => ({ id: up(f.id), url: f.url, titulo: f.titulo, dominio: f.dominio })),
    achados: (meta.achados || []).map(a => ({ tema: a.tema, resumo: a.resumo, fonteIds: (a.fonteIds || []).map(up) }))
  };
}

function blocoPesquisaGeral(sess) {
  const d = dossieDaPesquisaGeral(sess);
  return d ? skills.pesquisaBlock(d.achados, d.fontes) : '';
}

// Dossiê DESTA aula: achados do módulo dela + gerais mais próximos, com IDs
// [F#] locais. Modos: 'web' (cita), 'sem_web' (pesquisa por módulo pulada: não
// cita nem simula referências) e 'nenhum' (projeto legado: prompts como antes).
function dossieDaAula(sess, aula, aulas) {
  const modulos = lerPesquisaModulos(sess);
  if (modulos?.pulada) return { modo: 'sem_web', achados: [], fontes: [] };
  if (!modulos?.completo) return { modo: 'nenhum', achados: [], fontes: [] };
  const geral = (() => { const m = sess.pesquisaMeta || lerPesquisaMeta(sess); return m?.status === 'web' ? m : null; })();
  const { achados, fontes } = fundamentacao.selecionarFontesParaAula({ aula, aulas, pesquisaModulos: modulos, pesquisaGeral: geral });
  return fontes.length ? { modo: 'web', achados, fontes } : { modo: 'nenhum', achados: [], fontes: [] };
}

const blocoPesquisa = (dossie, citar) => skills.pesquisaBlock(dossie.achados, dossie.fontes, { modo: dossie.modo, citar });

// GET /api/pesquisa-modulos/status — estado da pesquisa por módulo (para a UI).
app.get('/api/pesquisa-modulos/status', (req, res) => {
  const sess = getSession(req, res);
  const meta = (sess.config?.nome || sess.config?.pastaProjeto) ? lerPesquisaModulos(sess) : null;
  res.json({
    status: (sess.config?.nome || sess.config?.pastaProjeto) ? statusPesquisaModulos(sess) : 'pendente',
    modulos: (meta?.modulos || []).map(m => ({ titulo: m.titulo, status: m.status, erro: m.erro })),
    obrigatoria: process.env.PESQUISA_MODULOS_OBRIGATORIA !== 'false'
  });
});

// POST /api/pesquisa-modulos/pular — escolha explícita de gerar o conteúdo SEM
// pesquisa por módulo: marca o projeto com fonte 'modelo_sem_busca' e as aulas
// passam a ser geradas sem citar nem simular referências.
app.post('/api/pesquisa-modulos/pular', (req, res) => {
  const sess = getSession(req, res);
  if (!sess.config?.nome && !sess.config?.pastaProjeto) return res.status(400).json({ error: 'Configure o curso (Etapa 1) antes.' });
  escreverPesquisaModulos(sess, {
    status: 'sem_web', fonte: 'modelo_sem_busca', modelo: null, geradoEm: new Date().toISOString(),
    completo: true, pulada: true, modulos: [], consultas: [], fontes: [], achados: []
  });
  saveProject(sess, { baseName: 'pesquisa_modulos', fonte: 'modelo_sem_busca' });
  res.json({ ok: true, status: 'pulada' });
});

// ── GET /api/pesquisa-modulos (SSE) ─────────────────────────────────────────
// Uma pesquisa web por módulo do plano de ensino (título, objetivos das aulas,
// nível e público). Retomável: módulos já pesquisados (status 'ok' no
// pesquisa_modulos.json) não são refeitos; `?refazer=1` ignora o cache. Grava
// scr/pesquisa_modulos.json (consultas, fontes e achados por módulo) e
// pesquisa_modulos.txt/.docx. Módulo sem nenhuma citação conta como falha.
app.get('/api/pesquisa-modulos', async (req, res) => {
  const sess = getSession(req, res);
  const aulas = lerAulasDoProjeto(sess);
  if (!aulas.length) return sseError(res, 'Conclua a Etapa 4 (plano de aula) antes de pesquisar por módulo.');
  sseHeaders(res);
  const client = clientAbort(res);
  const { nome, nivel, publico, modalidade } = sess.config;
  const falha = (message, err = null) => send(res, {
    type: 'error', message, status: 'falhou',
    semPesquisaDisponivel: !(err instanceof OpenAI.AuthenticationError)
  });

  try {
    const modulos = fundamentacao.agruparModulos(aulas);
    const ano = new Date().getFullYear();
    const anterior = req.query.refazer === '1' ? null : lerPesquisaModulos(sess);
    const idsOk = new Set((anterior?.modulos || []).filter(m => m.status === 'ok' && !anterior.pulada).map(m => m.id));
    // Parte do que já foi pesquisado com sucesso (cache/retomada por módulo).
    const meta = {
      status: 'web', fonte: 'ia', modelo: skills.modeloPesquisa(), geradoEm: new Date().toISOString(),
      completo: false, pulada: false,
      modulos: (anterior?.modulos || []).filter(m => idsOk.has(m.id)),
      consultas: (anterior?.consultas || []).filter(c => idsOk.has(c.moduloId)),
      achados: (anterior?.achados || []).filter(a => idsOk.has(a.moduloId)),
      fontes: []
    };
    const idsUsados = new Set(meta.achados.flatMap(a => a.fonteIds || []));
    meta.fontes = (anterior?.fontes || []).filter(f => idsUsados.has(f.id));
    const fontePorUrl = new Map(meta.fontes.map(f => [f.url, f]));
    let proximo = meta.fontes.reduce((max, f) => Math.max(max, parseInt(String(f.id).replace(/\D/g, ''), 10) || 0), 0) + 1;
    const falhas = [];
    let pesquisadosAgora = 0;

    send(res, { type: 'progress', message: `${modulos.length} módulo(s) no plano de ensino${idsOk.size ? ` — ${idsOk.size} já pesquisado(s), retomando os demais` : ''}.` });

    for (let k = 0; k < modulos.length; k++) {
      if (client.disconnected) return;
      const modulo = modulos[k];
      if (idsOk.has(modulo.id)) {
        send(res, { type: 'progress', message: `Módulo ${k + 1}/${modulos.length}: ${modulo.titulo} — já pesquisado (cache).` });
        continue;
      }
      if (pesquisadosAgora > 0 && PESQUISA_MODULOS_PAUSA_MS > 0) await new Promise(r => setTimeout(r, PESQUISA_MODULOS_PAUSA_MS));
      send(res, { type: 'progress', message: `Pesquisando módulo ${k + 1}/${modulos.length}: ${modulo.titulo}...` });
      observabilidade.definirContexto({ modulo: modulo.titulo });
      const skill = skills.pesquisaModuloSkill({
        nome, nivel, publico, modalidade, modulo, ano,
        metodologia: getMetodologia(sess), bnccContext: buildPedagogicalContext(sess)
      });

      let completion;
      try {
        completion = await executarPesquisaWeb(skill, {
          clientCtx: client,
          onRetry: () => send(res, { type: 'progress', message: 'Reconectando...' })
        });
      } catch (err) {
        if (err.configInvalida || err instanceof OpenAI.AuthenticationError || client.disconnected) throw err;
        falhas.push({ titulo: modulo.titulo, erro: err.message });
        send(res, { type: 'progress', message: `⚠️ Módulo "${modulo.titulo}" falhou: ${err.message}` });
        continue;
      }
      pesquisadosAgora++;
      addUsage(completion.usage, sess);

      const message = completion.choices[0]?.message || {};
      const texto = (message.content || '').trim();
      const fonteIds = new Set();
      for (const ann of message.annotations || []) {
        if (ann.type !== 'url_citation' || !ann.url_citation?.url) continue;
        const url = limparUrlFonte(ann.url_citation.url);
        if (!fontePorUrl.has(url)) {
          const fonte = { id: `f${proximo++}`, url, titulo: ann.url_citation.title || url, dominio: dominioDe(url), moduloId: modulo.id };
          meta.fontes.push(fonte);
          fontePorUrl.set(url, fonte);
        }
        fonteIds.add(fontePorUrl.get(url).id);
      }
      if (!fonteIds.size || !texto) {
        falhas.push({ titulo: modulo.titulo, erro: 'a busca não retornou fontes (resposta de memória do modelo)' });
        send(res, { type: 'progress', message: `⚠️ Módulo "${modulo.titulo}" não retornou fontes — será tentado de novo na próxima execução.` });
        continue;
      }
      meta.modulos.push({ id: modulo.id, titulo: modulo.titulo, aulas: modulo.aulas, status: 'ok' });
      meta.consultas.push({ id: `c${meta.consultas.length + 1}`, moduloId: modulo.id, texto: `Módulo "${modulo.titulo}": ${modulo.objetivos.join(' | ')}` });
      meta.achados.push({ moduloId: modulo.id, tema: modulo.titulo, resumo: texto, fonteIds: [...fonteIds] });
      escreverPesquisaModulos(sess, meta); // progresso persistido: se o servidor cair, estes módulos não são refeitos
    }
    if (client.disconnected) return;

    const okCount = meta.modulos.filter(m => m.status === 'ok').length;
    if (okCount < modulos.length) {
      meta.modulos = [...meta.modulos, ...falhas.map(f => ({ id: null, titulo: f.titulo, status: 'falhou', erro: f.erro }))];
      escreverPesquisaModulos(sess, meta);
      falha(`Pesquisa concluída para ${okCount} de ${modulos.length} módulo(s). Falharam: ${falhas.map(f => f.titulo).join(', ')}. ` +
        `Os módulos concluídos serão reaproveitados ao tentar de novo; ou escolha gerar sem pesquisa por módulo.`);
      return;
    }
    const sites = meta.fontes.map(f => ({ url: f.url, title: f.titulo }));
    const avaliacao = avaliarFontesPesquisa(sites);
    if (!avaliacao.ok) {
      escreverPesquisaModulos(sess, meta);
      falha(`A pesquisa por módulo retornou poucas fontes (${avaliacao.fontes} fonte(s) em ${avaliacao.dominios} domínio(s); mínimo ${PESQUISA_MIN_FONTES} em ${PESQUISA_MIN_DOMINIOS}). ` +
        `Tente novamente ou escolha gerar sem pesquisa por módulo.`);
      return;
    }

    send(res, { type: 'progress', message: 'Lendo fontes...' });
    for (const site of sites) send(res, { type: 'site', ...site });

    const fullText = meta.modulos.map(m => `## Módulo: ${m.titulo}\n\n${meta.achados.find(a => a.moduloId === m.id)?.resumo || ''}`).join('\n\n') +
      '\n\n## Fontes consultadas\n' + meta.fontes.map(f => `- [${f.id.toUpperCase()}] ${f.titulo} — ${f.url}`).join('\n');
    for (const trecho of fullText.match(/.{1,24}/gs) || []) {
      if (client.disconnected) return;
      send(res, { type: 'token', text: trecho });
    }
    meta.completo = true;
    meta.geradoEm = new Date().toISOString();
    await persistStage(sess, 'pesquisa_modulos', 'Pesquisa por Módulo', fullText, sites, 'ia');
    escreverPesquisaModulos(sess, meta);
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText, status: 'web', modulos: modulos.length });
  } catch (err) {
    if (client.disconnected) return;
    console.error(err);
    falha(err.message || 'Erro na pesquisa por módulo', err);
  } finally {
    res.end();
  }
});

// ── Geração do conteúdo de uma aula (change conteudo-completo-por-secoes) ────
// Duas passadas: (1) roteiro da aula em JSON planeja as seções; (2) cada seção
// é redigida em sua própria chamada em streaming, com teto de saída por seção.
// Resposta cortada por limite de tokens dispara continuação automática; aula
// que continua incompleta NUNCA vai para o .txt oficial (vai para .partial.txt)
// e bloqueia o avanço da Etapa 5. CONTEUDO_MODO=unico mantém a passada única
// (modo legado) — também com continuação e verificação de completude.
const SECAO_MAX_TOKENS = 4000;
const MAX_CONTINUACOES_CONTEUDO = 2;
const conteudoModo = () => ((process.env.CONTEUDO_MODO || 'secoes').toLowerCase() === 'unico' ? 'unico' : 'secoes');

// Gera um texto em streaming; se terminar com finish_reason 'length', pede
// continuação (até MAX_CONTINUACOES_CONTEUDO vezes) e concatena.
async function gerarComContinuacao(res, skill, sess, client, { maxTokens = MAX_TOKENS_AULA } = {}) {
  const meta = { maxTokens, silenciarTruncamento: true };
  let texto = await streamSkillToClient(res, skill, sess, meta, client);
  let tokens = meta.completionTokens || 0;
  let finishReason = meta.finishReason;
  let continuacoes = 0;
  while (finishReason === 'length' && continuacoes < MAX_CONTINUACOES_CONTEUDO && !client?.disconnected) {
    continuacoes++;
    send(res, { type: 'progress', message: `Resposta cortada — solicitando continuação (${continuacoes}/${MAX_CONTINUACOES_CONTEUDO})...` });
    const metaCont = { maxTokens, silenciarTruncamento: true };
    const contSkill = {
      ...skill,
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user },
        { role: 'assistant', content: texto },
        {
          role: 'user',
          content:
            `Sua resposta anterior foi CORTADA no meio. Continue EXATAMENTE de onde parou ` +
            `(o final do que você escreveu foi: "${texto.slice(-200)}"). NÃO repita nada do que já ` +
            `escreveu e conclua o texto por completo.`
        }
      ]
    };
    texto += await streamSkillToClient(res, contSkill, sess, metaCont, client);
    tokens += metaCont.completionTokens || 0;
    finishReason = metaCont.finishReason;
  }
  const truncada = finishReason === 'length';
  if (truncada) {
    send(res, { type: 'warning', text: 'Resposta truncada pelo limite de tokens mesmo após continuação — o trecho gerado será tratado como incompleto.' });
  }
  return { texto, finishReason, truncada, continuacoes, completionTokens: tokens };
}

// Primeiras palavras do corpo de uma seção (sem o título) para o "resumo das
// seções já escritas" do prompt das seguintes.
function resumirSecao(texto, palavras = 40) {
  const corpo = String(texto || '').replace(/^\s*#{1,6}[^\n]*\n/, '').replace(/#{1,6}\s*/g, '').trim();
  const partes = corpo.split(/\s+/).filter(Boolean);
  return partes.slice(0, palavras).join(' ') + (partes.length > palavras ? '…' : '');
}

// Garante que o texto da seção comece com o título planejado (títulos estáveis
// são a base do merge de seções do ciclo de melhorias).
function comTituloDaSecao(texto, titulo) {
  const t = String(texto || '').trim();
  const primeira = (t.split('\n')[0] || '').replace(/^#+\s*/, '');
  if (conteudoSecoes.ehMesmoTitulo(primeira, titulo)) return t;
  return `## ${titulo}\n\n${t}`;
}

async function gerarAulaPorSecoes({ res, sess, client, ctxSkill, aula, metaPalavrasAula }) {
  const i = ctxSkill.index;
  send(res, { type: 'progress', message: `Aula ${i + 1}: planejando as seções...` });
  let plano = null;
  for (let tentativa = 1; tentativa <= 2 && !plano; tentativa++) {
    const sk = skills.roteiroAulaSkill({ ...ctxSkill, metaPalavras: metaPalavrasAula });
    const comp = await chamarOpenAI('chat', {
      model: sk.model,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sk.system }, { role: 'user', content: sk.user }]
    }, { signal: combineSignals(client.signal, makeAbortSignal(60_000)) }, { nome: 'conteudo.roteiro-aula', tentativa });
    addUsage(comp.usage, sess);
    plano = conteudoSecoes.parseRoteiroAula(comp.choices[0]?.message?.content);
  }
  if (!plano) return null;

  const metas = conteudoSecoes.distribuirMetaPalavras(metaPalavrasAula, plano);
  const secoes = plano.map((s, n) => ({ titulo: s.titulo, objetivo: s.objetivo, meta: metas[n], texto: '', truncada: false }));
  const titulos = secoes.map(s => s.titulo);
  let tokens = 0;
  let continuacoes = 0;

  for (let n = 0; n < secoes.length; n++) {
    if (client.disconnected) break;
    const s = secoes[n];
    observabilidade.definirContexto({ secao: s.titulo });
    send(res, { type: 'progress', message: `Aula ${i + 1}: seção ${n + 1} de ${secoes.length} — ${s.titulo}` });
    const resumoEscritas = secoes.slice(0, n).map(a => `- ${a.titulo}: ${resumirSecao(a.texto)}`).join('\n');
    const sk = skills.secaoConteudoSkill({ ...ctxSkill, secao: s, secoesPlanejadas: titulos, resumoEscritas, metaPalavras: s.meta });
    if (n > 0) send(res, { type: 'token', text: '\n\n' });
    const r = await gerarComContinuacao(res, sk, sess, client, { maxTokens: SECAO_MAX_TOKENS });
    s.texto = comTituloDaSecao(r.texto, s.titulo);
    s.truncada = r.truncada;
    tokens += r.completionTokens;
    continuacoes += r.continuacoes;
  }
  observabilidade.definirContexto({ secao: undefined });

  // Passada de expansão: refaz só as seções abaixo de 80% da meta.
  // (Aula já incompleta — truncada ou com seção ausente — não gasta chamadas expandindo.)
  let verificacao = conteudoSecoes.verificarCompletude({ secoes });
  const paraExpandir = verificacao.estado === 'incompleta' ? [] : verificacao.curtas;
  for (const titulo of paraExpandir) {
    if (client.disconnected) break;
    const s = secoes.find(x => x.titulo === titulo);
    send(res, { type: 'progress', message: `Aula ${i + 1}: expandindo a seção curta "${titulo}"...` });
    const sk = skills.expandirSecaoSkill({
      secao: s, textoAtual: s.texto, metaPalavras: s.meta, palavrasAtuais: conteudoSecoes.contarPalavras(s.texto),
      aulaTitulo: aula.titulo, nivel: ctxSkill.nivel, metodologia: ctxSkill.metodologia, bnccContext: ctxSkill.bnccContext
    });
    observabilidade.definirContexto({ secao: titulo });
    const comp = await chamarOpenAI('chat', {
      model: sk.model, max_tokens: SECAO_MAX_TOKENS,
      messages: [{ role: 'system', content: sk.system }, { role: 'user', content: sk.user }]
    }, { signal: combineSignals(client.signal, makeAbortSignal(90_000)) }, { nome: 'conteudo.expandir-secao' });
    addUsage(comp.usage, sess);
    tokens += comp.usage?.completion_tokens || 0;
    const novo = comTituloDaSecao(comp.choices[0]?.message?.content || '', titulo);
    // Só aceita a expansão se terminou normalmente e realmente aumentou a seção.
    if (comp.choices[0]?.finish_reason !== 'length' && conteudoSecoes.contarPalavras(novo) > conteudoSecoes.contarPalavras(s.texto)) {
      s.texto = novo;
    }
  }
  observabilidade.definirContexto({ secao: undefined });
  verificacao = conteudoSecoes.verificarCompletude({ secoes });

  return {
    texto: secoes.map(s => s.texto).join('\n\n'),
    secoes,
    ...verificacao,
    finishReason: secoes.some(s => s.truncada) ? 'length' : 'stop',
    completionTokens: tokens,
    continuacoes,
    modo: 'secoes'
  };
}

async function gerarAulaPassadaUnica({ res, sess, client, ctxSkill }) {
  const skill = skills.conteudoSkill(ctxSkill);
  const r = await gerarComContinuacao(res, skill, sess, client, { maxTokens: MAX_TOKENS_AULA });
  const verificacao = conteudoSecoes.verificarCompletude({ texto: r.texto, truncada: r.truncada });
  return {
    texto: r.texto,
    secoes: null,
    ...verificacao,
    finishReason: r.finishReason,
    completionTokens: r.completionTokens,
    continuacoes: r.continuacoes,
    modo: 'unico'
  };
}

// Lista de aulas (1-based) cujo conteúdo está marcado incompleto — vem da sessão
// ou, quando a sessão foi perdida, do projeto.json. Estado ausente = completa.
function aulasIncompletas(sess) {
  let estados = sess?.estadoAulas;
  if (!estados && (sess?.config?.nome || sess?.config?.pastaProjeto)) {
    try {
      estados = JSON.parse(fs.readFileSync(path.join(courseScrDir(sess), 'projeto.json'), 'utf-8')).estadoAulas;
    } catch { /* sem projeto.json: nenhuma aula marcada */ }
  }
  return Object.entries(estados || {})
    .filter(([, v]) => v?.estado === 'incompleta')
    .map(([k]) => Number(k))
    .sort((a, b) => a - b);
}

// "?aulas=3,5" → Set de índices 0-based (null = todas as aulas).
function parseAulasAlvo(valor, total) {
  if (!valor) return null;
  const nums = String(valor).split(',').map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= total);
  return nums.length ? new Set(nums.map(n => n - 1)) : null;
}

// ── GET /api/conteudo (SSE) ─────────────────────────────────────────────────
// Gera, para cada aula, um arquivo de conteúdo independente (Ajustes 1, 3 e 4
// de alinhamento e consciência sequencial) e persiste em saídas/<curso>/aulaNN_conteudo.docx.
// `?aulas=3,5` regenera só essas aulas (as demais são preservadas) — usado para
// refazer aulas marcadas incompletas. Uma aula incompleta nunca é gravada como
// pronta: o texto parcial vai para aulaNN_conteudo.partial.txt e a Etapa 5 fica
// bloqueada (evento `done` traz `incompletas`; rotas dependentes respondem erro).
app.get('/api/conteudo', async (req, res) => {
  const sess = getSession(req, res);
  if (exigePesquisaModulos(sess)) {
    return sseError(res, 'Antes de gerar o conteúdo, faça a pesquisa por módulo (ou escolha "gerar sem pesquisa por módulo").');
  }
  sseHeaders(res);
  const client = clientAbort(res);
  const { nome, nivel, publico, duracao, modalidade } = sess.config;

  send(res, { type: 'progress', message: 'Analisando os objetivos das aulas do curso...' });

  // Memória persistente consultada para fundamentar o conteúdo.
  const ementa = sess.ementa || readMemory(sess, 'ementa');
  const planoEnsino = sess.planoEnsino || readMemory(sess, 'plano_de_ensino');
  const planoAula = sess.planoAula || readMemory(sess, 'plano_de_aula');

  try {
    const aulas = (sess.aulas && sess.aulas.length) ? sess.aulas : await planLessons(sess, planoEnsino, msg => send(res, { type: 'progress', message: msg }));
    sess.aulas = aulas;
    const alvo = parseAulasAlvo(req.query.aulas, aulas.length);
    if (alvo) restoreConteudoPorAula(sess); // preserva o conteúdo já gravado das demais aulas
    if (!alvo) sess.estadoAulas = {};
    sess.estadoAulas = sess.estadoAulas || {};
    const metaPalavrasAula = conteudoSecoes.estimarMetaPalavrasAula({ duracao, nivel });
    send(res, {
      type: 'progress',
      message: alvo
        ? `Regenerando ${alvo.size} aula(s): ${[...alvo].map(n => n + 1).join(', ')}...`
        : `${aulas.length} aula(s) identificada(s). Gerando conteúdo técnico de cada uma...`
    });

    let fullText = '';
    const conteudoPorAula = []; // { titulo, modulo, objetivos, texto }
    let geradas = 0;

    for (let i = 0; i < aulas.length; i++) {
      if (client.disconnected) break;

      const aula = aulas[i];
      const titulo = aula.titulo || `Aula ${i + 1}`;
      const numero = String(i + 1).padStart(2, '0');
      const heading = `${i === 0 ? '' : '\n\n'}# Aula ${i + 1}: ${titulo}\n\n`;

      if (alvo && !alvo.has(i)) {
        const existente = sess.conteudoPorAula?.[i] || { titulo, modulo: aula.modulo || '', objetivos: aula.objetivos || '', texto: readMemory(sess, `aula${numero}_conteudo`) };
        conteudoPorAula.push(existente);
        fullText += heading + (existente.texto || '');
        continue;
      }

      if (geradas > 0) await new Promise(r => setTimeout(r, PAUSA_ENTRE_AULAS_MS));
      if (client.disconnected) break;
      observabilidade.definirContexto({ aula: i + 1 });

      send(res, {
        type: 'progress',
        message: `Gerando aula ${i + 1} de ${aulas.length}: ${titulo}`
      });
      send(res, { type: 'token', text: heading });

      // Ajuste 1 — referência ao trecho ESPECÍFICO desta aula no plano de aula
      // (nunca o início genérico do texto integral).
      const planoAulaTrecho = extractLessonBlock(planoAula, i);
      // Ajuste 3 — mapa enxuto (título + objetivos) das demais aulas.
      const lessonSummaries = skills.summarizeLessons(aulas, { excludeIndex: i });

      // Dossiê de fontes DESTA aula (achados do módulo + gerais mais próximos), com IDs [F#] locais.
      const dossie = dossieDaAula(sess, aula, aulas);
      const ctxSkill = {
        nome, duracao, nivel, publico, modalidade, aula, index: i, total: aulas.length,
        ementa, planoAulaTrecho, lessonSummaries,
        metodologia: getMetodologia(sess), bnccContext: buildPedagogicalContext(sess),
        proporcaoTeoricoPratico: sess.config.proporcaoTeoricoPratico,
        preRequisitos: sess.config.preRequisitos,
        pesquisaBloco: blocoPesquisa(dossie, true),
        pesquisaDossie: blocoPesquisa(dossie, false)
      };

      let resultado = null;
      try {
        if (conteudoModo() === 'secoes') {
          resultado = await gerarAulaPorSecoes({ res, sess, client, ctxSkill, aula, metaPalavrasAula });
          if (!resultado) {
            send(res, { type: 'warning', text: `Aula ${i + 1}: o roteiro das seções veio inválido — gerando em passada única.` });
          }
        }
        if (!resultado) resultado = await gerarAulaPassadaUnica({ res, sess, client, ctxSkill });
      } catch (err) {
        if (client.disconnected) {
          console.warn(`[sse] cliente desconectou durante a geração da aula ${i + 1} — interrompendo /api/conteudo`);
          return;
        }
        if (err instanceof OpenAI.APIUserAbortError) {
          send(res, { type: 'error', message: `Tempo limite excedido ao gerar a aula ${i + 1}: ${titulo}. Tente novamente.` });
          err.alreadyReported = true;
        }
        throw err;
      }
      geradas++;
      if (client.disconnected) return;

      let { texto } = resultado;
      const { estado } = resultado;
      // Fundamentação: verificação mecânica das citações e referências autoritativas
      // (URL e título do dossiê, só das fontes citadas). Sem pesquisa: sem [F#] nem referências.
      let citacoes = null;
      if (estado !== 'incompleta') {
        if (dossie.modo === 'web') {
          citacoes = fundamentacao.verificarCitacoes(texto, dossie.fontes);
          texto = fundamentacao.substituirReferencias(texto, dossie.fontes, citacoes.usadas);
        } else if (dossie.modo === 'sem_web') {
          texto = fundamentacao.limparParaMidia(texto);
        }
      }
      sess.estadoAulas[numero] = {
        estado, modo: resultado.modo, palavras: resultado.palavras, finishReason: resultado.finishReason,
        completionTokens: resultado.completionTokens, continuacoes: resultado.continuacoes, motivos: resultado.motivos,
        secoes: resultado.secoes?.map(s => ({ titulo: s.titulo, palavras: conteudoSecoes.contarPalavras(s.texto), meta: s.meta })),
        dossie: dossie.modo === 'nenhum' ? undefined : { modo: dossie.modo, fontes: dossie.fontes },
        citacoes: citacoes || undefined,
        geradoEm: new Date().toISOString()
      };
      const partialPath = path.join(courseScrDir(sess), `aula${numero}_conteudo.partial.txt`);

      if (estado === 'incompleta') {
        // Nunca vai para o .txt/.docx oficial: só para o arquivo parcial.
        fs.writeFileSync(partialPath, texto, 'utf-8');
        saveProject(sess);
        send(res, { type: 'warning', text: `Aula ${i + 1} INCOMPLETA (${resultado.motivos.join('; ')}). O texto parcial foi salvo em aula${numero}_conteudo.partial.txt — regenere a aula para avançar.` });
      } else {
        fs.rmSync(partialPath, { force: true });
        // Persiste o conteúdo desta aula como arquivo independente.
        const fontesCitadas = citacoes ? dossie.fontes.filter(f => citacoes.usadas.includes(f.id)).map(f => ({ url: f.url, title: `${f.id} — ${f.titulo}` })) : [];
        await persistStage(sess, `aula${numero}_conteudo`, `Conteúdo — Aula ${i + 1}: ${titulo}`, texto, fontesCitadas);
        if (citacoes) {
          // Falhas de citação vão para o relatório/aviso, sem bloquear a gravação.
          if (citacoes.idsInvalidos.length) send(res, { type: 'warning', text: `Aula ${i + 1} cita fonte(s) inexistente(s) no dossiê: ${citacoes.idsInvalidos.map(id => `[${id}]`).join(', ')}.` });
          if (!citacoes.minimoAtingido) send(res, { type: 'warning', text: `Aula ${i + 1} cita ${citacoes.distintas} fonte(s) distinta(s) — o esperado é ao menos 2.` });
          if (citacoes.numerosSemCitacao) send(res, { type: 'warning', text: `Aula ${i + 1}: ${citacoes.numerosSemCitacao} trecho(s) com dado numérico sem citação [F#].` });
        }
        if (estado === 'curta') {
          send(res, { type: 'warning', text: `Aula ${i + 1} ficou curta (${resultado.palavras} palavras; seções abaixo da meta: ${resultado.curtas.join(', ')}).` });
        }
      }
      registrarGeracaoAula(sess, {
        aula: i + 1, estado, modo: resultado.modo, finishReason: resultado.finishReason,
        completionTokens: resultado.completionTokens, palavras: resultado.palavras, continuacoes: resultado.continuacoes,
        citacoes: citacoes ? { distintas: citacoes.distintas, idsInvalidos: citacoes.idsInvalidos.length, numerosSemCitacao: citacoes.numerosSemCitacao } : undefined
      });

      fullText += heading + texto;
      conteudoPorAula.push({ titulo, modulo: aula.modulo || '', objetivos: aula.objetivos || '', texto });
    }

    sess.conteudo = fullText;
    sess.conteudoPorAula = conteudoPorAula;
    saveProject(sess);

    const incompletas = aulasIncompletas(sess);
    const estadoAulas = Object.fromEntries(Object.entries(sess.estadoAulas).map(([k, v]) => [k, { estado: v.estado, palavras: v.palavras }]));
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText, estadoAulas, incompletas });
  } catch (err) {
    console.error(err);
    if (!err.alreadyReported) {
      send(res, { type: 'error', message: err.message || 'Erro ao gerar conteúdo' });
    }
  } finally {
    res.end();
  }
});

// ── GET /api/tokens — contador global + histórico persistido do projeto ────
app.get('/api/tokens', (req, res) => {
  const sess = getSession(req, res);
  const projeto = (sess.config?.nome || sess.config?.pastaProjeto) ? readTokenUsage(sess) : null;
  res.json({ ...tokenUsage, ...(projeto ? { projeto } : {}) });
});

// Migra projetos legados (arquivos planos em saídas/{slug}/) para saídas/{slug}/scr/
function migrarSeNecessario(slug) {
  const legacyDir = path.join(SAIDAS_ROOT, slug);
  const scrDir = path.join(SAIDAS_ROOT, slug, 'scr');
  const legacyProjetoPath = path.join(legacyDir, 'projeto.json');
  if (!fs.existsSync(legacyProjetoPath)) return;
  if (fs.existsSync(path.join(scrDir, 'projeto.json'))) return; // já migrado
  try {
    fs.mkdirSync(scrDir, { recursive: true });
    const files = fs.readdirSync(legacyDir);
    for (const file of files) {
      if (file.endsWith('.txt') || file === 'projeto.json') {
        fs.renameSync(path.join(legacyDir, file), path.join(scrDir, file));
      }
    }
    console.log(`[migração] Projeto "${slug}" migrado para estrutura /scr`);
  } catch (err) {
    console.error(`[migração] Erro ao migrar "${slug}":`, err.message);
  }
}

// Rótulos conhecidos para os arquivos gerados pelo pipeline (ver persistStage).
const ARQUIVO_LABELS = {
  ementa: 'Ementa',
  pesquisa: 'Pesquisa Web',
  pesquisa_modulos: 'Pesquisa por Módulo',
  plano_de_ensino: 'Plano de Ensino',
  plano_de_aula: 'Plano de Aula',
  revisao_qualidade: 'Revisão de Qualidade',
  relatorio_qualidade: 'Relatório Técnico-Pedagógico',
  ppc_completo: 'Projeto Pedagógico de Curso',
  conteudo_final: 'Conteúdo Final',
};

// Escaneia de verdade os arquivos presentes na pasta do projeto (raiz + /scr),
// em vez de confiar no campo "stages" do projeto.json, que pode estar
// desatualizado em relação ao que realmente existe em disco.
function listarArquivosDoProjeto(baseDir) {
  const vistos = new Set();
  const arquivos = [];

  const addFromDir = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext !== '.docx' && ext !== '.txt') continue;
      const baseName = path.basename(entry.name, ext);
      if (vistos.has(baseName)) continue;

      const aulaMatch = baseName.match(/^aula(\d{2})_conteudo$/);
      const rotulo = aulaMatch ? `Aula ${Number(aulaMatch[1])}` : ARQUIVO_LABELS[baseName];
      if (!rotulo) continue; // ignora arquivos não reconhecidos (ex.: exports avulsos)

      vistos.add(baseName);
      arquivos.push({ baseName, rotulo });
    }
  };

  addFromDir(baseDir);
  addFromDir(path.join(baseDir, 'scr'));
  arquivos.sort((a, b) => a.baseName.localeCompare(b.baseName));
  return arquivos;
}

// ── POST /api/carregar-projeto — reconstrói sessão a partir do disco ─────────
app.post('/api/carregar-projeto', (req, res) => {
  const sess = getSession(req, res);
  const { pasta } = req.body || {};
  if (!pasta?.trim()) return res.status(400).json({ error: 'pasta obrigatória' });

  const baseDir = path.resolve(pasta.trim());
  if (!fs.existsSync(baseDir)) return res.status(404).json({ error: 'Pasta não encontrada' });

  // Migração legada apenas para projetos dentro de saídas/ (estrutura antiga
  // sem /scr, anterior à introdução de pastaProjeto).
  const slugLegado = path.basename(baseDir);
  if (path.dirname(baseDir) === SAIDAS_ROOT) migrarSeNecessario(slugLegado);

  const camposFaltantes = [];
  const etapasCarregadas = [];
  let stages = {};

  const projetoPath = path.join(baseDir, 'scr', 'projeto.json');
  let projetoJson = null;
  let avisoCorrompido = null;
  let backupCorrompido = null;
  if (fs.existsSync(projetoPath)) {
    try {
      projetoJson = JSON.parse(fs.readFileSync(projetoPath, 'utf-8'));
    } catch {
      // projeto.json inválido: trata como ausente (fluxo legado, lê os .txt),
      // preservando o arquivo ruim como .bak para não perder nada.
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const bakPath = `${projetoPath}.corrompido-${ts}.bak`;
      try {
        fs.renameSync(projetoPath, bakPath);
        backupCorrompido = path.basename(bakPath);
      } catch (err) {
        console.warn(`[carregar-projeto] Não foi possível preservar o projeto.json corrompido: ${err.message}`);
      }
      avisoCorrompido = backupCorrompido
        ? `projeto.json corrompido — preservado como ${backupCorrompido}; campos estruturados (BNCC, metodologia) precisam ser revistos`
        : 'projeto.json corrompido — campos estruturados (BNCC, metodologia) precisam ser revistos';
    }
  }
  if (projetoJson) {
    const p = projetoJson;
    sess.config = p.config || {};
    sess.bncc = p.bncc || { ativo: false, publico: null, nivel: null, itens: [] };
    sess.metodologia = p.metodologia || '';
    sess.aulas = p.aulas || [];
    sess.inputs = p.inputs || {};
    sess.estiloVisual = p.estiloVisual || null;
    sess.slidesTemplate = p.slidesTemplate || null;
    sess.roteiroBlocos = p.roteiroBlocos || null;
    sess.roteirosGerados = p.roteirosGerados || [];
    sess.slidesObservacaoDefault = p.slidesObservacaoDefault || '';
    sess.slidesQuantidadeDefault = p.slidesQuantidadeDefault || null;
    sess.slidesGerados = p.slidesGerados || [];
    sess.heygenConfig = p.heygenConfig || null;
    sess.roteirosAvatarGerados = p.roteirosAvatarGerados || [];
    sess.duracaoAvatarDefault = p.duracaoAvatarDefault || null;
    sess.videosAvatarGerados = p.videosAvatarGerados || [];
    sess.estadoAulas = p.estadoAulas || {};
    stages = p.stages || {};
  } else {
    // legado (ou projeto.json corrompido, já preservado como .bak acima):
    // infere config pelo nome da pasta
    sess.config = { nome: slugLegado.replace(/_/g, ' ') };
    camposFaltantes.push('bncc', 'metodologia', 'aulas');
  }

  // A pasta que o usuário acabou de selecionar É a pastaProjeto a partir de
  // agora, independentemente do que estava (ou não) gravado no projeto.json —
  // torna o carregamento autocurativo para projetos afetados por pastaProjeto
  // vazia (ver fix-pastaprojeto-persist-on-config).
  sess.config.pastaProjeto = baseDir;

  // Carrega campos textuais via readMemory
  const textuais = [
    ['ementa', 'ementa'],
    ['pesquisa', 'pesquisa'],
    ['planoEnsino', 'plano_de_ensino'],
    ['planoAula', 'plano_de_aula'],
    ['revisaoQualidade', 'revisao_qualidade'],
    ['relatorioQualidade', 'relatorio_qualidade'],
  ];
  for (const [sessField, baseName] of textuais) {
    const txt = readMemory(sess, baseName);
    if (txt) { sess[sessField] = txt; etapasCarregadas.push(baseName); }
  }

  // pesquisa.json (resultado estruturado da Etapa 2); ausente em projetos
  // antigos → status 'legado' (fluxo antigo continua funcionando).
  sess.pesquisaMeta = lerPesquisaMeta(sess);

  // Autocura: projeto.json com "aulas": [] mas conteúdo já gerado em disco —
  // reconstrói sess.aulas a partir dos próprios arquivos aula{NN}_conteudo.txt.
  if (!sess.aulas?.length) {
    const reconstruidas = reconstruirAulasApartirDosArquivos(sess);
    if (reconstruidas.length) {
      console.warn(`[carregar-projeto] "aulas" vazio em projeto.json para "${sess.config?.nome}" — reconstruído a partir de ${reconstruidas.length} arquivo(s) em disco.`);
      sess.aulas = reconstruidas;
      saveProject(sess);
    }
  }

  // Carrega conteudo por aula
  if (sess.aulas?.length) {
    sess.conteudoPorAula = sess.aulas.map((aula, i) => {
      const idx = String(i + 1).padStart(2, '0');
      const texto = readMemory(sess, `aula${idx}_conteudo`);
      if (texto) etapasCarregadas.push(`aula${idx}_conteudo`);
      return { ...aula, texto };
    });
  }

  // Reconstrói sess.conteudo a partir dos arquivos individuais de aula (conteudo.txt não é mais gerado)
  if (!sess.conteudo && sess.conteudoPorAula?.length) {
    sess.conteudo = sess.conteudoPorAula.map((a, i) =>
      `${i === 0 ? '' : '\n\n'}# Aula ${i + 1}: ${a.titulo}\n\n${a.texto || ''}`
    ).join('');
  }

  const arquivos = listarArquivosDoProjeto(baseDir);

  res.json({ ok: true, ...(avisoCorrompido ? { aviso: avisoCorrompido, ...(backupCorrompido ? { backup: backupCorrompido } : {}) } : {}), etapasCarregadas, camposFaltantes, stages, pesquisaMeta: sess.pesquisaMeta || null, estadoAulas: sess.estadoAulas || {}, arquivos, nome: sess.config?.nome, config: sess.config, metodologia: getMetodologia(sess), inputs: sess.inputs || {}, estiloVisual: sess.estiloVisual || null, slidesTemplate: sess.slidesTemplate || null, roteiroBlocos: sess.roteiroBlocos || null, roteirosGerados: sess.roteirosGerados || [], slidesObservacaoDefault: sess.slidesObservacaoDefault || '', slidesQuantidadeDefault: sess.slidesQuantidadeDefault || null, slidesGerados: sess.slidesGerados || [], heygenConfig: sess.heygenConfig || null, roteirosAvatarGerados: sess.roteirosAvatarGerados || [], duracaoAvatarDefault: sess.duracaoAvatarDefault || null, videosAvatarGerados: sess.videosAvatarGerados || [] });
});

// ── POST /api/importar — detecta stage de um .docx enviado pelo usuário ──────
const STAGES_FIXOS = {
  'metodologia': { sessField: 'metodologia', label: 'Metodologia Pedagógica' },
  'ementa': { sessField: 'ementa', label: 'Ementa do Curso' },
  'pesquisa': { sessField: 'pesquisa', label: 'Pesquisa Web' },
  'plano_de_ensino': { sessField: 'planoEnsino', label: 'Plano de Ensino' },
  'plano_de_aula': { sessField: 'planoAula', label: 'Plano de Aula' },
  'revisao_qualidade': { sessField: 'revisaoQualidade', label: 'Revisão de Qualidade' },
};

function detectStage(filename, firstH1, sess) {
  // 1. Pelo nome do arquivo
  const base = path.basename(filename, '.docx');
  if (STAGES_FIXOS[base]) return { stage: base, detectadoPor: 'nome' };
  // aula03_conteudo → aula03_conteudo
  if (/^aula\d{2}_conteudo$/.test(base)) return { stage: base, detectadoPor: 'nome' };
  // roteiro03 → roteiro03 (Etapa 9 — Roteiros de vídeo)
  if (/^roteiro\d{2}$/.test(base)) return { stage: base, detectadoPor: 'nome' };
  // roteiroAvatar03 → roteiroAvatar03 (Etapa 10 — Vídeo com avatar)
  if (/^roteiroAvatar\d{2}$/.test(base)) return { stage: base, detectadoPor: 'nome' };
  // O export gera "<nome_do_curso>_<stage>.docx" — casa pelo sufixo _<stage>
  const baseLower = base.toLowerCase();
  for (const key of Object.keys(STAGES_FIXOS)) {
    if (baseLower.endsWith('_' + key)) return { stage: key, detectadoPor: 'nome' };
  }
  const mAula = baseLower.match(/_(aula\d{2}_conteudo)$/);
  if (mAula) return { stage: mAula[1], detectadoPor: 'nome' };

  // 2. Pelo título H1
  if (firstH1 && sess.aulas?.length) {
    const titulo = firstH1.replace(/^#+\s*/, '').replace(/^Aula\s+\d+\s*[—\-:]\s*/i, '').trim().toLowerCase();
    const match = sess.aulas.findIndex(a => a.titulo.toLowerCase().includes(titulo) || titulo.includes(a.titulo.toLowerCase()));
    if (match !== -1) {
      const idx = String(match + 1).padStart(2, '0');
      return { stage: `aula${idx}_conteudo`, titulo: sess.aulas[match].titulo, detectadoPor: 'titulo' };
    }
  }
  return null;
}

app.post('/api/importar', upload.single('arquivo'), async (req, res) => {
  const sess = getSession(req, res);
  if (!req.file) return res.status(400).json({ error: 'Arquivo ausente' });
  if (!req.file.originalname.toLowerCase().endsWith('.docx'))
    return res.status(400).json({ error: 'Apenas arquivos .docx são aceitos' });

  let texto = '';
  try {
    const result = await mammoth.extractRawText({ buffer: req.file.buffer });
    texto = result.value.trim();
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao processar .docx: ' + err.message });
  }

  const firstH1 = texto.split('\n').find(l => l.trim());
  const detected = detectStage(req.file.originalname, firstH1, sess);

  if (!detected) {
    // Retorna candidatos para seleção manual
    const candidatos = Object.entries(STAGES_FIXOS).map(([s, v]) => ({ stage: s, titulo: v.label }));
    if (sess.aulas?.length) {
      sess.aulas.forEach((a, i) => {
        const idx = String(i + 1).padStart(2, '0');
        candidatos.push({ stage: `aula${idx}_conteudo`, titulo: `Aula ${i + 1}: ${a.titulo}` });
      });
    }
    return res.json({ ok: true, stagioDetectado: null, detectadoPor: 'ambiguo', candidatos, texto, chars: texto.length, requerConfirmacao: true });
  }

  res.json({ ok: true, stagioDetectado: detected.stage, titulo: detected.titulo || detected.stage, chars: texto.length, detectadoPor: detected.detectadoPor, texto, requerConfirmacao: true });
});

// ── POST /api/importar/confirmar — sobrescreve .txt com versão do usuário ────
app.post('/api/importar/confirmar', async (req, res) => {
  const sess = getSession(req, res);
  const { stage, texto } = req.body || {};
  if (!stage || !texto) return res.status(400).json({ error: 'stage e texto são obrigatórios' });

  const allStages = { ...STAGES_FIXOS };
  if (sess.aulas?.length) {
    sess.aulas.forEach((_, i) => {
      const idx = String(i + 1).padStart(2, '0');
      allStages[`aula${idx}_conteudo`] = { sessField: null, label: `Aula ${i + 1}` };
      // roteiroAvatar{NN} (Etapa 10) — sem espelho em sess (o .txt em disco é
      // a fonte lida na hora de gerar o vídeo), só precisa existir aqui para
      // não cair no guard "Stage desconhecido" abaixo.
      allStages[`roteiroAvatar${idx}`] = { sessField: null, label: `Roteiro de Avatar — Aula ${i + 1}` };
    });
  }
  if (!allStages[stage]) return res.status(400).json({ error: 'Stage desconhecido' });

  try {
    const scrDir = courseScrDir(sess);
    fs.writeFileSync(path.join(scrDir, `${stage}.txt`), texto, 'utf-8');

    // Atualiza sessão
    const { sessField } = allStages[stage];
    if (sessField) {
      sess[sessField] = texto;
    } else if (/^aula(\d{2})_conteudo$/.test(stage)) {
      const idx = parseInt(stage.match(/^aula(\d{2})/)[1], 10) - 1;
      if (sess.conteudoPorAula?.[idx]) sess.conteudoPorAula[idx].texto = texto;
    }

    saveProject(sess, { baseName: stage, fonte: 'usuario' });
    if (stage === 'pesquisa') {
      // Versão do usuário: mantém consultas/fontes/achados originais.
      const base = lerPesquisaMeta(sess) || { status: 'legado', modelo: null, geradoEm: null, consultas: [], fontes: [], achados: [] };
      escreverPesquisaMeta(sess, { ...base, fonte: 'usuario', editadoEm: new Date().toISOString() });
    }
    res.json({ ok: true, stage });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar: ' + err.message });
  }
});

// ── POST /api/export/:step ──────────────────────────────────────────────────
app.post('/api/export/:step', async (req, res) => {
  const sess = getSession(req, res);
  const { step } = req.params;
  const { sites = [] } = req.body;

  const stepLabels = {
    metodologia: 'Metodologia Pedagógica',
    pesquisa: 'Pesquisa Web',
    'plano-ensino': 'Plano de Ensino',
    'plano-aula': 'Plano de Aula',
    conteudo: 'Conteúdo da Aula',
    'revisao-qualidade': 'Revisão de Qualidade',
    qualidade: 'Relatório Técnico-Pedagógico',
    ppc: 'Projeto Pedagógico de Curso'
  };

  const textMap = {
    metodologia: getMetodologia(sess),
    pesquisa: sess.pesquisa,
    'plano-ensino': sess.planoEnsino,
    'plano-aula': sess.planoAula,
    conteudo: sess.conteudo,
    'revisao-qualidade': sess.revisaoQualidade || readMemory(sess, 'revisao_qualidade'),
    qualidade: sess.relatorioQualidade,
    ppc: readMemory(sess, 'ppc_completo')
  };

  const content = textMap[step];
  if (!content) {
    return res.status(400).json({ error: 'Conteúdo não encontrado para esta etapa' });
  }

  try {
    const doc = buildDocx(sess.config, stepLabels[step] || step, content, sites);
    const buffer = await Packer.toBuffer(doc);
    const filename = `${(sess.config.nome || 'curso').replace(/\s+/g, '_')}_${step}.docx`;

    const fullPath = path.join(courseRootDir(sess), filename);
    fs.writeFileSync(fullPath, buffer);
    res.json({ ok: true, saved: true, path: fullPath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── DOCX builder ────────────────────────────────────────────────────────────
function buildDocx(config, stepLabel, content, sites = []) {
  const now = new Date();
  const datePart = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const timePart = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const children = [];

  // Capa
  children.push(
    new Paragraph({
      text: config.nome || 'Curso',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 400 }
    }),
    new Paragraph({
      children: [new TextRun({ text: stepLabel, bold: true, size: 32 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    }),
    new Paragraph({
      children: [new TextRun({ text: `Gerado em: ${datePart} às ${timePart}`, color: '666666', size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 }
    }),
    new Paragraph({ text: '', pageBreakBefore: true })
  );

  // Converte markdown simples em parágrafos docx
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.trim() === '<!--PAGEBREAK-->') {
      children.push(new Paragraph({ text: '', pageBreakBefore: true }));
      continue;
    }

    if (!line.trim()) {
      children.push(new Paragraph({ text: '' }));
      continue;
    }

    if (line.startsWith('# ')) {
      children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }));
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      children.push(
        new Paragraph({
          text: line.slice(2),
          bullet: { level: 0 }
        })
      );
    } else {
      // Processa negrito inline **texto**
      const parts = line.split(/\*\*(.*?)\*\*/g);
      const runs = parts.map((p, i) =>
        new TextRun({ text: p, bold: i % 2 === 1 })
      );
      children.push(new Paragraph({ children: runs }));
    }
  }

  // Sites consultados (etapa pesquisa)
  if (sites.length > 0) {
    children.push(
      new Paragraph({ text: '' }),
      new Paragraph({ text: 'Fontes Consultadas', heading: HeadingLevel.HEADING_2 })
    );
    for (const site of sites) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `• ${site.title || site.url}`, color: '4A3B8C' })
          ]
        })
      );
    }
  }

  const header = new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: `${config.nome || 'Curso'} — ${stepLabel}`, color: '4A3B8C', size: 18 })
        ],
        alignment: AlignmentType.RIGHT
      })
    ]
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'Página ', size: 18, color: '666666' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '666666' }),
          new TextRun({ text: ' de ', size: 18, color: '666666' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '666666' })
        ],
        alignment: AlignmentType.CENTER
      })
    ]
  });

  return new Document({
    sections: [{
      headers: { default: header },
      footers: { default: footer },
      children
    }]
  });
}

// ── GET /api/revisao-qualidade (SSE) — Etapa 5★ ─────────────────────────────
// Analisa cada aula contra os documentos de referência, Jaccard como reporte
// informativo e gera relatório com espaço para observações do revisor humano.
app.get('/api/revisao-qualidade', async (req, res) => {
  const sess = getSession(req, res);
  restoreConteudoPorAula(sess);
  if (!sess.conteudoPorAula?.length) {
    return sseError(res, 'Conclua a Etapa 5 antes de gerar a revisão de qualidade.');
  }
  sseHeaders(res);
  const client = clientAbort(res);
  send(res, { type: 'progress', message: 'Calculando sobreposições entre aulas (Jaccard)...' });

  const aulas = sess.conteudoPorAula;
  const sobreposicoesPorAula = aulas.map((aula, i) => {
    const overlaps = [];
    for (let j = 0; j < aulas.length; j++) {
      if (i === j) continue;
      const sim = textSimilarity(aula.texto, aulas[j].texto);
      if (sim >= 0.55) {
        overlaps.push({ indice: j + 1, titulo: aulas[j].titulo, similaridade: Math.round(sim * 100) });
      }
    }
    return overlaps;
  });

  const ementa = sess.ementa || readMemory(sess, 'ementa');
  const planoEnsino = sess.planoEnsino || readMemory(sess, 'plano_de_ensino');
  const planoAula = sess.planoAula || readMemory(sess, 'plano_de_aula');
  const bnccContext = buildPedagogicalContext(sess);
  let fullText = '';
  const notasPorAula = [];
  const resumosMelhoriasPorAula = [];

  try {
    for (let i = 0; i < aulas.length; i++) {
      if (client.disconnected) break;

      const aula = aulas[i];
      send(res, {
        type: 'progress',
        message: `Revisando aula ${i + 1} de ${aulas.length}: ${aula.titulo}`
      });

      const heading = `${i === 0 ? '' : '\n\n'}# Aula ${i + 1}: ${aula.titulo}\n\n`;
      send(res, { type: 'token', text: heading });
      fullText += heading;

      const skill = skills.revisaoQualidadeSkill({
        config: sess.config,
        ementa,
        planoEnsino: truncate(planoEnsino, 1500),
        planoAulaTrecho: extractLessonBlock(planoAula, i),
        aulaIndex: i,
        aulaTitulo: aula.titulo,
        aulaObjetivos: aula.objetivos,
        aulaConteudo: truncate(aula.texto, 2000),
        sobreposicoes: sobreposicoesPorAula[i],
        metodologia: getMetodologia(sess),
        bnccContext,
        pesquisaBloco: blocoPesquisa(dossieDaAula(sess, aula, aulas), false)
      });

      const texto = await streamSkillToClient(res, skill, sess, {}, client);
      fullText += texto;

      // Nota calculada pela fórmula de score (quality-scoring): rubrica de 5
      // critérios (LLM) + determinístico (cobertura/sobreposição/estrutura).
      // Fallback para o formato antigo de nota holística "Nota: X.XX" se o
      // modelo não seguir o formato de rubrica pedido.
      const rubrica = parseRubricaCriterios(texto);
      let nota = null;
      if (rubrica) {
        const sobreposicaoMaxima = (sobreposicoesPorAula[i] || [])
          .reduce((max, o) => Math.max(max, o.similaridade / 100), 0);
        const { determ } = computeScoreDeterministico(aula.texto, aula, sobreposicaoMaxima);
        nota = computeScoreComposto(rubrica.criterios, determ).score;
        observabilidade.registrarScore('nota_aula', nota, { comentario: `Aula ${i + 1}` });
        observabilidade.registrarScore('determinístico', determ, { comentario: `Aula ${i + 1}` });
        for (const [criterio, valor] of Object.entries(rubrica.criterios)) {
          observabilidade.registrarScore(`criterio_${criterio}`, valor, { comentario: `Aula ${i + 1}` });
        }

        // Âncora mecânica do nivelamento: aponta o critério de menor nota,
        // independente de o modelo ter respeitado a priorização pedida no
        // Resumo de Melhorias Propostas.
        const focoLinha = buildFocoSugerido(rubrica.criterios);
        if (focoLinha) {
          send(res, { type: 'token', text: focoLinha });
          fullText += focoLinha;
        }
      } else {
        const notaMatch = texto.match(/Nota:\s*([01](?:\.\d+)?)/i);
        nota = notaMatch ? Math.max(0, Math.min(1, parseFloat(notaMatch[1]))) : null;
      }
      notasPorAula.push({ numero: i + 1, titulo: aula.titulo, nota });
      resumosMelhoriasPorAula.push(extractResumoMelhorias(texto));
    }
    if (client.disconnected) return;

    notasPorAula.sort((a, b) => a.numero - b.numero);
    let resumoNotas = '\n\n<!--PAGEBREAK-->\n\n# Notas de Qualidade por Aula\n\n';
    for (const n of notasPorAula) {
      resumoNotas += `- Aula ${n.numero}: ${n.titulo} — Nota: ${n.nota !== null ? n.nota.toFixed(2) : 'N/A'}\n`;
    }
    send(res, { type: 'token', text: resumoNotas });
    fullText += resumoNotas;

    // Seção estruturada — única zona do documento lida pelo upload de melhorias.
    // Pré-preenchida com o resumo emitido pela revisão de cada aula; o revisor
    // humano faz curadoria (apaga, edita, acrescenta itens).
    let secaoMelhorias =
      '\n\n<!--PAGEBREAK-->\n\n' +
      'Edite apenas os itens abaixo — uma melhoria por linha. O sistema aplicará ' +
      'exclusivamente o que estiver nesta seção. Itens escritos abaixo da linha ' +
      '"[user]" de cada aula serão aplicados mesmo que a avaliação automática de ' +
      'qualidade não aponte melhora.\n\n' +
      '## Melhorias a serem Aplicadas\n\n';
    resumosMelhoriasPorAula.forEach((itens, i) => {
      secaoMelhorias += `Aula ${String(i + 1).padStart(2, '0')}\n`;
      secaoMelhorias += itens.length ? itens.map(t => `- ${t}`).join('\n') + '\n' : '';
      secaoMelhorias += '[user]\n';
      secaoMelhorias += '\n\n';
    });
    send(res, { type: 'token', text: secaoMelhorias });
    fullText += secaoMelhorias;

    sess.revisaoQualidade = fullText;
    await persistStage(sess, 'revisao_qualidade', 'Revisão de Qualidade', fullText);
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
    if (client.disconnected) {
      console.warn('[sse] cliente desconectou durante a revisão de qualidade — interrompendo /api/revisao-qualidade');
      return;
    }
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar revisão de qualidade' });
  } finally {
    res.end();
  }
});

// ── POST /api/aplicar-melhorias — Etapa 6 (upload do .docx anotado) ──────────
// Extrai texto do .docx, identifica "Observações do Revisor" por aula e retorna
// resumo para confirmação antes de aplicar qualquer alteração.
const DUPLICATE_OBS_THRESHOLD = 0.85;
app.post('/api/aplicar-melhorias', upload.single('arquivo'), async (req, res) => {
  const sess = getSession(req, res);

  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo .docx inválido ou não enviado.' });
  }
  if (!req.file.originalname.toLowerCase().endsWith('.docx')) {
    return res.status(400).json({ error: 'O arquivo deve ter extensão .docx.' });
  }

  restoreConteudoPorAula(sess);
  if (!sess.conteudoPorAula?.length) {
    return res.status(400).json({ error: 'Carregue o projeto antes de aplicar melhorias.' });
  }

  try {
    const { value: textoExtraido } = await mammoth.extractRawText({ buffer: req.file.buffer });

    const aulas = sess.conteudoPorAula || [];

    // Preferência: seção estruturada "Melhorias a serem Aplicadas" (única zona
    // lida quando presente — o corpo do documento é livre para o revisor).
    const estruturado = parseMelhoriasEstruturadas(textoExtraido, aulas.length);
    const modoLegado = !estruturado;
    let observacoesPorAula;

    if (estruturado) {
      observacoesPorAula = aulas.map((aula, i) => {
        const melhorias = estruturado.porAula[i] || [];
        return { titulo: aula.titulo, observacoes: melhorias.join('\n'), melhorias, forcado: estruturado.forcadoPorAula[i] };
      });
    } else {
      // Fallback legado: parser de "Observações do Revisor" por aula
      observacoesPorAula = aulas.map((aula, i) => {
        const aulaIndex = i + 1;
        const nextAulaIndex = i + 2;

        const aulaStart = textoExtraido.search(new RegExp(`Aula ${aulaIndex}[:\\s—]`, 'i'));
        let aulaEnd = textoExtraido.length;
        if (nextAulaIndex <= aulas.length) {
          const m = textoExtraido.search(new RegExp(`Aula ${nextAulaIndex}[:\\s—]`, 'i'));
          if (m > aulaStart) aulaEnd = m;
        }

        const aulaTexto = aulaStart !== -1 ? textoExtraido.slice(aulaStart, aulaEnd) : '';
        const obsStart = aulaTexto.search(/Observa[çc][oõ]es\s+do\s+Revisor/i);
        let observacoes = '';

        if (obsStart !== -1) {
          const afterHeading = aulaTexto.indexOf('\n', obsStart);
          const rawObs = afterHeading !== -1 ? aulaTexto.slice(afterHeading + 1) : '';
          const nextSection = rawObs.search(/\n[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][a-záéíóúàâêôãõç\s]{3,}\n/);
          observacoes = (nextSection !== -1 ? rawObs.slice(0, nextSection) : rawObs).trim();
        }

        return { titulo: aula.titulo, observacoes, melhorias: [], forcado: false };
      });
    }

    sess.observacoesMelhorias = observacoesPorAula;
    sess.modoLegadoMelhorias = modoLegado;

    // ── Check de duplicata: comparar observações novas com o último upload ────
    let avisoResposta = null;
    const juntarObs = lista => lista.map(o => o.observacoes || '').join(' ');
    const novasObsText = juntarObs(observacoesPorAula);
    if (novasObsText.length > 50) {
      try {
        const obsAnteriorPath = path.join(courseScrDir(sess), 'observacoes_pendentes.json');
        if (fs.existsSync(obsAnteriorPath)) {
          const obsAnteriores = JSON.parse(fs.readFileSync(obsAnteriorPath, 'utf-8'));
          const obsAntText = juntarObs(obsAnteriores.aulas || []);
          if (obsAntText.length > 50) {
            const simObs = textSimilarity(novasObsText, obsAntText);
            if (simObs > DUPLICATE_OBS_THRESHOLD) {
              avisoResposta = {
                aviso: 'possivel_duplicata',
                similaridadeObservacoes: Math.round(simObs * 100) / 100,
                dataUltimoUpload: obsAnteriores.dataUpload || null
              };
            }
          }
        }
      } catch (e) { console.error('Erro ao verificar duplicata de upload:', e.message); }
    }

    try {
      fs.writeFileSync(
        path.join(courseScrDir(sess), 'observacoes_pendentes.json'),
        JSON.stringify({ dataUpload: new Date().toISOString(), aulas: observacoesPorAula }, null, 2),
        'utf-8'
      );
    } catch (e) { console.error('Erro ao gravar observacoes_pendentes.json:', e.message); }
    const comObservacoes = observacoesPorAula.filter(o => o.observacoes.length > 0);
    const totalMelhorias = observacoesPorAula.reduce((s, o) => s + (o.melhorias?.length || 0), 0);

    // Aviso de convergência (early stopping): se o último ciclo elevou pouco
    // o score médio, avisa antes de rodar mais um ciclo de ganho marginal.
    let avisoConvergencia = null;
    const historico = readScoreHistorico(sess);
    const ultimoCiclo = historico.ciclos[historico.ciclos.length - 1];
    if (ultimoCiclo && ultimoCiclo.ganhoMedio < EPSILON_CONVERGENCIA) {
      avisoConvergencia = {
        ciclo: ultimoCiclo.ciclo,
        ganhoMedio: ultimoCiclo.ganhoMedio,
        porAula: ultimoCiclo.porAula
      };
    }

    res.json({
      ok: true,
      aulas: observacoesPorAula,
      totalComObservacoes: comObservacoes.length,
      totalMelhorias,
      modoLegado,
      avisosParser: estruturado?.avisos || [],
      ...(avisoConvergencia ? { avisoConvergencia } : {}),
      ...avisoResposta
    });
  } catch (err) {
    console.error('Erro ao processar .docx:', err.message);
    res.status(500).json({ error: 'Erro ao processar o arquivo .docx: ' + err.message });
  }
});

function buildAuditSection(metricasPorAula) {
  const afetadas = metricasPorAula.filter(m => m.similaridade > 0.90);
  if (afetadas.length === 0) return '';
  const todasAfetadas = afetadas.length === metricasPorAula.length;
  const simMedia = Math.round(
    metricasPorAula.reduce((s, m) => s + m.similaridade, 0) / metricasPorAula.length * 100
  );
  let txt = '\n\n---\n\n## Auditoria do Ciclo\n\n';
  if (todasAfetadas) {
    txt += `**Nenhuma nova implementação detectada neste ciclo** (similaridade média: ${simMedia}%).\n\n`;
  } else {
    txt += `As seguintes aulas tiveram pouca alteração (similaridade > 90%):\n\n`;
  }
  afetadas.forEach(a => {
    txt += `- **Aula ${a.aulaIndex} — ${a.titulo}**: ${Math.round(a.similaridade * 100)}% similar ao ciclo anterior\n`;
  });
  return txt;
}

// ── GET /api/aplicar-melhorias/confirmar (SSE) — Etapa 6 ─────────────────────
// Aplica as melhorias por aula (aplicarMelhoriasSkill, sem busca web).
app.get('/api/aplicar-melhorias/confirmar', async (req, res) => {
  const sess = getSession(req, res);

  restoreConteudoPorAula(sess);
  if (!sess.conteudoPorAula?.length) {
    return sseError(res, 'Sem conteúdo para melhorar. Conclua a Etapa 5.');
  }

  sseHeaders(res);
  const client = clientAbort(res);
  send(res, { type: 'progress', message: 'Iniciando aplicação de melhorias...' });

  const observacoes = sess.observacoesMelhorias ||
    sess.conteudoPorAula.map(a => ({ titulo: a.titulo, observacoes: '' }));
  const aulas = sess.conteudoPorAula;
  const novasPorAula = [];
  let fullText = '';
  const bnccContext = buildPedagogicalContext(sess);

  // Referências para o gate de score (julgamento pareado) — hoistadas para
  // antes do loop principal; antes só eram lidas na fase de realinhamento,
  // mais tarde no fluxo.
  const ementaScoreRef = truncate(sess.ementa || readMemory(sess, 'ementa'), 1200);
  const planoEnsinoScoreRef = truncate(sess.planoEnsino || readMemory(sess, 'plano_de_ensino'), 1200);
  const planoAulaScoreRef = sess.planoAula || readMemory(sess, 'plano_de_aula');
  const scoresPorAula = [];

  // ── Snapshot do ciclo: preserva estado anterior antes de sobrescrever ────────
  const scrDir = courseScrDir(sess);
  let cicloDir = null;
  let numeroCiclo = '001';
  try {
    const existentes = fs.readdirSync(scrDir).filter(n => /^ciclo_\d{3}$/.test(n)).length;
    numeroCiclo = String(existentes + 1).padStart(3, '0');
    cicloDir = path.join(scrDir, `ciclo_${numeroCiclo}`);
    fs.mkdirSync(cicloDir, { recursive: true });
    aulas.forEach((_, i) => {
      const num = String(i + 1).padStart(2, '0');
      const src = path.join(scrDir, `aula${num}_conteudo.txt`);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(cicloDir, `aula${num}_conteudo.txt`));
    });
    fs.writeFileSync(
      path.join(cicloDir, 'observacoes.json'),
      JSON.stringify({ aulas: observacoes }, null, 2), 'utf-8'
    );
  } catch (e) { console.error(`Erro ao criar snapshot ciclo_${numeroCiclo}:`, e.message); }

  const metricasPorAula = [];
  const reportSections = [];
  // Verificação mecânica e independente da autoavaliação do modelo — nunca
  // bloqueia persistência, só torna visível ao revisor humano. Ver design.md
  // do change verificacao-mecanica-melhorias.
  const inconsistenciasVerificacao = [];

  try {
    for (let i = 0; i < aulas.length; i++) {
      if (client.disconnected) break;

      const aula = aulas[i];
      const obs = observacoes[i]?.observacoes || '';

      // Restrição à seção estruturada: aula sem nenhuma melhoria listada
      // (bloco ausente, vazio, ou "Nenhuma") não é tocada — sem chamada de
      // API, sem pausa de rate-limit, conteúdo mantido byte a byte. Só se
      // aplica quando um upload real populou `sess.observacoesMelhorias` em
      // modo estruturado — sem upload (sessão nunca passou por
      // /api/aplicar-melhorias), todas as aulas continuam sendo processadas.
      const semMelhoriasNaSecao = !!sess.observacoesMelhorias && !sess.modoLegadoMelhorias &&
        (observacoes[i]?.melhorias?.length || 0) === 0;
      if (semMelhoriasNaSecao) {
        send(res, {
          type: 'progress',
          message: `Aula ${i + 1} de ${aulas.length}: sem melhorias na seção — mantida sem alteração`
        });
        const headingSemMelhorias = `${i === 0 ? '' : '\n\n'}# Aula ${i + 1}: ${aula.titulo}\n\n`;
        send(res, { type: 'token', text: headingSemMelhorias });
        fullText += headingSemMelhorias + (aula.texto || '');
        reportSections.push(`## Aula ${i + 1}: ${aula.titulo}\n\n_(Sem melhorias listadas na seção "Melhorias a serem Aplicadas" — aula mantida sem alteração.)_`);
        metricasPorAula.push({ aulaIndex: i + 1, titulo: aula.titulo, similaridade: 1, semMelhorias: true });
        novasPorAula.push({ ...aula });
        continue;
      }

      if (i > 0) await new Promise(r => setTimeout(r, PAUSA_ENTRE_AULAS_MS));
      if (client.disconnected) break;

      send(res, {
        type: 'progress',
        message: `Aplicando melhorias na aula ${i + 1} de ${aulas.length}: ${aula.titulo}`
      });

      const heading = `${i === 0 ? '' : '\n\n'}# Aula ${i + 1}: ${aula.titulo}\n\n`;
      send(res, { type: 'token', text: heading });
      fullText += heading;

      const skill = skills.aplicarMelhoriasSkill({
        config: sess.config,
        aulaIndex: i,
        aulaTitulo: aula.titulo,
        aulaObjetivos: aula.objetivos,
        conteudoAtual: aula.texto,
        observacoesRevisor: obs,
        melhorias: observacoes[i]?.melhorias,
        metodologia: getMetodologia(sess),
        bnccContext
      });

      const textoAntigo = aula.texto;
      const meta = {};
      let texto;
      try {
        texto = await streamSkillToClient(res, skill, sess, meta, client);
      } catch (err) {
        if (client.disconnected) {
          console.warn(`[sse] cliente desconectou durante melhorias da aula ${i + 1} — interrompendo /api/aplicar-melhorias/confirmar`);
          return;
        }
        throw err;
      }
      console.log(`[melhorias] aula ${i + 1}: finish=${meta.finishReason || '?'} tokens=${meta.completionTokens ?? '?'}`);

      // ── Guarda de integridade: resposta cortada por limite de tokens ───────
      // Até MAX_CONTINUACOES_MELHORIA tentativas de continuação; se ainda
      // incompleta, preserva o conteúdo anterior da aula (nunca sobrescrever
      // versão íntegra com truncada).
      for (
        let tentativa = 1;
        tentativa <= MAX_CONTINUACOES_MELHORIA && !isRespostaMelhoriasCompleta(texto, meta.finishReason);
        tentativa++
      ) {
        send(res, { type: 'progress', message: `Aula ${i + 1}: resposta cortada — solicitando continuação (tentativa ${tentativa}/${MAX_CONTINUACOES_MELHORIA})...` });
        try {
          const cont = await chamarOpenAI('chat', 
            {
              model: skill.model,
              max_tokens: MAX_TOKENS_AULA,
              messages: [
                { role: 'system', content: skill.system },
                { role: 'user', content: skill.user },
                { role: 'assistant', content: texto },
                {
                  role: 'user',
                  content:
                    `Sua resposta anterior foi CORTADA no meio. Continue EXATAMENTE de onde parou ` +
                    `(o final do que você escreveu foi: "${texto.slice(-200)}"). NÃO repita nada do que ` +
                    `já escreveu — em especial, se algum bloco <<<SECAO:>>>...<<<FIM_SECAO>>> já foi ` +
                    `FECHADO na parte anterior, não o reescreva; continue apenas o bloco que ficou ` +
                    `incompleto ou comece os que ainda faltam. Conclua garantindo a seção ` +
                    `"### Melhorias Aplicadas" completa ao final.`
                }
              ]
            },
            { signal: combineSignals(client.signal, makeAbortSignal(CONTEUDO_SEARCH_TIMEOUT_MS)) }
          );
          addUsage(cont.usage, sess);
          const contTexto = cont.choices[0]?.message?.content?.trim() || '';
          if (contTexto) {
            send(res, { type: 'token', text: '\n' + contTexto });
            texto += '\n' + contTexto;
          }
          meta.finishReason = cont.choices[0]?.finish_reason;
          console.log(`[melhorias] aula ${i + 1}: continuação ${tentativa}/${MAX_CONTINUACOES_MELHORIA} finish=${meta.finishReason || '?'}`);
        } catch (e) {
          console.error(`[melhorias] aula ${i + 1}: falha na continuação ${tentativa}/${MAX_CONTINUACOES_MELHORIA}:`, e.message);
          break;
        }
      }

      if (!isRespostaMelhoriasCompleta(texto, meta.finishReason)) {
        send(res, { type: 'warning', text: `Aula ${i + 1}: resposta truncada mesmo após continuação — o conteúdo anterior da aula foi preservado (melhorias NÃO aplicadas nesta aula).` });
        reportSections.push(`## Aula ${i + 1}: ${aula.titulo}\n\n_(Resposta truncada pelo limite de tokens — conteúdo anterior preservado; melhorias NÃO aplicadas nesta aula.)_`);
        metricasPorAula.push({ aulaIndex: i + 1, titulo: aula.titulo, similaridade: 1, truncada: true });
        fullText += textoAntigo || '';
        novasPorAula.push({ ...aula });
        continue;
      }

      // Funde o patch por seção no conteúdo anterior (fallback: se a resposta
      // não usou o formato <<<SECAO:>>>, é tratada como reescrita integral —
      // mergeSecoesConteudo devolve o texto sem alteração nesse caso).
      const { texto: textoMesclado, substituidas, novas, suspeitas } = mergeSecoesConteudo(textoAntigo, texto);
      suspeitas.forEach(s => {
        if (s.motivo === 'duplicado_no_patch') {
          inconsistenciasVerificacao.push(`Aula ${i + 1} (${aula.titulo}) — seção "${s.titulo}": a resposta continha mais de um bloco para o mesmo título; apenas o último foi aplicado.`);
        } else if (s.motivo === 'titulo_ambiguo') {
          inconsistenciasVerificacao.push(`Aula ${i + 1} (${aula.titulo}) — título "${s.titulo}" aparece ${s.ocorrencias}x no conteúdo original; apenas a primeira ocorrência foi atualizada.`);
        } else if (s.motivo === 'merge_rejeitado_duplicacao') {
          inconsistenciasVerificacao.push(`Aula ${i + 1} (${aula.titulo}) — fusão do patch rejeitada: o resultado duplicaria a seção "${s.titulo}". Conteúdo anterior preservado.`);
        } else {
          inconsistenciasVerificacao.push(`Aula ${i + 1} (${aula.titulo}) — seção "${s.titulo}" do conteúdo: substituída, mas ${Math.round(s.similaridade * 100)}% similar ao texto anterior — possivelmente sem mudança real.`);
        }
      });

      // Merge rejeitado pela rede de segurança (produziria duplicação de
      // cabeçalho): trata como as demais falhas de guarda — preserva o
      // conteúdo anterior e segue para a próxima aula, sem pagar o custo do
      // julgamento de score sobre um candidato que já sabemos ser inválido.
      const rejeicaoDuplicacao = suspeitas.find(s => s.motivo === 'merge_rejeitado_duplicacao');
      if (rejeicaoDuplicacao) {
        console.log(`[melhorias] aula ${i + 1}: merge rejeitado — duplicaria a seção "${rejeicaoDuplicacao.titulo}"`);
        send(res, { type: 'progress', message: `Aula ${i + 1}: melhorias descartadas — a fusão duplicaria a seção "${rejeicaoDuplicacao.titulo}" — conteúdo anterior preservado` });
        reportSections.push(`## Aula ${i + 1}: ${aula.titulo}\n\n_(Fusão do patch rejeitada — duplicaria a seção "${rejeicaoDuplicacao.titulo}"; conteúdo anterior preservado; melhorias NÃO aplicadas nesta aula.)_`);
        metricasPorAula.push({ aulaIndex: i + 1, titulo: aula.titulo, similaridade: 1, mergeRejeitado: true });
        fullText += textoAntigo || '';
        novasPorAula.push({ ...aula });
        continue;
      }

      // ── Gate de aceite por score: julgamento pareado original × candidato ──
      // Só persiste o candidato se ele elevar o score o suficiente (ver
      // capability quality-scoring). Nunca persiste uma "melhoria" que piora
      // ou não muda de fato a qualidade da aula.
      const outrasAulasOriginais = aulas.filter((_, idx) => idx !== i).map(a => a.texto);
      const maiorSobreposicao = (texto1) => outrasAulasOriginais.reduce(
        (max, outro) => Math.max(max, textSimilarity(texto1, outro)), 0
      );

      let aceita = true;
      let scoreOriginal = null;
      let scoreCandidato = null;
      // Item forçado por [user]: revisor pediu aplicação incondicional —
      // ignora o gate de score inteiramente (sem chamar o julgamento
      // pareado), mas mantém as demais redes de segurança já checadas acima
      // (truncamento/continuação e rejeição por duplicação).
      const forcadaPorUser = !sess.modoLegadoMelhorias && !!observacoes[i]?.forcado;
      if (forcadaPorUser) {
        aceita = true;
        console.log(`[melhorias] aula ${i + 1}: aceite forçado por [user] — gate de score ignorado`);
      } else {
        try {
          const skillScore = skills.scoreAulaSkill({
            aulaTitulo: aula.titulo,
            aulaObjetivos: aula.objetivos,
            textoOriginal: truncate(textoAntigo, 4000),
            textoCandidato: truncate(textoMesclado, 4000),
            planoAulaTrecho: truncate(extractLessonBlock(planoAulaScoreRef, i), 800),
            ementa: ementaScoreRef,
            planoEnsino: planoEnsinoScoreRef,
            nivel: sess.config.nivel,
            publico: sess.config.publico,
            modalidade: sess.config.modalidade,
            pesquisaBloco: blocoPesquisa(dossieDaAula(sess, aula, aulas), false)
          });
          const completionScore = await chamarOpenAI('chat', {
            model: skillScore.model,
            response_format: skillScore.response_format,
            messages: [
              { role: 'system', content: skillScore.system },
              { role: 'user', content: skillScore.user }
            ]
          });
          addUsage(completionScore.usage, sess);
          const julgamento = JSON.parse(completionScore.choices[0]?.message?.content || '{}');

          const determOriginal = computeScoreDeterministico(textoAntigo, aula, maiorSobreposicao(textoAntigo)).determ;
          const determCandidato = computeScoreDeterministico(textoMesclado, aula, maiorSobreposicao(textoMesclado)).determ;
          scoreOriginal = computeScoreComposto(julgamento.original, determOriginal).score;
          scoreCandidato = computeScoreComposto(julgamento.candidato, determCandidato).score;
          aceita = scoreCandidato >= scoreOriginal + EPSILON_ACEITE;
          observabilidade.registrarScore('score_original', scoreOriginal, { comentario: `Aula ${i + 1}` });
          observabilidade.registrarScore('score_candidato', scoreCandidato, { comentario: `Aula ${i + 1}` });
          console.log(`[melhorias] aula ${i + 1}: score original=${scoreOriginal} candidato=${scoreCandidato} aceita=${aceita}`);
        } catch (e) {
          console.error(`[melhorias] aula ${i + 1}: falha no julgamento de score:`, e.message);
          aceita = false; // não avaliada — mesma política de preservação do conteúdo anterior
        }
      }
      scoresPorAula.push({ aula: i + 1, titulo: aula.titulo, scoreOriginal, scoreCandidato, aceita, forcada: forcadaPorUser });

      if (!aceita) {
        const motivoScore = scoreOriginal === null
          ? 'não foi possível avaliar o score (falha técnica no julgamento) — conteúdo anterior preservado por segurança'
          : `score não melhorou (antes ${scoreOriginal.toFixed(2)} → depois ${scoreCandidato.toFixed(2)})`;
        send(res, { type: 'progress', message: `Aula ${i + 1}: melhorias descartadas — ${motivoScore}` });
        reportSections.push(`## Aula ${i + 1}: ${aula.titulo}\n\n_(Melhorias descartadas pelo gate de score — ${motivoScore}.)_`);
        metricasPorAula.push({ aulaIndex: i + 1, titulo: aula.titulo, similaridade: 1, rejeitadaPorScore: true });
        fullText += textoAntigo || '';
        novasPorAula.push({ ...aula });
        continue;
      }

      const similaridade = textSimilarity(textoAntigo || '', textoMesclado);
      metricasPorAula.push({ aulaIndex: i + 1, titulo: aula.titulo, similaridade });

      if (similaridade > 0.90) {
        send(res, { type: 'progress', message: `Aula ${i + 1}: conteúdo pouco alterado (${Math.round(similaridade * 100)}% similar ao original) — verifique se as observações foram aplicadas` });
      }

      const melhoriasMatch = texto.match(/###\s*Melhorias Aplicadas[\s\S]*/i);
      const melhoriasSection = melhoriasMatch ? melhoriasMatch[0].trim() : '_(seção não gerada)_';
      const secoesTocadas = [];
      if (substituidas.length) secoesTocadas.push(`Seções revisadas: ${substituidas.join(', ')}`);
      if (novas.length) secoesTocadas.push(`Seções novas: ${novas.join(', ')}`);
      reportSections.push(
        `## Aula ${i + 1}: ${aula.titulo}\n\n` +
        (secoesTocadas.length ? secoesTocadas.join('\n') + '\n\n' : '') +
        melhoriasSection
      );

      fullText += textoMesclado;
      novasPorAula.push({ ...aula, texto: textoMesclado });

      const numero = String(i + 1).padStart(2, '0');
      await persistStage(sess, `aula${numero}_conteudo`, `Conteúdo — Aula ${i + 1}: ${aula.titulo}`, textoMesclado);
    }

    sess.conteudoPorAula = novasPorAula;
    sess.conteudo = fullText;

    // ── Fase de realinhamento: sincroniza o plano de aula com o conteúdo ─────
    // melhorado (somente aulas efetivamente alteradas). Ementa e plano de
    // ensino NUNCA são alterados — extrapolações viram alertas no relatório.
    // Falha aqui não desfaz as melhorias já persistidas acima.
    let planoAulaAtualizado = null;
    const realinhamentoLog = [];
    try {
      let fontePlano = 'ia';
      try {
        const p = JSON.parse(fs.readFileSync(path.join(courseScrDir(sess), 'projeto.json'), 'utf-8'));
        fontePlano = p.stages?.['plano_de_aula']?.fonte || 'ia';
      } catch { /* sem projeto.json — trata como ia */ }

      // Elegibilidade depende exclusivamente de mudança real de conteúdo
      // detectada (similaridade <= 0.90) — ter melhorias pendentes na lista
      // NÃO basta. Uma versão anterior incluía aulas sem mudança de conteúdo
      // só por terem melhorias pendentes (pensando em melhorias só-do-plano),
      // mas isso fazia o plano ser realinhado mesmo quando toda melhoria de
      // conteúdo foi rejeitada (truncamento, gate de score, rede de segurança
      // de duplicação) — sem mudança real de conteúdo, o plano deve permanecer
      // intocado para aquela aula.
      const alteradas = metricasPorAula.filter(m => m.similaridade <= 0.90);
      const planoAulaBase = sess.planoAula || readMemory(sess, 'plano_de_aula');

      if (fontePlano === 'usuario') {
        realinhamentoLog.push('Plano de aula é versão do usuário — realinhamento automático pulado. Regenere o plano manualmente se quiser absorver as melhorias.');
        send(res, { type: 'progress', message: 'Plano de aula do usuário — realinhamento automático pulado' });
      } else if (!alteradas.length) {
        realinhamentoLog.push('Nenhuma aula com alteração de conteúdo ou melhorias pendentes de plano — plano de aula mantido.');
      } else if (!planoAulaBase) {
        realinhamentoLog.push('Plano de aula não encontrado (sessão e disco) — realinhamento pulado.');
      } else {
        let planoAula = planoAulaBase;
        const ementaRef = truncate(sess.ementa || readMemory(sess, 'ementa'), 1200);
        const planoEnsinoRef = truncate(sess.planoEnsino || readMemory(sess, 'plano_de_ensino'), 1200);
        const alertasEscopo = [];

        for (const m of alteradas) {
          const i = m.aulaIndex - 1;
          const aula = novasPorAula[i];
          if (!aula) continue;
          await new Promise(r => setTimeout(r, PAUSA_ENTRE_AULAS_MS));
          send(res, { type: 'progress', message: `Realinhando plano da aula ${i + 1} de ${novasPorAula.length}: ${aula.titulo}` });
          try {
            const planoAulaTrechoAtual = extractLessonBlock(planoAula, i);
            const skill = skills.realinharPlanoAulaSkill({
              nome: sess.config.nome, duracao: sess.config.duracao,
              nivel: sess.config.nivel, publico: sess.config.publico,
              aula, index: i, total: novasPorAula.length,
              planoAulaTrechoAtual,
              conteudoMelhorado: truncate(aula.texto, 3000),
              ementa: ementaRef, planoEnsinoResumo: planoEnsinoRef,
              melhorias: observacoes[i]?.melhorias,
              metodologia: getMetodologia(sess), bnccContext
            });
            const completion = await chamarOpenAI('chat', {
              model: skill.model,
              messages: [
                { role: 'system', content: skill.system },
                { role: 'user', content: skill.user }
              ]
            });
            addUsage(completion.usage, sess);
            const bruto = completion.choices[0]?.message?.content?.trim() || '';
            if (!bruto) {
              realinhamentoLog.push(`Aula ${i + 1} (${aula.titulo}): resposta vazia — seção do plano mantida.`);
              continue;
            }
            const { secao, alertas } = extractScopeAlerts(bruto);
            alertas.forEach(a => alertasEscopo.push(`Aula ${i + 1} (${aula.titulo}): ${a}`));
            // Remove heading redundante caso o modelo o tenha incluído
            const corpo = secao.replace(/^#\s*Aula\s+\d+:[^\n]*\n+/i, '');
            const planoAntigoSemHeading = planoAulaTrechoAtual.replace(/^#\s*Aula\s+\d+:[^\n]*\n+/i, '');
            const similaridadePlano = textSimilarity(planoAntigoSemHeading, corpo);
            if (similaridadePlano >= LIMIAR_SECAO_SUSPEITA) {
              inconsistenciasVerificacao.push(
                `Aula ${i + 1} (${aula.titulo}) — seção do PLANO DE AULA: realinhada, mas ${Math.round(similaridadePlano * 100)}% similar à anterior — possivelmente sem mudança real.`
              );
            }
            planoAula = replaceLessonBlock(planoAula, i, corpo);
            realinhamentoLog.push(`Aula ${i + 1} (${aula.titulo}): seção do plano realinhada.`);
          } catch (e) {
            console.error(`Erro ao realinhar plano da aula ${i + 1}:`, e.message);
            realinhamentoLog.push(`Aula ${i + 1} (${aula.titulo}): falha no realinhamento (${e.message}) — seção mantida.`);
          }
        }

        sess.planoAula = planoAula;
        planoAulaAtualizado = planoAula;
        await persistStage(sess, 'plano_de_aula', 'Plano de Aula', planoAula);
        if (alertasEscopo.length) {
          realinhamentoLog.push('**Alertas de escopo — ementa/plano de ensino NÃO foram alterados; avalie manualmente:**');
          alertasEscopo.forEach(a => realinhamentoLog.push(`- ${a}`));
        }
        send(res, { type: 'progress', message: 'Plano de aula realinhado com o conteúdo melhorado' });
      }
    } catch (e) {
      console.error('Erro na fase de realinhamento:', e.message);
      realinhamentoLog.push(`Falha geral no realinhamento: ${e.message} — melhorias já aplicadas foram preservadas.`);
    }
    if (realinhamentoLog.length) {
      reportSections.push(
        `## Realinhamento de Planos\n\n` +
        realinhamentoLog.map(l => (l.startsWith('-') || l.startsWith('**')) ? l : `- ${l}`).join('\n')
      );
    }

    // Checagem de termo-chave — roda uma única vez, com conteúdo e plano já
    // finalizados: um termo pedido numa melhoria pode legitimamente ter sido
    // endereçado em qualquer um dos dois documentos.
    const planoFinalParaChecagem = planoAulaAtualizado || sess.planoAula || readMemory(sess, 'plano_de_aula') || '';
    observacoes.forEach((obs, idx) => {
      const conteudoFinal = novasPorAula[idx]?.texto || '';
      (obs?.melhorias || []).forEach((melhoria, n) => {
        const termosVistos = new Set();
        extrairTermosEsperados(melhoria).forEach(termo => {
          const chave = normalizeTitulo(termo);
          if (!chave || termosVistos.has(chave)) return;
          termosVistos.add(chave);
          if (termoAusente(termo, conteudoFinal, planoFinalParaChecagem)) {
            inconsistenciasVerificacao.push(
              `Aula ${idx + 1} (${obs.titulo}) — melhoria ${n + 1} ("${melhoria}"): termo esperado ausente: "${termo}" (não encontrado no conteúdo nem no plano de aula).`
            );
          }
        });
      });
    });
    if (inconsistenciasVerificacao.length) {
      reportSections.push(
        `## Verificação Automática — Possíveis Inconsistências\n\n` +
        `_Checagem mecânica e independente da autoavaliação do modelo acima — não bloqueia a persistência, é só um sinal para revisão humana._\n\n` +
        inconsistenciasVerificacao.map(l => `- ${l}`).join('\n')
      );
    }

    // Gravar meta.json com métricas do ciclo
    if (cicloDir && metricasPorAula.length > 0) {
      try {
        const simMedia = metricasPorAula.reduce((s, m) => s + m.similaridade, 0) / metricasPorAula.length;
        fs.writeFileSync(path.join(cicloDir, 'meta.json'), JSON.stringify({
          ciclo: Number(numeroCiclo),
          dataHora: new Date().toISOString(),
          totalAulas: aulas.length,
          totalComObservacoes: observacoes.filter(o => o.observacoes?.length > 0).length,
          similaridadeMedia: Math.round(simMedia * 100) / 100,
          similaridadePorAula: metricasPorAula,
          scoresPorAula
        }, null, 2), 'utf-8');
      } catch (e) { console.error('Erro ao gravar meta.json:', e.message); }
    }

    // Histórico de scores (gate/convergência) — só considera aulas com score
    // válido nos dois lados (exclui não avaliadas por falha técnica e aulas
    // aceitas por força do marcador [user], que não têm score computado).
    const avaliadas = scoresPorAula.filter(s => s.scoreOriginal !== null && s.scoreCandidato !== null);
    if (avaliadas.length) {
      const ganhoMedio = Math.round(
        (avaliadas.reduce((s, a) => s + (a.scoreCandidato - a.scoreOriginal), 0) / avaliadas.length) * 100
      ) / 100;
      persistScoreHistorico(sess, {
        ciclo: Number(numeroCiclo),
        dataHora: new Date().toISOString(),
        porAula: scoresPorAula,
        ganhoMedio
      });
    }
    if (scoresPorAula.length) {
      reportSections.push(
        `## Scores do Ciclo\n\n` +
        scoresPorAula.map(s => {
          if (s.forcada) return `- Aula ${s.aula} (${s.titulo}): aceita (forçada por [user])`;
          if (s.scoreOriginal === null) return `- Aula ${s.aula} (${s.titulo}): não avaliada (falha técnica no julgamento)`;
          return `- Aula ${s.aula} (${s.titulo}): ${s.scoreOriginal.toFixed(2)} → ${s.scoreCandidato.toFixed(2)} — ${s.aceita ? '✅ aceita' : '❌ rejeitada'}`;
        }).join('\n')
      );
    }

    try {
      const now = new Date();
      const ts = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('') + '_' + [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
      ].join('');
      const auditSection = buildAuditSection(metricasPorAula);
      const reportText = reportSections.join('\n\n---\n\n') + auditSection;
      const reportDoc = buildDocx(sess.config, 'Relatório de Melhorias Aplicadas', reportText, []);
      const reportBuffer = await Packer.toBuffer(reportDoc);
      fs.writeFileSync(path.join(courseRootDir(sess), `melhorias_aplicadas_${ts}.docx`), reportBuffer);
    } catch (e) { console.error('Erro ao gerar relatório timestampado:', e.message); }

    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText, ...(planoAulaAtualizado ? { planoAula: planoAulaAtualizado } : {}) });
  } catch (err) {
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao aplicar melhorias' });
  } finally {
    res.end();
  }
});

// ── POST /api/finalizar-conteudo — Etapa 6 (gera documento final) ────────────
app.post('/api/finalizar-conteudo', async (req, res) => {
  const sess = getSession(req, res);

  const conteudo = sess.conteudo || readMemory(sess, 'conteudo');
  if (!conteudo) {
    return res.status(400).json({ error: 'Sem conteúdo para finalizar. Conclua a Etapa 5.' });
  }

  try {
    sess.conteudoFinal = conteudo;
    const nomeSlug = (sess.config.nome || 'curso').replace(/\s+/g, '_');
    const filename = `${nomeSlug}_conteudo_final.docx`;
    const scrDir = courseScrDir(sess);
    const rootDir = courseRootDir(sess);

    fs.writeFileSync(path.join(scrDir, 'conteudo_final.txt'), conteudo, 'utf-8');
    const doc = buildDocx(sess.config, 'Conteúdo Final do Curso', conteudo, []);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(rootDir, 'conteudo_final.docx'), buffer);
    saveProject(sess, { baseName: 'conteudo_final', fonte: 'ia' });

    // Sempre retorna JSON com o caminho salvo — o arquivo já está em disco
    // (em pastaProjeto se configurado, ou em saídas/{slug}/).
    res.json({ ok: true, saved: true, path: path.join(rootDir, 'conteudo_final.docx') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Dev seed (apenas fora de produção) ──────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/dev/seed', (req, res) => {
    const sess = getSession(req, res);

    const comBncc = req.query.bncc === 'true';
    const publico = req.query.publico || 'adultos'; // 'adultos' | 'basica'

    sess.config = {
      nome: 'Python para Iniciantes',
      publico: 'Estudantes sem experiência em programação',
      carga: 4,
      duracao: 60,
      nivel: 'básico',
      objetivos: 'Compreender lógica de programação, variáveis, funções e manipulação de listas em Python.',
      modalidade: 'presencial',
      preRequisitos: 'Nenhum pré-requisito técnico necessário.',
      proporcaoTeoricoPratico: '40% teoria / 60% prática'
    };

    sess.metodologia = comBncc
      ? 'Aprendizagem Baseada em Projetos (ABP) com integração de competências digitais da BNCC. Cada módulo culmina em um mini-projeto aplicado, estimulando pensamento computacional e resolução de problemas reais.'
      : 'Metodologia ativa com demonstração ao vivo e coding junto (live coding). O instrutor programa ao vivo enquanto os alunos reproduzem, favorecendo aprendizado por imitação e correção imediata de erros.';

    if (comBncc) {
      if (publico === 'basica') {
        sess.bncc = {
          ativo: true,
          publico: 'basica',
          nivel: 'ef2',
          itens: [
            { id: 'ef2-co5a06', codigo: 'EF06CO05', descricao: 'Identificar as etapas para a resolução de um problema, fazendo analogia ao princípio de funcionamento de um algoritmo.' },
            { id: 'ef2-co5a07', codigo: 'EF07CO04', descricao: 'Criar e testar algoritmos para resolução de problemas com estruturas de repetição e decisão.' },
            { id: 'ef2-co5a09', codigo: 'EF09CO03', descricao: 'Produzir soluções computacionais para problemas do cotidiano, usando linguagem de programação em bloco ou textual.' }
          ]
        };
      } else {
        sess.bncc = {
          ativo: true,
          publico: 'adultos',
          nivel: 'competencias',
          itens: [
            { id: 'cg2', titulo: 'Competência 2 — Pensamento Científico, Crítico e Criativo', descricao: 'Exercitar a curiosidade intelectual e recorrer à ciência, à tecnologia para investigar causas, elaborar e testar hipóteses.' },
            { id: 'cg5', titulo: 'Competência 5 — Cultura Digital', descricao: 'Compreender, utilizar e criar tecnologias digitais de informação e comunicação de forma crítica, significativa e ética.' }
          ]
        };
      }
    } else {
      sess.bncc = { ativo: false, publico: null, nivel: null, itens: [] };
    }

    sess.ementa = `**Python para Iniciantes** é um curso introdutório de 4 horas voltado a estudantes sem experiência em programação.
O curso aborda desde a instalação do ambiente até a criação de pequenos scripts com funções e listas, desenvolvendo raciocínio lógico e familiaridade com a sintaxe Python de forma gradual e prática.`;

    sess.pesquisa = `## Pesquisa de Mercado — Python para Iniciantes

Python é consistentemente listado como a linguagem mais popular para iniciantes (Stack Overflow Developer Survey 2024).
Certificações relevantes: PCEP (Python Certified Entry-Level Programmer) — Python Institute.
Ferramentas do ecossistema: VS Code, Jupyter Notebook, Google Colab (sem instalação local).
Tendência: cursos com foco em projetos mínimos (mini-projetos) têm maior taxa de conclusão.

**Fontes:** python.org, tiobe.com, stackoverflow.com/survey/2024`;

    sess.planoEnsino = `## Plano de Ensino — Python para Iniciantes

**Módulo 1 – Fundamentos**
Carga: 2h | Ambientação com Python, variáveis e tipos de dados.

**Módulo 2 – Estruturas de Dados**
Carga: 2h | Listas, iteração e funções.

**Metodologia:** Aulas expositivas com exemplos ao vivo e exercícios práticos no Jupyter Notebook.
**Avaliação:** Mini-projeto final (calculadora simples em Python).
**Bibliografia:** "Automate the Boring Stuff with Python" — Al Sweigart (gratuito online).`;

    sess.planoAula = `## Planos de Aula

### Aula 1 — Introdução ao Python e Ambiente
**Duração:** 60 min | **Módulo:** Módulo 1 – Fundamentos
- 0–10 min: Apresentação e motivação
- 10–30 min: Instalação do VS Code e primeira linha de código
- 30–50 min: Variáveis e tipos (int, str, float)
- 50–60 min: Exercício: calcular área de um retângulo

### Aula 2 — Condicionais e Entrada do Usuário
**Duração:** 60 min | **Módulo:** Módulo 1 – Fundamentos
- 0–10 min: Revisão da aula anterior
- 10–35 min: if/elif/else com exemplos
- 35–55 min: input() e conversão de tipos
- 55–60 min: Exercício: verificador de idade

### Aula 3 — Listas e Laços
**Duração:** 60 min | **Módulo:** Módulo 2 – Estruturas de Dados
- 0–10 min: O que é uma lista?
- 10–35 min: for, while, range()
- 35–55 min: Métodos de lista: append, remove, sort
- 55–60 min: Exercício: calcular média de notas

### Aula 4 — Funções e Mini-Projeto
**Duração:** 60 min | **Módulo:** Módulo 2 – Estruturas de Dados
- 0–10 min: O que são funções e por que usá-las?
- 10–35 min: def, parâmetros, return
- 35–60 min: Mini-projeto: calculadora com menu interativo`;

    sess.aulas = [
      { titulo: 'Introdução ao Python e Ambiente', modulo: 'Módulo 1 – Fundamentos', objetivos: 'Instalar o ambiente; escrever o primeiro script; trabalhar com variáveis e tipos básicos' },
      { titulo: 'Condicionais e Entrada do Usuário', modulo: 'Módulo 1 – Fundamentos', objetivos: 'Usar if/elif/else; capturar entrada do usuário com input(); converter tipos de dados' },
      { titulo: 'Listas e Laços', modulo: 'Módulo 2 – Estruturas de Dados', objetivos: 'Criar e manipular listas; usar for e while; aplicar métodos append, remove e sort' },
      { titulo: 'Funções e Mini-Projeto', modulo: 'Módulo 2 – Estruturas de Dados', objetivos: 'Definir funções com def/return; organizar código; construir uma calculadora interativa' }
    ];

    const aulaTextos = [
      `# Aula 1 — Introdução ao Python e Ambiente

## Por que Python?
Python é uma das linguagens mais populares do mundo (TIOBE Index 2024). Sua sintaxe é próxima do inglês simples, o que reduz a carga cognitiva para iniciantes.

## Instalação
1. Acesse python.org/downloads e baixe a versão mais recente.
2. Durante a instalação no Windows, marque **"Add Python to PATH"**.
3. Instale o VS Code (code.visualstudio.com) e a extensão Python.

## Variáveis e Tipos
\`\`\`python
nome = "Ana"          # str
idade = 22            # int
altura = 1.68         # float
ativo = True          # bool
\`\`\`

Python é dinamicamente tipado: o tipo é inferido automaticamente.

## Exercício
Calcule a área de um retângulo lido do usuário:
\`\`\`python
base = float(input("Base: "))
altura = float(input("Altura: "))
print("Área:", base * altura)
\`\`\``,

      `# Aula 2 — Condicionais e Entrada do Usuário

## Estrutura if/elif/else
Permite executar blocos de código condicionalmente.

\`\`\`python
nota = float(input("Digite sua nota: "))
if nota >= 7:
    print("Aprovado")
elif nota >= 5:
    print("Recuperação")
else:
    print("Reprovado")
\`\`\`

## Função input()
Sempre retorna uma string — use int() ou float() para converter.

\`\`\`python
ano = int(input("Ano de nascimento: "))
idade = 2024 - ano
print(f"Você tem {idade} anos.")
\`\`\`

## Exercício
Verificador de categoria de IMC com if/elif/else.`,

      `# Aula 3 — Listas e Laços

## Listas
Coleção ordenada e mutável de valores.

\`\`\`python
notas = [8.5, 7.0, 9.2, 6.8]
notas.append(7.5)   # adiciona ao final
notas.sort()         # ordena
\`\`\`

## Laço for
\`\`\`python
for nota in notas:
    print(nota)
\`\`\`

## range()
\`\`\`python
for i in range(5):   # 0, 1, 2, 3, 4
    print(i)
\`\`\`

## Exercício
Calcule a média de uma lista de notas digitadas pelo usuário.`,

      `# Aula 4 — Funções e Mini-Projeto

## Definindo Funções
\`\`\`python
def saudacao(nome):
    return f"Olá, {nome}!"

print(saudacao("Maria"))
\`\`\`

## Parâmetros e Retorno
Funções podem receber múltiplos parâmetros e retornar qualquer valor.

\`\`\`python
def media(valores):
    return sum(valores) / len(valores)
\`\`\`

## Mini-Projeto: Calculadora
\`\`\`python
def soma(a, b): return a + b
def subtracao(a, b): return a - b

opcao = input("Operação (s/m): ")
a, b = float(input("a: ")), float(input("b: "))
if opcao == "s":
    print(soma(a, b))
else:
    print(subtracao(a, b))
\`\`\``
    ];

    sess.conteudoPorAula = sess.aulas.map((aula, i) => ({
      titulo: aula.titulo,
      modulo: aula.modulo,
      objetivos: aula.objetivos,
      texto: aulaTextos[i]
    }));

    sess.conteudo = aulaTextos.join('\n\n---\n\n');

    // Persiste projeto.json para que o seed seja detectável por GET /api/projetos
    ['ementa','pesquisa','plano_de_ensino','plano_de_aula'].forEach((baseName, i) => {
      const conteudos = [sess.ementa, sess.pesquisa, sess.planoEnsino, sess.planoAula];
      try {
        const scrDir = courseScrDir(sess);
        fs.writeFileSync(path.join(scrDir, `${baseName}.txt`), conteudos[i] || '', 'utf-8');
      } catch {}
      saveProject(sess, { baseName, fonte: 'ia' });
    });

    res.json({
      ok: true,
      message: `Sessão populada com curso "Python para Iniciantes" (4 aulas). BNCC: ${comBncc ? `ativo (${sess.bncc.nivel})` : 'desativado'}. Acesse http://localhost:3000 e vá para a Etapa 5★, Agente de Qualidade ou PPC.`,
      config: { nome: sess.config.nome },
      bncc: sess.bncc.ativo ? { nivel: sess.bncc.nivel, itens: sess.bncc.itens.length } : 'desativado',
      metodologia: getMetodologia(sess).substring(0, 60) + '...',
      aulas: sess.aulas.map(a => a.titulo)
    });
  });
}

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  const avisoModelo = validarModeloPesquisa();
  if (avisoModelo) console.warn(`[pesquisa] ${avisoModelo}`);
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.slugify = slugify;
module.exports.clientAbort = clientAbort;
module.exports.combineSignals = combineSignals;
module.exports.streamSkillToClient = streamSkillToClient;
module.exports.detectStage = detectStage;
module.exports.requireApiKey = requireApiKey;
module.exports.preencherTemplateRoteiro = preencherTemplateRoteiro;
module.exports.extrairBlocoVozAvatar = extrairBlocoVozAvatar;
module.exports.preencherBlocoVozNoRoteiro = preencherBlocoVozNoRoteiro;
module.exports.buildPedagogicalContext = buildPedagogicalContext;
module.exports.replaceLessonBlock = replaceLessonBlock;
module.exports.extractLessonBlock = extractLessonBlock;
module.exports.extractScopeAlerts = extractScopeAlerts;
module.exports.extractResumoMelhorias = extractResumoMelhorias;
module.exports.parseMelhoriasEstruturadas = parseMelhoriasEstruturadas;
module.exports.isRespostaMelhoriasCompleta = isRespostaMelhoriasCompleta;
module.exports.acumulaTokenUsage = acumulaTokenUsage;
module.exports.mergeSecoesConteudo = mergeSecoesConteudo;
module.exports.parseSecoesFixas = parseSecoesFixas;
module.exports.removerEcoTitulo = removerEcoTitulo;
module.exports.buildDocx = buildDocx;
module.exports.limparUrlFonte = limparUrlFonte;
module.exports.obs = observabilidade;
module.exports.validarModeloPesquisa = validarModeloPesquisa;
module.exports.lerPesquisaMeta = lerPesquisaMeta;
module.exports.avaliarFontesPesquisa = avaliarFontesPesquisa;
module.exports.Packer = Packer;
module.exports.textSimilarity = textSimilarity;
module.exports.extrairTermosEsperados = extrairTermosEsperados;
module.exports.termoAusente = termoAusente;
module.exports.LIMIAR_SECAO_SUSPEITA = LIMIAR_SECAO_SUSPEITA;
module.exports.computeScoreDeterministico = computeScoreDeterministico;
module.exports.computeScoreComposto = computeScoreComposto;
module.exports.parseRubricaCriterios = parseRubricaCriterios;
module.exports.buildFocoSugerido = buildFocoSugerido;
module.exports.PESOS_RUBRICA = PESOS_RUBRICA;
module.exports.EPSILON_ACEITE = EPSILON_ACEITE;
module.exports.EPSILON_CONVERGENCIA = EPSILON_CONVERGENCIA;
module.exports.readScoreHistorico = readScoreHistorico;
module.exports.persistScoreHistorico = persistScoreHistorico;
