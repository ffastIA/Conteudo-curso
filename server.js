require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const https = require('https');
const multer = require('multer');
const mammoth = require('mammoth');
const skills = require('./skills');
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
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(cookieParser());
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
      conteudoFinal: '',
      // Agente de qualidade e PPC
      relatorioQualidade: '',
      // Pastas
      pastaSaida: null
    };
    res.cookie('sessionId', id, { httpOnly: true });
  }
  return sessions[id];
}

// Monta bloco de contexto pedagógico para injetar nos prompts das skills.
// Retorna string vazia se nem BNCC nem metodologia estiverem definidos.
function buildPedagogicalContext(sess) {
  const parts = [];
  if (sess.metodologia) {
    parts.push(`## Metodologia Pedagógica\n${sess.metodologia}`);
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
  const regex = /^# Aula (\d+):.*$/gm;
  const matches = [...fullText.matchAll(regex)];
  if (!matches.length) return truncate(fullText, 1500);
  const target = matches[index];
  if (!target) return truncate(fullText, 1500);
  const start = target.index;
  const end = (index + 1 < matches.length) ? matches[index + 1].index : fullText.length;
  return fullText.slice(start, end).trim();
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

// ── Diretório "saídas" — memória persistente entre etapas ──────────────────
const SAIDAS_ROOT = path.join(__dirname, 'saídas');

function slugify(s) {
  return (s || 'curso')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'curso';
}

function courseDir(sess) {
  const dir = path.join(SAIDAS_ROOT, slugify(sess.config?.nome));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Lê a "memória" (texto puro) de uma etapa já persistida, se existir.
function readMemory(sess, baseName) {
  try {
    return fs.readFileSync(path.join(courseDir(sess), `${baseName}.txt`), 'utf-8');
  } catch {
    return '';
  }
}

// Persiste o resultado de uma etapa em disco: um .txt (memória, lido pelas
// próximas etapas) e um .docx (entregável formatado, igual ao da exportação).
async function persistStage(sess, baseName, label, content, sites = []) {
  const dir = courseDir(sess);
  try {
    fs.writeFileSync(path.join(dir, `${baseName}.txt`), content, 'utf-8');
    const doc = buildDocx(sess.config, label, content, sites);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(dir, `${baseName}.docx`), buffer);
  } catch (err) {
    console.error(`Erro ao persistir "${baseName}" em saídas:`, err.message);
  }
}

// ── SSE helper ──────────────────────────────────────────────────────────────
function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function send(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// ── Contador global de tokens utilizados (todas as etapas/sessões) ─────────
const tokenUsage = { prompt: 0, completion: 0, total: 0 };

function addUsage(usage) {
  if (!usage) return;
  tokenUsage.prompt += usage.prompt_tokens || 0;
  tokenUsage.completion += usage.completion_tokens || 0;
  tokenUsage.total += usage.total_tokens || 0;
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
  const { nome, publico, carga, nivel, proporcaoTeoricoPratico } = sess.config;
  try {
    const skill = skills.metodologiaSkill({ nome, publico, carga, nivel, proporcaoTeoricoPratico });
    const completion = await openai.chat.completions.create({
      model: skill.model,
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    });
    addUsage(completion.usage);
    sess.metodologia = completion.choices[0]?.message?.content?.trim() || '';
    res.json({ ok: true, metodologia: sess.metodologia });
  } catch (err) {
    console.error('Erro ao gerar metodologia:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/qualidade (SSE) ─────────────────────────────────────────────────
app.get('/api/qualidade', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.conteudo && !sess.conteudoPorAula?.length) {
    return res.status(400).json({ error: 'Conclua ao menos a Etapa 5 antes de gerar o relatório de qualidade.' });
  }
  sseHeaders(res);
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
    metodologia: sess.metodologia,
    bncc: sess.bncc
  });

  try {
    send(res, { type: 'progress', message: 'Analisando coerência pedagógica...' });
    const stream = await openai.chat.completions.create({
      model: skill.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    });

    let fullText = '';
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        fullText += text;
        send(res, { type: 'token', text });
      }
      if (chunk.usage) addUsage(chunk.usage);
    }

    sess.relatorioQualidade = fullText;
    await persistStage(sess, 'relatorio_qualidade', 'Relatório Técnico-Pedagógico', fullText);
    send(res, { type: 'progress', message: 'Relatório concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
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
    return res.status(400).json({ error: 'Conclua a Etapa 5 antes de gerar o PPC.' });
  }
  sseHeaders(res);
  send(res, { type: 'progress', message: 'Gerando PPC — Perfil do Egresso...' });

  const pedagCtx = buildPedagogicalContext(sess);

  try {
    const perfilEgressoSkill = skills.perfilEgressoSkill({ config: sess.config, ementa: sess.ementa, planoEnsino: sess.planoEnsino });
    const perfilEgressoResp = await openai.chat.completions.create({ model: perfilEgressoSkill.model, messages: [{ role: 'system', content: perfilEgressoSkill.system }, { role: 'user', content: perfilEgressoSkill.user }] });
    addUsage(perfilEgressoResp.usage);
    const perfilEgresso = perfilEgressoResp.choices[0]?.message?.content?.trim() || '';
    send(res, { type: 'progress', message: 'Gerando PPC — Competências e Habilidades...' });

    const competenciasSkill = skills.competenciasSkill({ config: sess.config, ementa: sess.ementa, planoEnsino: sess.planoEnsino, bncc: sess.bncc });
    const competenciasResp = await openai.chat.completions.create({ model: competenciasSkill.model, messages: [{ role: 'system', content: competenciasSkill.system }, { role: 'user', content: competenciasSkill.user }] });
    addUsage(competenciasResp.usage);
    const competencias = competenciasResp.choices[0]?.message?.content?.trim() || '';
    send(res, { type: 'progress', message: 'Gerando PPC — Perfil Docente...' });

    const perfilDocenteSkill = skills.perfilDocenteSkill({ config: sess.config, ementa: sess.ementa });
    const perfilDocenteResp = await openai.chat.completions.create({ model: perfilDocenteSkill.model, messages: [{ role: 'system', content: perfilDocenteSkill.system }, { role: 'user', content: perfilDocenteSkill.user }] });
    addUsage(perfilDocenteResp.usage);
    const perfilDocente = perfilDocenteResp.choices[0]?.message?.content?.trim() || '';
    send(res, { type: 'progress', message: 'Gerando PPC — Infraestrutura...' });

    const infraestruturaSkill = skills.infraestruturaSkill({ config: sess.config, conteudo: truncate(sess.conteudo, 3000) });
    const infraestruturaResp = await openai.chat.completions.create({ model: infraestruturaSkill.model, messages: [{ role: 'system', content: infraestruturaSkill.system }, { role: 'user', content: infraestruturaSkill.user }] });
    addUsage(infraestruturaResp.usage);
    const infraestrutura = infraestruturaResp.choices[0]?.message?.content?.trim() || '';
    send(res, { type: 'progress', message: 'Montando documento PPC...' });

    const assemblySkill = skills.ppcAssemblySkill({
      config: sess.config, ementa: sess.ementa, pesquisa: truncate(sess.pesquisa, 1500),
      planoEnsino: truncate(sess.planoEnsino, 2000), planoAula: truncate(sess.planoAula, 1500),
      metodologia: sess.metodologia, bncc: sess.bncc,
      perfilEgresso, competencias, perfilDocente, infraestrutura
    });

    const stream = await openai.chat.completions.create({
      model: assemblySkill.model, stream: true, stream_options: { include_usage: true },
      messages: [{ role: 'system', content: assemblySkill.system }, { role: 'user', content: assemblySkill.user }]
    });

    let fullText = '';
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) { fullText += text; send(res, { type: 'token', text }); }
      if (chunk.usage) addUsage(chunk.usage);
    }

    await persistStage(sess, 'ppc_completo', 'Projeto Pedagógico de Curso', fullText);
    send(res, { type: 'progress', message: 'PPC concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar PPC' });
  } finally {
    res.end();
  }
});

// ── POST /api/config ────────────────────────────────────────────────────────
app.post('/api/config', async (req, res) => {
  const sess = getSession(req, res);
  const { nome, publico, carga, duracao, nivel, objetivos, modalidade, preRequisitos, proporcaoTeoricoPratico } = req.body;
  if (!modalidade) return res.status(400).json({ error: 'O campo modalidade é obrigatório.' });
  if (!proporcaoTeoricoPratico) return res.status(400).json({ error: 'O campo proporção teórico/prático é obrigatório.' });
  sess.config = req.body;

  // Gera automaticamente a "ementa" — primeiro arquivo da memória persistente
  // em saídas/, usado como âncora de coerência por todas as etapas seguintes.
  try {
    const pedagCtx = buildPedagogicalContext(sess);
    const skill = skills.ementaSkill({ nome, publico, carga, duracao, nivel, objetivos, metodologia: sess.metodologia, bnccContext: sess.bncc?.ativo ? sess.bncc.itens.map(i => `${i.codigo ? `[${i.codigo}] ` : ''}${i.descricao}`).join('; ') : '' });
    const completion = await openai.chat.completions.create({
      model: skill.model,
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    });
    addUsage(completion.usage);
    sess.ementa = completion.choices[0]?.message?.content?.trim() || '';
    if (sess.ementa) await persistStage(sess, 'ementa', 'Ementa do Curso', sess.ementa);
  } catch (err) {
    console.error('Erro ao gerar ementa automática:', err.message);
  }

  res.json({ ok: true, ementa: sess.ementa });
});

// ── GET /api/search (SSE) ───────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const sess = getSession(req, res);
  sseHeaders(res);
  const { topicos = '', limite = 3 } = req.query;
  const { nome, nivel, publico } = sess.config;

  send(res, { type: 'progress', message: 'Iniciando pesquisa...' });

  // Skill de pesquisa na internet — usa o modelo com capacidade de busca web
  // (gpt-4o-search-preview) e referencia a ementa já gerada para manter o foco.
  const skill = skills.pesquisaWebSkill({ nome, nivel, publico, topicos, ementa: sess.ementa, metodologia: sess.metodologia, bnccContext: buildPedagogicalContext(sess) });

  try {
    send(res, { type: 'progress', message: 'Buscando na web...' });

    const completion = await openai.chat.completions.create({
      model: skill.model,
      web_search_options: skill.web_search_options,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    });

    addUsage(completion.usage);

    const message = completion.choices[0]?.message || {};
    const fullText = message.content || '';

    const seenUrls = new Set();
    const sitesCollected = [];
    for (const ann of message.annotations || []) {
      if (ann.type === 'url_citation' && ann.url_citation?.url && !seenUrls.has(ann.url_citation.url)) {
        seenUrls.add(ann.url_citation.url);
      }
    }

    if (seenUrls.size) {
      send(res, { type: 'progress', message: 'Lendo fontes...' });
      for (const ann of message.annotations || []) {
        if (ann.type === 'url_citation' && ann.url_citation?.url) {
          const { url, title } = ann.url_citation;
          if (seenUrls.has(url)) {
            seenUrls.delete(url);
            const site = { url, title: title || url };
            sitesCollected.push(site);
            send(res, { type: 'site', ...site });
          }
        }
      }
    }

    // Simula streaming progressivo do texto para manter a UX em tempo real
    const CHUNK_SIZE = 24;
    for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
      send(res, { type: 'token', text: fullText.slice(i, i + CHUNK_SIZE) });
      await new Promise(r => setTimeout(r, 15));
    }

    send(res, { type: 'progress', message: 'Sintetizando...' });
    sess.pesquisa = fullText;
    await persistStage(sess, 'pesquisa', 'Pesquisa Web', fullText, sitesCollected);
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro na pesquisa' });
  } finally {
    res.end();
  }
});

// ── GET /api/plano-ensino (SSE) ─────────────────────────────────────────────
app.get('/api/plano-ensino', async (req, res) => {
  const sess = getSession(req, res);
  sseHeaders(res);
  const { ajustes = '' } = req.query;
  const { nome, publico, carga, duracao, nivel, objetivos } = sess.config;

  send(res, { type: 'progress', message: 'Preparando plano de ensino...' });

  // Consulta a memória persistente (ementa + pesquisa) para manter coerência.
  const ementa = sess.ementa || readMemory(sess, 'ementa');
  const pesquisa = sess.pesquisa || readMemory(sess, 'pesquisa');

  const skill = skills.planoEnsinoSkill({
    nome, publico, carga, duracao, nivel, objetivos, ementa, pesquisa, ajustes,
    metodologia: sess.metodologia, bnccContext: buildPedagogicalContext(sess),
    proporcaoTeoricoPratico: sess.config.proporcaoTeoricoPratico
  });

  try {
    const stream = await openai.chat.completions.create({
      model: skill.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    });

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
      if (chunk.usage) addUsage(chunk.usage);
    }

    sess.planoEnsino = fullText;
    await persistStage(sess, 'plano_de_ensino', 'Plano de Ensino', fullText);
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
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
  const { observacoes = '' } = req.query;
  const { nome, duracao, nivel, publico } = sess.config;

  send(res, { type: 'progress', message: 'Planejando as aulas do curso...' });

  // Consulta a memória persistente para fundamentar o plano de aula.
  const ementa = sess.ementa || readMemory(sess, 'ementa');
  const planoEnsino = sess.planoEnsino || readMemory(sess, 'plano_de_ensino');

  try {
    const aulas = await planLessons(sess, planoEnsino);
    sess.aulas = aulas;
    send(res, {
      type: 'progress',
      message: `${aulas.length} aula(s) identificada(s). Gerando plano de cada uma...`
    });

    let fullText = '';

    for (let i = 0; i < aulas.length; i++) {
      const aula = aulas[i];
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
        nome, duracao, nivel, publico, aula, index: i, total: aulas.length,
        ementa, planoEnsino, lessonSummaries, observacoes,
        metodologia: sess.metodologia, bnccContext: buildPedagogicalContext(sess),
        proporcaoTeoricoPratico: sess.config.proporcaoTeoricoPratico
      });

      const stream = await openai.chat.completions.create({
        model: skill.model,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: skill.system },
          { role: 'user', content: skill.user }
        ]
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          fullText += text;
          send(res, { type: 'token', text });
        }
        if (chunk.usage) addUsage(chunk.usage);
      }
    }

    sess.planoAula = fullText;
    await persistStage(sess, 'plano_de_aula', 'Plano de Aula', fullText);
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
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
async function planLessons(sess, planoEnsinoOverride) {
  const { nome, carga, duracao, nivel, publico } = sess.config;
  const totalMinutos = Number(carga) * 60;
  const numAulas = Math.max(1, Math.round(totalMinutos / Number(duracao)));

  const planoEnsino = planoEnsinoOverride || sess.planoEnsino || readMemory(sess, 'plano_de_ensino');

  const skill = skills.planLessonsSkill({ nome, carga, duracao, nivel, publico, planoEnsino, numAulas });

  const completion = await openai.chat.completions.create({
    model: skill.model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: skill.system },
      { role: 'user', content: skill.user }
    ]
  });

  addUsage(completion.usage);

  let parsed = {};
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
  } catch {
    parsed = {};
  }
  const aulas = Array.isArray(parsed.aulas) ? parsed.aulas : [];
  return aulas.length ? aulas : [{ titulo: nome, objetivos: 'Cobrir o conteúdo geral do curso' }];
}

// Executa uma chamada em streaming para uma skill de conteúdo e devolve o texto
// completo gerado, repassando os tokens via SSE para o cliente.
// Se a skill usa web_search_options, simula streaming por chunks (sem SSE nativo).
async function streamSkillToClient(res, skill) {
  if (skill.web_search_options) {
    const completion = await openai.chat.completions.create({
      model: skill.model,
      web_search_options: skill.web_search_options,
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    });
    addUsage(completion.usage);
    const text = completion.choices[0]?.message?.content?.trim() || '';
    const CHUNK = 60;
    for (let c = 0; c < text.length; c += CHUNK) {
      send(res, { type: 'token', text: text.slice(c, c + CHUNK) });
      await new Promise(r => setTimeout(r, 8));
    }
    return text;
  }
  const stream = await openai.chat.completions.create({
    model: skill.model,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      { role: 'system', content: skill.system },
      { role: 'user', content: skill.user }
    ]
  });
  let text = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      text += delta;
      send(res, { type: 'token', text: delta });
    }
    if (chunk.usage) addUsage(chunk.usage);
  }
  return text;
}

// ── GET /api/conteudo (SSE) ─────────────────────────────────────────────────
// Gera, para cada aula, um arquivo de conteúdo independente (Ajustes 1, 3 e 4
// de alinhamento e consciência sequencial) e persiste em saídas/<curso>/aulaNN_conteudo.docx.
app.get('/api/conteudo', async (req, res) => {
  const sess = getSession(req, res);
  sseHeaders(res);
  const { nome, nivel, publico, duracao } = sess.config;

  send(res, { type: 'progress', message: 'Analisando os objetivos das aulas do curso...' });

  // Memória persistente consultada para fundamentar o conteúdo.
  const ementa = sess.ementa || readMemory(sess, 'ementa');
  const planoEnsino = sess.planoEnsino || readMemory(sess, 'plano_de_ensino');
  const planoAula = sess.planoAula || readMemory(sess, 'plano_de_aula');

  try {
    const aulas = (sess.aulas && sess.aulas.length) ? sess.aulas : await planLessons(sess, planoEnsino);
    sess.aulas = aulas;
    send(res, {
      type: 'progress',
      message: `${aulas.length} aula(s) identificada(s). Gerando conteúdo técnico de cada uma...`
    });

    let fullText = '';
    const conteudoPorAula = []; // { titulo, modulo, objetivos, texto }

    for (let i = 0; i < aulas.length; i++) {
      const aula = aulas[i];
      const titulo = aula.titulo || `Aula ${i + 1}`;
      const numero = String(i + 1).padStart(2, '0');

      send(res, {
        type: 'progress',
        message: `Gerando aula ${i + 1} de ${aulas.length}: ${titulo}`
      });

      const heading = `${i === 0 ? '' : '\n\n'}# Aula ${i + 1}: ${titulo}\n\n`;
      send(res, { type: 'token', text: heading });

      // Ajuste 1 — referência ao trecho ESPECÍFICO desta aula no plano de aula
      // (nunca o início genérico do texto integral).
      const planoAulaTrecho = extractLessonBlock(planoAula, i);
      // Ajuste 3 — mapa enxuto (título + objetivos) das demais aulas.
      const lessonSummaries = skills.summarizeLessons(aulas, { excludeIndex: i });

      const baseSkill = skills.conteudoSkill({
        nome, duracao, nivel, publico, aula, index: i, total: aulas.length,
        ementa, planoAulaTrecho, lessonSummaries,
        metodologia: sess.metodologia, bnccContext: buildPedagogicalContext(sess),
        proporcaoTeoricoPratico: sess.config.proporcaoTeoricoPratico
      });

      const texto = await streamSkillToClient(res, baseSkill);

      fullText += heading + texto;
      conteudoPorAula.push({ titulo, modulo: aula.modulo || '', objetivos: aula.objetivos || '', texto });

      // Persiste o conteúdo desta aula como arquivo independente.
      await persistStage(sess, `aula${numero}_conteudo`, `Conteúdo — Aula ${i + 1}: ${titulo}`, texto);
    }

    sess.conteudo = fullText;
    sess.conteudoPorAula = conteudoPorAula;
    await persistStage(sess, 'conteudo', 'Conteúdo de Todas as Aulas (consolidado)', fullText);

    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar conteúdo' });
  } finally {
    res.end();
  }
});

// ── GET /api/tokens — contador global de tokens utilizados ─────────────────
app.get('/api/tokens', (req, res) => {
  res.json(tokenUsage);
});

// ── POST /api/pasta-saida — define a pasta de saída dos arquivos editáveis ──
app.post('/api/pasta-saida', (req, res) => {
  const sess = getSession(req, res);
  const pasta = (req.body?.pasta || '').trim();

  if (!pasta) {
    sess.pastaSaida = null;
    return res.json({ ok: true, path: null });
  }

  let stat;
  try {
    stat = fs.statSync(pasta);
  } catch {
    return res.status(400).json({ error: 'Pasta não encontrada. Verifique se o caminho está correto.' });
  }
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'O caminho informado não é uma pasta.' });
  }

  sess.pastaSaida = pasta;
  res.json({ ok: true, path: pasta });
});

// ── POST /api/export/:step ──────────────────────────────────────────────────
app.post('/api/export/:step', async (req, res) => {
  const sess = getSession(req, res);
  const { step } = req.params;
  const { sites = [] } = req.body;

  const stepLabels = {
    pesquisa: 'Pesquisa Web',
    'plano-ensino': 'Plano de Ensino',
    'plano-aula': 'Plano de Aula',
    conteudo: 'Conteúdo da Aula',
    'revisao-qualidade': 'Revisão de Qualidade',
    qualidade: 'Relatório Técnico-Pedagógico',
    ppc: 'Projeto Pedagógico de Curso'
  };

  const textMap = {
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

    if (sess.pastaSaida) {
      const fullPath = path.join(sess.pastaSaida, filename);
      fs.writeFileSync(fullPath, buffer);
      return res.json({ ok: true, saved: true, path: fullPath });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── DOCX builder ────────────────────────────────────────────────────────────
function buildDocx(config, stepLabel, content, sites = []) {
  const now = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

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
      children: [new TextRun({ text: `Gerado em: ${now}`, color: '666666', size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 }
    }),
    new Paragraph({ text: '', pageBreakBefore: true })
  );

  // Converte markdown simples em parágrafos docx
  const lines = content.split('\n');
  for (const line of lines) {
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
  if (!sess.conteudoPorAula?.length) {
    return res.status(400).json({ error: 'Conclua a Etapa 5 antes de gerar a revisão de qualidade.' });
  }
  sseHeaders(res);
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

  try {
    for (let i = 0; i < aulas.length; i++) {
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
        metodologia: sess.metodologia,
        bnccContext
      });

      const texto = await streamSkillToClient(res, skill);
      fullText += texto;
    }

    sess.revisaoQualidade = fullText;
    await persistStage(sess, 'revisao_qualidade', 'Revisão de Qualidade', fullText);
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar revisão de qualidade' });
  } finally {
    res.end();
  }
});

// ── POST /api/aplicar-melhorias — Etapa 6 (upload do .docx anotado) ──────────
// Extrai texto do .docx, identifica "Observações do Revisor" por aula e retorna
// resumo para confirmação antes de aplicar qualquer alteração.
app.post('/api/aplicar-melhorias', upload.single('arquivo'), async (req, res) => {
  const sess = getSession(req, res);

  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo .docx inválido ou não enviado.' });
  }
  if (!req.file.originalname.toLowerCase().endsWith('.docx')) {
    return res.status(400).json({ error: 'O arquivo deve ter extensão .docx.' });
  }

  try {
    const { value: textoExtraido } = await mammoth.extractRawText({ buffer: req.file.buffer });

    const aulas = sess.conteudoPorAula || [];
    const observacoesPorAula = aulas.map((aula, i) => {
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

      return { titulo: aula.titulo, observacoes };
    });

    sess.observacoesMelhorias = observacoesPorAula;
    const comObservacoes = observacoesPorAula.filter(o => o.observacoes.length > 0);
    res.json({ ok: true, aulas: observacoesPorAula, totalComObservacoes: comObservacoes.length });
  } catch (err) {
    console.error('Erro ao processar .docx:', err.message);
    res.status(500).json({ error: 'Erro ao processar o arquivo .docx: ' + err.message });
  }
});

// ── GET /api/aplicar-melhorias/confirmar (SSE) — Etapa 6 ─────────────────────
// Aplica as melhorias por aula usando gpt-4o-search-preview com acesso à web.
app.get('/api/aplicar-melhorias/confirmar', async (req, res) => {
  const sess = getSession(req, res);

  if (!sess.conteudoPorAula?.length) {
    return res.status(400).json({ error: 'Sem conteúdo para melhorar. Conclua a Etapa 5.' });
  }

  sseHeaders(res);
  send(res, { type: 'progress', message: 'Iniciando aplicação de melhorias...' });

  const observacoes = sess.observacoesMelhorias ||
    sess.conteudoPorAula.map(a => ({ titulo: a.titulo, observacoes: '' }));
  const aulas = sess.conteudoPorAula;
  const novasPorAula = [];
  let fullText = '';
  const bnccContext = buildPedagogicalContext(sess);

  try {
    for (let i = 0; i < aulas.length; i++) {
      const aula = aulas[i];
      const obs = observacoes[i]?.observacoes || '';

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
        metodologia: sess.metodologia,
        bnccContext
      });

      const texto = await streamSkillToClient(res, skill);
      fullText += texto;
      novasPorAula.push({ ...aula, texto });

      const numero = String(i + 1).padStart(2, '0');
      await persistStage(sess, `aula${numero}_conteudo`, `Conteúdo — Aula ${i + 1}: ${aula.titulo}`, texto);
    }

    sess.conteudoPorAula = novasPorAula;
    sess.conteudo = fullText;
    await persistStage(sess, 'conteudo', 'Conteúdo de Todas as Aulas (consolidado)', fullText);

    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText });
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
    const dir = courseDir(sess);

    fs.writeFileSync(path.join(dir, 'conteudo_final.txt'), conteudo, 'utf-8');
    const doc = buildDocx(sess.config, 'Conteúdo Final do Curso', conteudo, []);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(dir, 'conteudo_final.docx'), buffer);

    if (sess.pastaSaida) {
      const fullPath = path.join(sess.pastaSaida, filename);
      fs.writeFileSync(fullPath, buffer);
      return res.json({ ok: true, saved: true, path: fullPath });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Dev seed (apenas fora de produção) ──────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/dev/seed', (req, res) => {
    const sess = getSession(req, res);

    sess.config = {
      nome: 'Python para Iniciantes',
      publico: 'Estudantes sem experiência em programação',
      carga: 4,
      duracao: 60,
      nivel: 'básico',
      objetivos: 'Compreender lógica de programação, variáveis, funções e manipulação de listas em Python.'
    };

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

    res.json({
      ok: true,
      message: 'Sessão populada com curso "Python para Iniciantes" (4 aulas). Acesse http://localhost:3000 e vá para a Etapa 5★.',
      aulas: sess.aulas.map(a => a.titulo)
    });
  });
}

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
