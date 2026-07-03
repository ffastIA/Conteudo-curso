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
const bnccData = require('./bncc-data');
console.log(`[BNCC] Carregado: ${bnccData.competenciasGerais.length} competências, ` +
  `${bnccData.habilidades.ef1.length} EF1, ${bnccData.habilidades.ef2.length} EF2, ` +
  `${bnccData.habilidades.em.length} EM`);
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, PageNumber, Header, Footer, Table,
  TableRow, TableCell, WidthType, BorderStyle, NumberFormat
} = require('docx');
const PptxGenJS = require('pptxgenjs');

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 6 });
const upload = multer({ storage: multer.memoryStorage() });

const SEARCH_TIMEOUT_MS = 45_000;
const SEARCH_RETRY_TIMEOUT_MS = 30_000;
const STALL_TIMEOUT_MS = 45_000;
const CONTEUDO_SEARCH_TIMEOUT_MS = 90_000;

function isRetriable(err) {
  if (err instanceof OpenAI.AuthenticationError) return false;
  if (err instanceof OpenAI.BadRequestError) return false;
  return true;
}

function makeAbortSignal(ms) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ac = new AbortController();
  setTimeout(() => ac.abort(), ms);
  return ac.signal;
}

async function tentarPesquisaWeb(skill, timeoutMs) {
  return openai.chat.completions.create(
    {
      model: skill.model,
      web_search_options: skill.web_search_options,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    },
    { signal: makeAbortSignal(timeoutMs) }
  );
}

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
      // Inputs do usuário por etapa (Etapas 2–4)
      inputs: {}
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

// Abre o diálogo nativo de seleção de pasta do Windows a partir do processo do
// servidor (necessário porque navegadores não expõem caminhos absolutos de
// pastas ao JavaScript da página). Só faz sentido para uso local, com servidor
// e navegador na mesma máquina — ver capability native-folder-picker.
function escolherPastaWindows() {
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

      $result = $f.ShowDialog($owner)
      $owner.Close()

      if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $f.SelectedPath
      }
    `;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', script],
      { timeout: 120_000 },
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
  projeto.ultimaModificacao = new Date().toISOString();
  if (!projeto.stages) projeto.stages = {};
  if (stageInfo?.baseName) {
    projeto.stages[stageInfo.baseName] = {
      fonte: stageInfo.fonte || 'ia',
      geradoEm: new Date().toISOString()
    };
  }
  try {
    fs.writeFileSync(projetoPath, JSON.stringify(projeto, null, 2), 'utf-8');
  } catch (err) {
    console.error('[saveProject] Erro ao gravar projeto.json:', err.message);
  }
}

// Persiste o resultado de uma etapa em disco: um .txt em /scr (memória, lido pelas
// próximas etapas) e um .docx na raiz (entregável formatado, igual ao da exportação).
async function persistStage(sess, baseName, label, content, sites = []) {
  try {
    const scrDir = courseScrDir(sess);
    const rootDir = courseRootDir(sess);
    fs.writeFileSync(path.join(scrDir, `${baseName}.txt`), content, 'utf-8');
    const doc = buildDocx(sess.config, label, content, sites);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(rootDir, `${baseName}.docx`), buffer);
    saveProject(sess, { baseName, fonte: 'ia' });
  } catch (err) {
    console.error(`Erro ao persistir "${baseName}":`, err.message);
  }
}

// Persiste um plano de slides como .pptx na raiz do projeto (Etapa 8). Ao
// contrário de persistStage, não grava nenhum .txt em /scr — slides não são
// lidos de volta como "memória" por nenhuma etapa posterior.
async function persistPptxStage(sess, baseName, aula, slidePlan) {
  const rootDir = courseRootDir(sess);
  const pptx = buildPptx(sess.config, aula, slidePlan, new Date());
  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  const fullPath = path.join(rootDir, `${baseName}.pptx`);
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
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// ── Contador global de tokens utilizados (todas as etapas/sessões) ─────────
// "images" conta chamadas à API de imagens (Etapa 8) à parte — essa API não
// expõe prompt/completion tokens no mesmo formato da chat completions, então
// não faz sentido forçar esse mapeamento; só a contagem de chamadas bem-sucedidas.
const tokenUsage = { prompt: 0, completion: 0, total: 0, images: 0 };

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

// ── POST /api/metodologia/confirmar — torna a metodologia definitiva ───────
// Ponto de confirmação explícito: gera a ementa pendente (se houver) usando a
// metodologia final (gerada por IA ou reimportada editada) e persiste a
// metodologia em disco, seguindo o mesmo padrão das demais etapas.
app.post('/api/metodologia/confirmar', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.metodologia) return res.status(400).json({ error: 'Gere a metodologia antes de confirmar.' });

  try {
    if (sess._precisaGerarEmenta) {
      const { nome, publico, carga, duracao, nivel, objetivos } = sess.config;
      const skill = skills.ementaSkill({
        nome, publico, carga, duracao, nivel, objetivos,
        metodologia: sess.metodologia,
        bnccContext: sess.bncc?.ativo ? sess.bncc.itens.map(i => `${i.codigo ? `[${i.codigo}] ` : ''}${i.descricao}`).join('; ') : ''
      });
      const completion = await openai.chat.completions.create({
        model: skill.model,
        messages: [
          { role: 'system', content: skill.system },
          { role: 'user', content: skill.user }
        ]
      });
      addUsage(completion.usage);
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

// ── GET /api/estilos-visuais — menu de estilos para a Etapa 8 ───────────────
// Mesmo padrão de GET /api/bncc: gera opções para o usuário escolher antes de
// prosseguir. Não-streaming — resposta rápida, SSE seria over-engineering aqui.
app.get('/api/estilos-visuais', async (req, res) => {
  const sess = getSession(req, res);
  const { nome, publico, nivel, objetivos, modalidade } = sess.config;
  try {
    const skill = skills.estiloVisualSkill({ nome, publico, nivel, objetivos, modalidade });
    const completion = await openai.chat.completions.create({
      model: skill.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    });
    addUsage(completion.usage);
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

// ── GET /api/slides (SSE) — Etapa 8, opcional e independente ───────────────
// Reorganiza o conteúdo JÁ gerado de cada aula em slides — não gera conteúdo
// pedagógico novo, apenas estrutura/resume o que já existe.
app.get('/api/slides', async (req, res) => {
  const sess = getSession(req, res);
  restoreConteudoPorAula(sess);
  if (!sess.conteudo && !sess.conteudoPorAula?.length) {
    return res.status(400).json({ error: 'Conclua a Etapa 5 antes de gerar os slides.' });
  }
  if (!sess.estiloVisual) {
    return res.status(400).json({ error: 'Escolha um estilo visual antes de gerar os slides.' });
  }
  sseHeaders(res);

  try {
    const aulas = sess.conteudoPorAula;
    const arquivos = [];

    for (let i = 0; i < aulas.length; i++) {
      const aula = aulas[i];
      const numero = String(i + 1).padStart(2, '0');
      send(res, {
        type: 'progress',
        message: `Gerando slides da aula ${i + 1} de ${aulas.length}: ${aula.titulo}`
      });

      const skill = skills.slidesSkill({ nomeCurso: sess.config.nome, aula });
      const completion = await openai.chat.completions.create({
        model: skill.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: skill.system },
          { role: 'user', content: skill.user }
        ]
      });
      addUsage(completion.usage);

      let slidePlan = { slides: [] };
      try {
        slidePlan = JSON.parse(completion.choices[0]?.message?.content || '{}');
      } catch {
        slidePlan = { slides: [] };
      }

      // Falha isolada por imagem não interrompe a aula nem o curso — o slide
      // correspondente cai no layout sem imagem (buildPptx).
      const slidesComImagem = (slidePlan.slides || []).filter(s => s?.imagem?.promptCena);
      for (let j = 0; j < slidesComImagem.length; j++) {
        const slide = slidesComImagem[j];
        send(res, {
          type: 'progress',
          message: `Gerando imagem ${j + 1} de ${slidesComImagem.length} da aula ${i + 1}...`
        });
        try {
          if (j > 0) await new Promise(r => setTimeout(r, 2000));
          slide._imageData = await gerarImagemSlide(slide.imagem.promptCena, sess.estiloVisual.housePrompt);
          if (slide._imageData) tokenUsage.images += 1;
        } catch (imgErr) {
          console.error(`[slides] Falha ao gerar imagem da aula ${i + 1}:`, imgErr.message);
          send(res, {
            type: 'progress',
            message: `Aviso: não foi possível gerar uma imagem da aula ${i + 1}, o slide seguirá sem ilustração.`
          });
        }
      }

      const baseName = `aula${numero}_slides`;
      const fullPath = await persistPptxStage(sess, baseName, aula, slidePlan);
      arquivos.push({ baseName, titulo: aula.titulo, path: fullPath });

      if (i < aulas.length - 1) await new Promise(r => setTimeout(r, 4000));
    }

    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', arquivos });
  } catch (err) {
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar slides' });
  } finally {
    res.end();
  }
});

// ── GET /api/escolher-pasta — abre o seletor nativo de pasta do Windows ─────
app.get('/api/escolher-pasta', async (req, res) => {
  try {
    const pasta = await escolherPastaWindows();
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
app.get('/api/search', async (req, res) => {
  const sess = getSession(req, res);
  sseHeaders(res);
  const { topicos = '', limite = 3 } = req.query;
  sess.inputs.topicos = topicos;
  sess.inputs.limite = Number(limite);
  const { nome, nivel, publico } = sess.config;

  send(res, { type: 'progress', message: 'Iniciando pesquisa...' });

  // Skill de pesquisa na internet — usa o modelo com capacidade de busca web
  // (gpt-4o-search-preview) e referencia a ementa já gerada para manter o foco.
  const skill = skills.pesquisaWebSkill({ nome, nivel, publico, topicos, ementa: sess.ementa, metodologia: sess.metodologia, bnccContext: buildPedagogicalContext(sess) });

  try {
    send(res, { type: 'progress', message: 'Buscando na web...' });

    let completion = null;
    let usedFallback = false;

    // Tentativa 1 com timeout completo
    try {
      completion = await tentarPesquisaWeb(skill, SEARCH_TIMEOUT_MS);
    } catch (err1) {
      if (!isRetriable(err1)) throw err1;
      // Retry com timeout reduzido
      send(res, { type: 'progress', message: 'Reconectando...' });
      try {
        completion = await tentarPesquisaWeb(skill, SEARCH_RETRY_TIMEOUT_MS);
      } catch (err2) {
        if (!isRetriable(err2)) throw err2;
        // Fallback sem web search
        usedFallback = true;
        send(res, { type: 'progress', message: '⚠️ Pesquisa web indisponível — gerando a partir do conhecimento do modelo...' });
        const fbSkill = skills.pesquisaFallbackSkill({ nome, nivel, publico, topicos, ementa: sess.ementa, metodologia: sess.metodologia, bnccContext: buildPedagogicalContext(sess) });
        completion = await openai.chat.completions.create({
          model: fbSkill.model,
          max_tokens: 2000,
          messages: [
            { role: 'system', content: fbSkill.system },
            { role: 'user', content: fbSkill.user }
          ]
        });
      }
    }

    addUsage(completion.usage);

    const message = completion.choices[0]?.message || {};
    const fullText = message.content || '';

    const sitesCollected = [];
    if (!usedFallback) {
      const seenUrls = new Set();
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
  sess.inputs.ajustesEnsino = ajustes;
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
  sess.inputs.observacoesAula = observacoes;
  const { nome, duracao, nivel, publico } = sess.config;

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
async function planLessons(sess, planoEnsinoOverride, onProgress = () => {}) {
  const { nome, carga, duracao, nivel, publico } = sess.config;
  const totalMinutos = Number(carga) * 60;
  const numAulas = Math.max(1, Math.round(totalMinutos / Number(duracao)));

  const planoEnsino = planoEnsinoOverride || sess.planoEnsino || readMemory(sess, 'plano_de_ensino');

  const chamarSkill = async (correcao) => {
    const skill = skills.planLessonsSkill({ nome, carga, duracao, nivel, publico, planoEnsino, numAulas, correcao });
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
// Se a skill usa web_search_options, simula streaming por chunks (sem SSE nativo).
async function streamSkillToClient(res, skill) {
  if (skill.web_search_options) {
    const completion = await openai.chat.completions.create(
      {
        model: skill.model,
        web_search_options: skill.web_search_options,
        max_tokens: 16000,
        messages: [
          { role: 'system', content: skill.system },
          { role: 'user', content: skill.user }
        ]
      },
      { signal: makeAbortSignal(CONTEUDO_SEARCH_TIMEOUT_MS) }
    );
    addUsage(completion.usage);
    const finishReason = completion.choices[0]?.finish_reason;
    const text = completion.choices[0]?.message?.content?.trim() || '';
    if (finishReason === 'length') {
      console.warn(`[web-search] resposta truncada (${text.length} chars, finish_reason=length)`);
      send(res, { type: 'warning', text: 'Resposta truncada pelo limite de tokens. O conteúdo gerado pode estar incompleto — revise o arquivo gerado.' });
    }
    const CHUNK = 60;
    for (let c = 0; c < text.length; c += CHUNK) {
      send(res, { type: 'token', text: text.slice(c, c + CHUNK) });
      await new Promise(r => setTimeout(r, 8));
    }
    return text;
  }
  // Timeout de inatividade: aborta a chamada se nenhum delta chegar por
  // STALL_TIMEOUT_MS, sem limitar a duração total de uma geração legítima
  // que continua recebendo dados normalmente.
  const controller = new AbortController();
  let stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
  const resetStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
  };

  const stream = await openai.chat.completions.create({
    model: skill.model,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
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
      if (chunk.usage) addUsage(chunk.usage);
    }
  } finally {
    clearTimeout(stallTimer);
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
    const aulas = (sess.aulas && sess.aulas.length) ? sess.aulas : await planLessons(sess, planoEnsino, msg => send(res, { type: 'progress', message: msg }));
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

      if (i > 0) await new Promise(r => setTimeout(r, 4000));

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

      let texto;
      try {
        texto = await streamSkillToClient(res, baseSkill);
      } catch (err) {
        if (err instanceof OpenAI.APIUserAbortError) {
          send(res, { type: 'error', message: `Tempo limite excedido ao gerar a aula ${i + 1}: ${titulo}. Tente novamente.` });
          err.alreadyReported = true;
        }
        throw err;
      }

      fullText += heading + texto;
      conteudoPorAula.push({ titulo, modulo: aula.modulo || '', objetivos: aula.objetivos || '', texto });

      // Persiste o conteúdo desta aula como arquivo independente.
      await persistStage(sess, `aula${numero}_conteudo`, `Conteúdo — Aula ${i + 1}: ${titulo}`, texto);
    }

    sess.conteudo = fullText;
    sess.conteudoPorAula = conteudoPorAula;

    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', fullText });
  } catch (err) {
    console.error(err);
    if (!err.alreadyReported) {
      send(res, { type: 'error', message: err.message || 'Erro ao gerar conteúdo' });
    }
  } finally {
    res.end();
  }
});

// ── GET /api/tokens — contador global de tokens utilizados ─────────────────
app.get('/api/tokens', (req, res) => {
  res.json(tokenUsage);
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
  if (fs.existsSync(projetoPath)) {
    try {
      const p = JSON.parse(fs.readFileSync(projetoPath, 'utf-8'));
      sess.config = p.config || {};
      sess.bncc = p.bncc || { ativo: false, publico: null, nivel: null, itens: [] };
      sess.metodologia = p.metodologia || '';
      sess.aulas = p.aulas || [];
      sess.inputs = p.inputs || {};
      sess.estiloVisual = p.estiloVisual || null;
      stages = p.stages || {};
    } catch {
      sess.config = {};
      return res.json({ ok: true, etapasCarregadas: [], camposFaltantes: ['config','bncc','metodologia','aulas'], aviso: 'projeto.json corrompido — campos estruturados não carregados' });
    }
  } else {
    // legado: sem projeto.json — infere config pelo nome da pasta
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

  res.json({ ok: true, etapasCarregadas, camposFaltantes, stages, arquivos, nome: sess.config?.nome, config: sess.config, metodologia: sess.metodologia, inputs: sess.inputs || {}, estiloVisual: sess.estiloVisual || null });
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
    metodologia: sess.metodologia,
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

// ── PPTX builder (Etapa 8 — Slides) ─────────────────────────────────────────
// Diferente de buildDocx, consome um slidePlan já estruturado em slides (não
// texto corrido), já que uma apresentação é organizada por slide desde o início.
function buildPptx(config, aula, slidePlan, geradoEm) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDESCREEN', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDESCREEN';

  const FONT = 'Calibri';
  const rodape = `${aula.titulo} · ${config.nome || 'Curso'} · ` +
    `${geradoEm.toLocaleDateString('pt-BR')} ${geradoEm.toLocaleTimeString('pt-BR')}`;

  // Slide de capa — identificação simples, não conta na faixa de 6-10 slides de conteúdo.
  const capa = pptx.addSlide();
  capa.addText(aula.titulo, {
    x: 0.6, y: 2.6, w: 12, h: 1.2, fontFace: FONT, fontSize: 36, bold: true, color: '4A3B8C'
  });
  capa.addText(config.nome || 'Curso', {
    x: 0.6, y: 3.8, w: 12, h: 0.6, fontFace: FONT, fontSize: 20, color: '555555'
  });

  const slides = Array.isArray(slidePlan?.slides) ? slidePlan.slides : [];
  for (const slide of slides) {
    const s = pptx.addSlide();
    s.addText(slide.titulo || '', {
      x: 0.6, y: 0.4, w: 12, h: 0.9, fontFace: FONT, fontSize: 32, bold: true, color: '4A3B8C'
    });
    const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
    const bulletsFormatted = bullets.map(b => ({ text: b, options: { bullet: true, breakLine: true } }));

    // Slide com imagem gerada com sucesso: bullets ficam numa coluna mais
    // estreita à esquerda, imagem numa caixa quadrada à direita. Slide sem
    // imagem (IA não indicou, ou a geração falhou) mantém o layout original
    // em largura total — nenhuma mudança visual para quem não ganha ilustração.
    if (slide.imagem && slide._imageData) {
      s.addText(bulletsFormatted, {
        x: 0.8, y: 1.6, w: 6.6, h: 5, fontFace: FONT, fontSize: 22, color: '222222', valign: 'top'
      });
      s.addImage({
        data: slide._imageData,
        x: 7.7, y: 1.6, w: 4.9, h: 4.9,
        sizing: { type: 'contain', w: 4.9, h: 4.9 },
        altText: slide.titulo || 'Ilustração'
      });
    } else {
      s.addText(bulletsFormatted, {
        x: 0.8, y: 1.6, w: 11.5, h: 5, fontFace: FONT, fontSize: 24, color: '222222', valign: 'top'
      });
    }

    s.addText(rodape, {
      x: 0.4, y: 7.05, w: 8, h: 0.35, fontFace: FONT, fontSize: 11, color: '888888', align: 'left'
    });
  }

  return pptx;
}

// Gera uma imagem para um slide via API de imagens da OpenAI, combinando a
// cena decidida pela IA (promptCena), o estilo escolhido pelo usuário
// (housePrompt) e as restrições técnicas de layout sempre aplicadas
// (IMAGE_LAYOUT_CONSTRAINTS). Retorna null em caso de falha — o slide cai no
// layout sem imagem em buildPptx, sem interromper a geração da aula/curso.
async function gerarImagemSlide(promptCena, housePrompt) {
  const response = await openai.images.generate(
    {
      model: skills.MODEL_IMAGE,
      prompt: `${promptCena}. ${housePrompt}. ${skills.IMAGE_LAYOUT_CONSTRAINTS}`,
      size: '1024x1024',
      quality: skills.IMAGE_QUALITY,
      n: 1
    },
    { signal: makeAbortSignal(90000) }
  );
  const b64 = response.data[0]?.b64_json;
  return b64 ? `image/png;base64,${b64}` : null;
}

// ── GET /api/revisao-qualidade (SSE) — Etapa 5★ ─────────────────────────────
// Analisa cada aula contra os documentos de referência, Jaccard como reporte
// informativo e gera relatório com espaço para observações do revisor humano.
app.get('/api/revisao-qualidade', async (req, res) => {
  const sess = getSession(req, res);
  restoreConteudoPorAula(sess);
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
  const notasPorAula = [];

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

      const notaMatch = texto.match(/Nota:\s*([01](?:\.\d+)?)/i);
      const nota = notaMatch ? Math.max(0, Math.min(1, parseFloat(notaMatch[1]))) : null;
      notasPorAula.push({ numero: i + 1, titulo: aula.titulo, nota });
    }

    notasPorAula.sort((a, b) => a.numero - b.numero);
    let resumoNotas = '\n\n<!--PAGEBREAK-->\n\n# Notas de Qualidade por Aula\n\n';
    for (const n of notasPorAula) {
      resumoNotas += `- Aula ${n.numero}: ${n.titulo} — Nota: ${n.nota !== null ? n.nota.toFixed(2) : 'N/A'}\n`;
    }
    send(res, { type: 'token', text: resumoNotas });
    fullText += resumoNotas;

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
    res.json({ ok: true, aulas: observacoesPorAula, totalComObservacoes: comObservacoes.length, ...avisoResposta });
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
// Aplica as melhorias por aula usando gpt-4o-search-preview com acesso à web.
app.get('/api/aplicar-melhorias/confirmar', async (req, res) => {
  const sess = getSession(req, res);

  restoreConteudoPorAula(sess);
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

  try {
    for (let i = 0; i < aulas.length; i++) {
      const aula = aulas[i];
      const obs = observacoes[i]?.observacoes || '';

      if (i > 0) await new Promise(r => setTimeout(r, 4000));

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

      const textoAntigo = aula.texto;
      const texto = await streamSkillToClient(res, skill);
      const similaridade = textSimilarity(textoAntigo || '', texto);
      metricasPorAula.push({ aulaIndex: i + 1, titulo: aula.titulo, similaridade });

      if (similaridade > 0.90) {
        send(res, { type: 'progress', message: `Aula ${i + 1}: conteúdo pouco alterado (${Math.round(similaridade * 100)}% similar ao original) — verifique se as observações foram aplicadas` });
      }

      const melhoriasMatch = texto.match(/###\s*Melhorias Aplicadas[\s\S]*/i);
      const melhoriasSection = melhoriasMatch ? melhoriasMatch[0].trim() : '_(seção não gerada)_';
      reportSections.push(`## Aula ${i + 1}: ${aula.titulo}\n\n${melhoriasSection}`);

      fullText += texto;
      novasPorAula.push({ ...aula, texto });

      const numero = String(i + 1).padStart(2, '0');
      await persistStage(sess, `aula${numero}_conteudo`, `Conteúdo — Aula ${i + 1}: ${aula.titulo}`, texto);
    }

    sess.conteudoPorAula = novasPorAula;
    sess.conteudo = fullText;

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
          similaridadePorAula: metricasPorAula
        }, null, 2), 'utf-8');
      } catch (e) { console.error('Erro ao gravar meta.json:', e.message); }
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
      metodologia: sess.metodologia.substring(0, 60) + '...',
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
