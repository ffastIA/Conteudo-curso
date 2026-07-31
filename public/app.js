// ── Estado global ────────────────────────────────────────────────────────────
const state = {
  currentStep: 0,
  doneSteps: new Set(),
  sites: [],
  bncc: { ativo: false, publico: null, nivel: null, itens: [] },
  estiloVisual: null,
  roteiroBlocos: null,
  roteiroIndex: 0,
  slidesIndex: 0,
  heygenConfig: null,
  videoAvatarIndex: 0,
  videoAvatarNumero: ''
};

// ── Contador global de tokens ────────────────────────────────────────────────
async function refreshTokenCounter() {
  try {
    const r = await fetch('/api/tokens');
    if (!r.ok) return;
    const data = await r.json();
    const sessao = (data.total || 0).toLocaleString('pt-BR');
    const projetoTotal = data.projeto?.total?.total;
    document.getElementById('tokenCount').textContent =
      projetoTotal ? `${sessao} · projeto: ${projetoTotal.toLocaleString('pt-BR')}` : sessao;
  } catch {
    // contador é apenas informativo — falha de rede não deve incomodar o usuário
  }
}
refreshTokenCounter();

// ── Navegação entre etapas ───────────────────────────────────────────────────
// Habilita botões de qualidade/PPC/slides/imagens assim que a Etapa 5 estiver
// concluída — chamada tanto de goStep() (navegação manual) quanto diretamente
// de markDone(5), para não depender do usuário navegar entre pills para que os
// botões reflitam o estado real da sessão (ex.: geração ao vivo concluída ou
// projeto recém-carregado).
function atualizarBotoesDependentesDaEtapa5() {
  if (!state.doneSteps.has(5)) return;
  document.getElementById('btnQualidade').disabled = false;
  document.getElementById('btnPpc').disabled = false;
  document.getElementById('btnSlides').disabled = false;
  document.getElementById('btnVideoAvatar').disabled = false;
}

// Habilita o botão de Roteiros (Etapa 9) assim que a Etapa 4 (Plano de Aula)
// estiver concluída — é dela que vem sess.aulas (título+objetivos por aula),
// único pré-requisito real da geração de roteiros.
function atualizarBotaoRoteiros() {
  if (!state.doneSteps.has(4)) return;
  document.getElementById('btnRoteiros').disabled = false;
}

function goStep(n) {
  state.currentStep = n;
  document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
  document.getElementById(`step${n}`).classList.add('active');

  document.querySelectorAll('.step-pill').forEach(pill => {
    const step = +pill.dataset.step;
    pill.classList.remove('active');
    if (step === n) pill.classList.add('active');
  });

  atualizarBotoesDependentesDaEtapa5();
  atualizarBotaoRoteiros();
}

document.getElementById('stepsNav').addEventListener('click', e => {
  const pill = e.target.closest('.step-pill');
  if (pill) goStep(+pill.dataset.step);
});

function markDone(step) {
  state.doneSteps.add(step);
  const pill = document.querySelector(`.step-pill[data-step="${step}"]`);
  if (pill) pill.classList.add('done');
  if (step === 5) atualizarBotoesDependentesDaEtapa5();
  if (step === 4) atualizarBotaoRoteiros();
}

// ── Log panel helpers ────────────────────────────────────────────────────────
function initLog(panelId) {
  const el = document.getElementById(panelId);
  el.innerHTML = '';
  el.classList.add('active');
  return el;
}

// Remove o spinner de qualquer linha "current" pendente, marcando-a como
// concluída — usada tanto ao adicionar uma nova linha de log quanto (via
// clearSpinner) quando o evento SSE "done" chega e a última mensagem de
// "progress" não foi reconhecida como a finalização (ex.: "Roteiro da aula
// 1 concluído" não é o literal "Concluído"), o que deixaria o spinner
// girando para sempre sem isso.
function clearSpinner(panel) {
  panel.querySelectorAll('.log-line.current').forEach(l => {
    l.classList.remove('current');
    const sp = l.querySelector('.spinner');
    if (sp) sp.remove();
    l.classList.add('done-line');
  });
}

function addLog(panel, msg, type = 'current') {
  clearSpinner(panel);

  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  if (type === 'current') {
    div.innerHTML = `<span class="spinner"></span>${escHtml(msg)}`;
  } else if (type === 'done-line') {
    div.innerHTML = `✔ ${escHtml(msg)}`;
  } else {
    div.innerHTML = escHtml(msg);
  }
  panel.appendChild(div);
  panel.scrollTop = panel.scrollHeight;
}

function finishLog(panel, msg = 'Concluído') {
  clearSpinner(panel);
  const div = document.createElement('div');
  div.className = 'log-line done-line';
  div.innerHTML = `✔ ${escHtml(msg)}`;
  panel.appendChild(div);
}

function errLog(panel, msg) {
  const div = document.createElement('div');
  div.className = 'log-line err';
  div.textContent = `✖ ${msg}`;
  panel.appendChild(div);
}

function warnLog(panel, msg) {
  const div = document.createElement('div');
  div.className = 'log-line warn';
  div.textContent = `⚠ ${msg}`;
  panel.appendChild(div);
  panel.scrollTop = panel.scrollHeight;
}

// ── Renderiza markdown básico ────────────────────────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/^<!--PAGEBREAK-->\n?/gm, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(?:<li>[^<]*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '\n\n')
    .replace(/\n/g, '<br>');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── SSE streaming genérico ───────────────────────────────────────────────────
function streamSSE(url, { logPanel, resultEl, onSite, onDone, onError }) {
  const resultArea = document.getElementById(resultEl);
  resultArea.innerHTML = '';
  resultArea.classList.add('active');

  let fullText = '';
  let rafHandle = null;

  // Agrupa (coalesce) qualquer quantidade de eventos 'token' chegados entre
  // frames em uma única atualização de DOM, evitando custo O(n²) ao
  // re-renderizar o texto acumulado inteiro a cada delta recebido do servidor.
  function scheduleRender() {
    if (rafHandle !== null) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      resultArea.innerHTML = renderMarkdown(fullText);
      resultArea.scrollTop = resultArea.scrollHeight;
    });
  }

  function cancelScheduledRender() {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }

  const es = new EventSource(url);

  es.onmessage = e => {
    const msg = JSON.parse(e.data);

    if (msg.type === 'progress') {
      if (msg.message === 'Concluído') {
        finishLog(logPanel, msg.message);
      } else {
        addLog(logPanel, msg.message);
      }
    } else if (msg.type === 'site' && onSite) {
      onSite(msg);
    } else if (msg.type === 'token') {
      fullText += msg.text;
      scheduleRender();
    } else if (msg.type === 'done') {
      cancelScheduledRender();
      clearSpinner(logPanel);
      fullText = msg.fullText;
      resultArea.innerHTML = renderMarkdown(fullText);
      resultArea.scrollTop = resultArea.scrollHeight;
      es.close();
      refreshTokenCounter();
      if (onDone) onDone(fullText, msg);
    } else if (msg.type === 'warning') {
      warnLog(logPanel, msg.text);
    } else if (msg.type === 'error') {
      cancelScheduledRender();
      errLog(logPanel, msg.message);
      es.close();
      refreshTokenCounter();
      if (onError) onError(msg.message);
    }
  };

  es.onerror = () => {
    cancelScheduledRender();
    errLog(logPanel, 'Erro de conexão com o servidor.');
    es.close();
    refreshTokenCounter();
    if (onError) onError('Erro de conexão');
  };

  return es;
}

// ── STEP 0 — Base Pedagógica ─────────────────────────────────────────────────

function showBnccSection(id) {
  ['bnccQ1','bnccQ2','bnccNivel','bnccItensContainer'].forEach(s => {
    document.getElementById(s).style.display = s === id ? 'block' : 'none';
  });
}

// Pergunta 1: alinhar à BNCC?
document.getElementById('btnBnccSim').addEventListener('click', () => {
  state.bncc.ativo = true;
  showBnccSection('bnccQ2');
});

document.getElementById('btnBnccNao').addEventListener('click', async () => {
  await fetch('/api/bncc/pular', { method: 'POST' });
  state.bncc = { ativo: false, publico: null, nivel: null, itens: [] };
  showBnccSection(null);
  markDone(0);
  goStep(1);
});

// Pergunta 2: Ed. Básica ou adultos?
document.getElementById('btnPublicoBasica').addEventListener('click', () => {
  state.bncc.publico = 'basica';
  showBnccSection('bnccNivel');
});

document.getElementById('btnPublicoAdulto').addEventListener('click', async () => {
  state.bncc.publico = 'adulto';
  state.bncc.nivel = 'competencias';
  document.getElementById('bnccItensTitle').textContent = 'Selecione as competências BNCC aplicáveis';
  await carregarItensKBNCC('competencias');
});

// Seletor de nível (EF1, EF2, EM)
document.querySelectorAll('.bncc-nivel-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.bncc-nivel-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.bncc.nivel = btn.dataset.nivel;
    const labelMap = { ef1: 'EF1 — Fundamental 1', ef2: 'EF2 — Fundamental 2', em: 'Ensino Médio' };
    document.getElementById('bnccItensTitle').textContent = `Habilidades BNCC — ${labelMap[btn.dataset.nivel]}`;
    await carregarItensKBNCC(btn.dataset.nivel);
  });
});

async function carregarItensKBNCC(nivelOuTipo) {
  const param = nivelOuTipo === 'competencias' ? 'tipo=competencias' : `nivel=${nivelOuTipo}`;
  try {
    const r = await fetch(`/api/bncc?${param}`);
    const data = await r.json();
    const lista = document.getElementById('bnccItensList');
    lista.innerHTML = '';
    (data.itens || []).forEach(item => {
      const label = document.createElement('label');
      label.className = 'bncc-item';
      label.innerHTML =
        `<input type="checkbox" value="${escHtml(item.id)}" data-descricao="${escHtml(item.descricao)}" ` +
        `data-codigo="${escHtml(item.codigo || item.id)}">` +
        `<span><strong>${escHtml(item.codigo || item.titulo || item.id)}</strong> — ${escHtml(item.descricao)}</span>`;
      lista.appendChild(label);
    });
    showBnccSection('bnccItensContainer');
  } catch (err) {
    alert('Erro ao carregar dados BNCC: ' + err.message);
  }
}

// Confirmar seleção BNCC
document.getElementById('btnConfirmarBncc').addEventListener('click', async () => {
  const checks = document.querySelectorAll('#bnccItensList input[type=checkbox]:checked');
  if (!checks.length) {
    alert('Selecione ao menos um item antes de confirmar.');
    return;
  }
  const itens = Array.from(checks).map(c => ({ id: c.value, codigo: c.dataset.codigo, descricao: c.dataset.descricao }));
  state.bncc.itens = itens;

  try {
    await fetch('/api/bncc/selecionar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publico: state.bncc.publico, nivel: state.bncc.nivel, itens })
    });
    showBnccSection(null);
    markDone(0);
    goStep(1);
  } catch (err) {
    alert('Erro ao salvar seleção BNCC: ' + err.message);
  }
});

document.getElementById('btnPularEtapa0').addEventListener('click', async () => {
  await fetch('/api/bncc/pular', { method: 'POST' });
  goStep(1);
});

// ── STEP 1 — Config ──────────────────────────────────────────────────────────
// Campos condicionais por modalidade: distribuição híbrida (só híbrido) e
// carga síncrona por aula (só EaD).
function atualizarCamposModalidade() {
  const m = document.getElementById('modalidade').value;
  document.getElementById('grupoDistribuicaoHibrida').style.display = m === 'híbrido' ? '' : 'none';
  document.getElementById('grupoCargaSincrona').style.display = m === 'EaD' ? '' : 'none';
}
document.getElementById('modalidade').addEventListener('change', atualizarCamposModalidade);

// Salva a configuração e encadeia a geração da metodologia — não navega para a
// Etapa 2 ainda; isso só acontece na confirmação (btnSalvarMetodologia).
async function salvarConfigEGerarMetodologia(triggerBtn) {
  const config = {
    nome: document.getElementById('nome').value.trim(),
    publico: document.getElementById('publico').value.trim(),
    carga: document.getElementById('carga').value,
    duracao: document.getElementById('duracao').value,
    nivel: document.getElementById('nivel').value,
    objetivos: document.getElementById('objetivos').value.trim(),
    modalidade: document.getElementById('modalidade').value,
    // Campos condicionais por modalidade — só enviados quando a modalidade os exibe
    distribuicaoHibrida: document.getElementById('modalidade').value === 'híbrido'
      ? document.getElementById('distribuicaoHibrida').value.trim() : '',
    cargaSincronaPorAula: document.getElementById('modalidade').value === 'EaD'
      ? document.getElementById('cargaSincronaPorAula').value.trim() : '',
    proporcaoTeoricoPratico: document.getElementById('proporcaoTeoricoPratico').value.trim(),
    preRequisitos: document.getElementById('preRequisitos').value.trim(),
    pastaProjeto: document.getElementById('pastaProjeto').value.trim()
  };

  const originalLabel = triggerBtn.textContent;
  triggerBtn.disabled = true;
  triggerBtn.textContent = 'Gerando...';

  try {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || 'Erro ao salvar configuração');
    }

    const rMet = await fetch('/api/metodologia');
    if (!rMet.ok) {
      const err = await rMet.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao gerar metodologia');
    }
    const data = await rMet.json();
    document.getElementById('metodologiaResult').innerHTML = renderMarkdown(data.metodologia || '');
    document.getElementById('metodologiaResultCard').style.display = 'block';
    refreshTokenCounter();
  } catch (err) {
    alert('Erro: ' + err.message);
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalLabel;
  }
}

document.getElementById('configForm').addEventListener('submit', async e => {
  e.preventDefault();
  await salvarConfigEGerarMetodologia(document.getElementById('btnGerarMetodologia'));
});

document.getElementById('btnRegenerarMetodologia').addEventListener('click', async () => {
  await salvarConfigEGerarMetodologia(document.getElementById('btnRegenerarMetodologia'));
});

document.getElementById('btnSalvarMetodologia').addEventListener('click', async () => {
  const btn = document.getElementById('btnSalvarMetodologia');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Salvando...';
  try {
    const r = await fetch('/api/metodologia/confirmar', { method: 'POST' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao confirmar metodologia');
    refreshTokenCounter();
    markDone(1);
    goStep(2);
  } catch (err) {
    alert('Erro: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

// ── STEP 2 — Pesquisa ────────────────────────────────────────────────────────
document.getElementById('btnSearch').addEventListener('click', () => {
  const topicos = encodeURIComponent(document.getElementById('topicos').value.trim());
  const limite = document.getElementById('limite').value || 3;

  state.sites = [];
  document.getElementById('searchResultCard').style.display = 'block';
  document.getElementById('sitesContainer').style.display = 'none';
  document.getElementById('sitesList').innerHTML = '';
  document.getElementById('searchActions').style.display = 'none';

  const logPanel = initLog('logSearch');
  document.getElementById('btnSearch').disabled = true;

  const url = `/api/search?topicos=${topicos}&limite=${limite}`;

  streamSSE(url, {
    logPanel,
    resultEl: 'resultSearch',
    onSite(site) {
      state.sites.push(site);
      const container = document.getElementById('sitesContainer');
      const list = document.getElementById('sitesList');
      container.style.display = 'block';

      const domain = new URL(site.url).hostname;
      const item = document.createElement('div');
      item.className = 'site-item';
      item.innerHTML =
        `<img src="https://www.google.com/s2/favicons?sz=16&domain=${domain}" alt="" onerror="this.style.display='none'">` +
        `<a href="${escHtml(site.url)}" target="_blank" rel="noopener">${escHtml(site.title || site.url)}</a>`;
      list.appendChild(item);
    },
    onDone() {
      document.getElementById('searchActions').style.display = 'flex';
      document.getElementById('btnSearch').disabled = false;
      markDone(2);
    },
    onError() {
      document.getElementById('btnSearch').disabled = false;
    }
  });
});

// ── STEP 3 — Plano de ensino ─────────────────────────────────────────────────
document.getElementById('btnPlanoEnsino').addEventListener('click', () => {
  const ajustes = encodeURIComponent(document.getElementById('ajustesEnsino').value.trim());

  document.getElementById('ensinoResultCard').style.display = 'block';
  document.getElementById('ensinoActions').style.display = 'none';

  const logPanel = initLog('logEnsino');
  document.getElementById('btnPlanoEnsino').disabled = true;

  streamSSE(`/api/plano-ensino?ajustes=${ajustes}`, {
    logPanel,
    resultEl: 'resultEnsino',
    onDone() {
      document.getElementById('ensinoActions').style.display = 'flex';
      document.getElementById('btnPlanoEnsino').disabled = false;
      markDone(3);
    },
    onError() {
      document.getElementById('btnPlanoEnsino').disabled = false;
    }
  });
});

// ── STEP 4 — Plano de aula ───────────────────────────────────────────────────
document.getElementById('btnPlanoAula').addEventListener('click', () => {
  const observacoes = encodeURIComponent(document.getElementById('observacoesAula').value.trim());

  document.getElementById('aulaResultCard').style.display = 'block';
  document.getElementById('aulaActions').style.display = 'none';

  const logPanel = initLog('logAula');
  document.getElementById('btnPlanoAula').disabled = true;

  streamSSE(`/api/plano-aula?observacoes=${observacoes}`, {
    logPanel,
    resultEl: 'resultAula',
    onDone() {
      document.getElementById('aulaActions').style.display = 'flex';
      document.getElementById('btnPlanoAula').disabled = false;
      markDone(4);
    },
    onError() {
      document.getElementById('btnPlanoAula').disabled = false;
    }
  });
});

// ── STEP 5 — Conteúdo ────────────────────────────────────────────────────────
document.getElementById('btnConteudo').addEventListener('click', () => {
  document.getElementById('conteudoResultCard').style.display = 'block';
  document.getElementById('conteudoActions').style.display = 'none';
  document.getElementById('bannerDone').classList.remove('active');

  const logPanel = initLog('logConteudo');
  document.getElementById('btnConteudo').disabled = true;

  streamSSE(`/api/conteudo`, {
    logPanel,
    resultEl: 'resultConteudo',
    onDone() {
      document.getElementById('conteudoActions').style.display = 'flex';
      document.getElementById('btnConteudo').disabled = false;
      document.getElementById('bannerDone').classList.add('active');
      markDone(5);
    },
    onError() {
      document.getElementById('btnConteudo').disabled = false;
    }
  });
});

// ── STEP 6 — Revisão de Qualidade e Aplicar Melhorias ───────────────────────
document.getElementById('btnRevisaoQualidade').addEventListener('click', () => {
  if (!state.doneSteps.has(5)) {
    alert('Conclua a Etapa 5 (Conteúdo) antes de gerar a revisão de qualidade.');
    return;
  }

  document.getElementById('revisaoQualidadeResultCard').style.display = 'block';
  document.getElementById('revisaoQualidadeActions').style.display = 'none';
  document.getElementById('btnRevisaoQualidade').disabled = true;

  const logPanel = initLog('logRevisaoQualidade');

  streamSSE('/api/revisao-qualidade', {
    logPanel,
    resultEl: 'resultRevisaoQualidade',
    onDone() {
      document.getElementById('revisaoQualidadeActions').style.display = 'flex';
      document.getElementById('btnRevisaoQualidade').disabled = false;
      markDone(6);
    },
    onError() {
      document.getElementById('btnRevisaoQualidade').disabled = false;
    }
  });
});

document.getElementById('btnBaixarRevisao').addEventListener('click', () => {
  exportDocx('revisao-qualidade');
});

// Botão "↺ Gerar Nova Revisão" (card de melhorias aplicadas): rola até o
// card de revisão de qualidade e dispara uma nova geração, que já reflete o
// conteúdo pós-melhorias em sess.conteudoPorAula — fecha o ciclo iterativo
// de revisão sem exigir que o usuário navegue manualmente.
function gerarNovaRevisao() {
  // A exibição do card (display:block) acontece de forma síncrona logo no
  // início do handler de clique — por isso o click() vem antes do scroll.
  document.getElementById('btnRevisaoQualidade').click();
  document.getElementById('revisaoQualidadeResultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('btnUploadMelhorias').addEventListener('click', async () => {
  const fileInput = document.getElementById('arquivoMelhorias');
  const btn = document.getElementById('btnUploadMelhorias');
  const resumoEl = document.getElementById('resumoMelhorias');
  const aplicarBtn = document.getElementById('btnAplicarMelhorias');

  if (!fileInput.files || !fileInput.files[0]) {
    alert('Selecione um arquivo .docx antes de carregar.');
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Carregando...';
  resumoEl.style.display = 'none';
  aplicarBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('arquivo', fileInput.files[0]);

    const r = await fetch('/api/aplicar-melhorias', { method: 'POST', body: formData });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao processar o arquivo');

    const total = data.aulas?.length || 0;
    const comObs = data.totalComObservacoes || 0;

    // Modo estruturado: contagem real de melhorias por aula; legado: aviso.
    let detalhe = '';
    if (data.modoLegado) {
      detalhe = `<span style="color:#b45309">⚠️ Seção "Melhorias a serem Aplicadas" não encontrada — usando modo legado (Observações do Revisor).</span><br>`;
    } else {
      const porAula = (data.aulas || [])
        .map((a, i) => (a.melhorias?.length ? `Aula ${i + 1}: <strong>${a.melhorias.length}</strong> melhoria(s)` : null))
        .filter(Boolean);
      detalhe = porAula.length
        ? `${porAula.join(' · ')} — total: <strong>${data.totalMelhorias || 0}</strong><br>`
        : `<span style="color:#555">Nenhuma melhoria listada na seção estruturada.</span><br>`;
      (data.avisosParser || []).forEach(a => { detalhe += `<span style="color:#b45309">⚠️ ${escHtml(a)}</span><br>`; });
    }

    resumoEl.innerHTML =
      `<strong>✔ Arquivo processado!</strong> ` +
      `${total} aula(s) identificada(s), ` +
      `<strong>${comObs}</strong> com melhorias indicadas.<br>` +
      detalhe +
      `<span style="color:#555">Clique em "Aplicar Melhorias" para iniciar o processamento.</span>`;
    resumoEl.style.display = 'block';

    const bannerDup = document.getElementById('bannerDuplicata');
    bannerDup.style.display = 'none';
    const bannerConv = document.getElementById('bannerConvergencia');
    bannerConv.style.display = 'none';

    if (data.aviso === 'possivel_duplicata') {
      const pct = Math.round((data.similaridadeObservacoes || 0) * 100);
      const dtUpload = data.dataUltimoUpload
        ? new Date(data.dataUltimoUpload).toLocaleString('pt-BR')
        : 'data desconhecida';
      bannerDup.innerHTML =
        `⚠️ <strong>Possível duplicata detectada.</strong> Este documento é ` +
        `<strong>${pct}% similar</strong> ao último carregado (${escHtml(dtUpload)}). ` +
        `Você pode estar aplicando as mesmas melhorias duas vezes.<br>` +
        `<div style="margin-top:8px;display:flex;gap:8px">` +
          `<button class="btn btn-ghost btn-sm" id="btnCancelarDuplicata">Cancelar</button>` +
          `<button class="btn btn-primary btn-sm" id="btnConfirmarDuplicata">Aplicar mesmo assim</button>` +
        `</div>`;
      bannerDup.style.display = 'block';
      document.getElementById('btnCancelarDuplicata').onclick = () => {
        bannerDup.style.display = 'none';
        resumoEl.style.display = 'none';
      };
      document.getElementById('btnConfirmarDuplicata').onclick = () => {
        bannerDup.style.display = 'none';
        aplicarBtn.disabled = false;
      };
    } else if (data.avisoConvergencia) {
      // Early stopping: o ciclo anterior elevou pouco o score médio das aulas
      // — mesmo padrão visual/fluxo do aviso de duplicata acima.
      const conv = data.avisoConvergencia;
      const porAulaTxt = (conv.porAula || [])
        .filter(a => a.scoreOriginal !== null)
        .map(a => `Aula ${a.aula}: ${a.scoreOriginal.toFixed(2)}→${a.scoreCandidato.toFixed(2)}`)
        .join('; ');
      bannerConv.innerHTML =
        `⚠️ <strong>O ciclo anterior elevou o score médio em apenas +${conv.ganhoMedio.toFixed(2)}.</strong> ` +
        (porAulaTxt ? `(${escHtml(porAulaTxt)})<br>` : '<br>') +
        `O conteúdo parece ter convergido — novas melhorias tendem a ganho marginal. Aplicar mesmo assim?<br>` +
        `<div style="margin-top:8px;display:flex;gap:8px">` +
          `<button class="btn btn-ghost btn-sm" id="btnCancelarConvergencia">Cancelar</button>` +
          `<button class="btn btn-primary btn-sm" id="btnConfirmarConvergencia">Aplicar mesmo assim</button>` +
        `</div>`;
      bannerConv.style.display = 'block';
      document.getElementById('btnCancelarConvergencia').onclick = () => {
        bannerConv.style.display = 'none';
        resumoEl.style.display = 'none';
      };
      document.getElementById('btnConfirmarConvergencia').onclick = () => {
        bannerConv.style.display = 'none';
        aplicarBtn.disabled = false;
      };
    } else {
      aplicarBtn.disabled = false;
    }
  } catch (err) {
    alert('Erro ao carregar arquivo: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

document.getElementById('btnAplicarMelhorias').addEventListener('click', () => {
  document.getElementById('melhoriaResultCard').style.display = 'block';
  document.getElementById('melhoriaActions').style.display = 'none';
  document.getElementById('bannerFinalizado').style.display = 'none';
  document.getElementById('btnAplicarMelhorias').disabled = true;

  const logPanel = initLog('logMelhoria');

  streamSSE('/api/aplicar-melhorias/confirmar', {
    logPanel,
    resultEl: 'resultMelhoria',
    onDone(_texto, msg) {
      document.getElementById('melhoriaActions').style.display = 'flex';
      document.getElementById('btnAplicarMelhorias').disabled = false;
      // Plano de aula realinhado pelo ciclo: reflete na tela e no badge
      if (msg?.planoAula) {
        const el = document.getElementById('resultAula');
        if (el) el.innerHTML = renderMarkdown(msg.planoAula);
        atualizarBadgeOrigem('plano_de_aula', 'ia', new Date().toISOString());
      }
    },
    onError() {
      document.getElementById('btnAplicarMelhorias').disabled = false;
    }
  });
});

document.getElementById('btnFinalizarConteudo').addEventListener('click', async () => {
  const btn = document.getElementById('btnFinalizarConteudo');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Gerando...';

  try {
    const r = await fetch('/api/finalizar-conteudo', { method: 'POST' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao finalizar conteúdo');
    document.getElementById('bannerFinalizado').innerHTML =
      `✅ Conteúdo finalizado! Arquivo salvo em: <strong>${escHtml(data.path)}</strong>`;
    document.getElementById('bannerFinalizado').style.display = 'block';
  } catch (err) {
    alert('Erro ao finalizar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

// ── STEP 7 — Agente de Qualidade ─────────────────────────────────────────────
document.getElementById('btnQualidade').addEventListener('click', () => {
  if (!state.doneSteps.has(5)) {
    alert('Conclua as Etapas 1–5 antes de gerar o Relatório de Qualidade.');
    return;
  }

  document.getElementById('qualidadeResultCard').style.display = 'block';
  document.getElementById('qualidadeActions').style.display = 'none';
  document.getElementById('btnQualidade').disabled = true;

  const logPanel = initLog('logQualidade');
  addLog(logPanel, 'Iniciando análise pedagógica...');

  streamSSE('/api/qualidade', {
    logPanel,
    resultEl: 'resultQualidade',
    onDone() {
      document.getElementById('qualidadeActions').style.display = 'flex';
      document.getElementById('btnQualidade').disabled = false;
    },
    onError() {
      document.getElementById('btnQualidade').disabled = false;
    }
  });
});

// ── STEP 7 — PPC ─────────────────────────────────────────────────────────────
document.getElementById('btnPpc').addEventListener('click', () => {
  if (!state.doneSteps.has(5)) {
    alert('Conclua as Etapas 1–5 antes de gerar o PPC.');
    return;
  }

  document.getElementById('ppcResultCard').style.display = 'block';
  document.getElementById('ppcActions').style.display = 'none';
  document.getElementById('btnPpc').disabled = true;

  const logPanel = initLog('logPpc');
  addLog(logPanel, 'Iniciando geração do PPC...');

  streamSSE('/api/ppc', {
    logPanel,
    resultEl: 'resultPpc',
    onDone() {
      document.getElementById('ppcActions').style.display = 'flex';
      document.getElementById('btnPpc').disabled = false;
    },
    onError() {
      document.getElementById('btnPpc').disabled = false;
    }
  });
});

// ── STEP 8 — Slides (PowerPoint, via API do Gamma) ──────────────────────────
// Pausa a cada aula para revisão de quantidade de slides (1-5) e observações
// complementares, mesmo padrão de duas fases já usado na Etapa 9 (Roteiros):
// monta parâmetros (sem IA) → aprova → gera via SSE, com avanço automático.
// Não usa streamSSE() genérico: o evento "done" aqui carrega metadado de um
// arquivo .pptx binário, não texto para renderizar como markdown.
document.getElementById('btnSlides').addEventListener('click', async () => {
  if (!state.doneSteps.has(5)) {
    alert('Conclua as Etapas 1–5 antes de gerar os slides.');
    return;
  }

  // Template Gamma já escolhido nesta sessão — segue direto para o estilo
  // visual. Caso contrário, sempre consulta o servidor de novo (nunca
  // guarda em cache que "não há templates": a lista em GAMMA_TEMPLATE_IDS
  // só é lida quando o servidor sobe, mas o usuário pode configurá-la e
  // reiniciar o servidor no meio da sessão do navegador, sem recarregar a
  // página — um cache client-side desatualizado faria o sistema pular a
  // tela de seleção mesmo com templates já disponíveis).
  if (state.slidesTemplate) {
    await prosseguirParaEstiloVisual();
    return;
  }

  await carregarSlidesTemplates();
});

// Resolve os templates Gamma configurados (GAMMA_TEMPLATE_IDS) e exibe a
// tela de seleção. Se nenhum estiver configurado: no fluxo normal (chamada
// pelo botão "Gerar Slides"), segue direto para a etapa de estilo visual,
// sem exibir nada; no modo interativo (botão "Trocar template"), avisa o
// usuário em vez de fechar a tela em que ele já estava.
async function carregarSlidesTemplates({ interativo = false } = {}) {
  const btn = document.getElementById('btnSlides');
  btn.disabled = true;
  try {
    const r = await fetch('/api/slides/templates');
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao listar templates do Gamma.'); return; }
    if (!data.templates?.length) {
      if (interativo) {
        alert('Nenhum template do Gamma configurado (GAMMA_TEMPLATE_IDS vazia no .env).');
        return;
      }
      await prosseguirParaEstiloVisual();
      return;
    }

    const indexAtual = data.templates.findIndex(t => t.id === state.slidesTemplate?.id);
    const lista = document.getElementById('slidesTemplateList');
    lista.innerHTML = data.templates.map((t, i) =>
      `<label class="bncc-item">` +
      `<input type="radio" name="slidesTemplateOpcao" value="${escHtml(t.id)}" ` +
      `data-title="${escHtml(t.title || t.id)}" ${i === (indexAtual >= 0 ? indexAtual : 0) ? 'checked' : ''}>` +
      `<span><strong>${escHtml(t.title || t.id)}</strong></span>` +
      `</label>`
    ).join('');
    if (interativo) document.getElementById('slidesParametrosCard').style.display = 'none';
    document.getElementById('slidesTemplateContainer').style.display = 'block';
  } catch (err) {
    alert('Erro ao carregar templates do Gamma: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('btnConfirmarSlidesTemplate').addEventListener('click', async () => {
  const opcao = document.querySelector('#slidesTemplateList input[name=slidesTemplateOpcao]:checked');
  if (!opcao) {
    alert('Selecione um template antes de confirmar.');
    return;
  }
  try {
    const r = await fetch('/api/slides/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: opcao.value })
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao salvar o template escolhido.'); return; }
    state.slidesTemplate = data.template;
    document.getElementById('slidesTemplateContainer').style.display = 'none';
    // Se o usuário estava revendo os parâmetros de uma aula específica
    // (troca de template no meio do curso), volta para essa mesma aula em
    // vez de reiniciar do zero na aula 1.
    await prosseguirParaEstiloVisual(state.slidesIndex ?? 0);
  } catch (err) {
    alert('Erro ao salvar o template escolhido: ' + err.message);
  }
});

// "Trocar template": reabre a tela de seleção (já com o template atual
// pré-marcado, via carregarSlidesTemplates) sem perder a aula em que o
// usuário estava — mesmo padrão de btnTrocarHeygenConfig (Etapa 10).
document.getElementById('btnTrocarSlidesTemplate').addEventListener('click', async () => {
  await carregarSlidesTemplates({ interativo: true });
});

// Depois de resolvido o template (escolhido, ou funcionalidade não
// configurada), segue para a escolha de estilo visual — que continua
// exigida independente do template — ou direto para a aula `index`
// (0 = início do curso) se o estilo visual já tiver sido escolhido antes.
async function prosseguirParaEstiloVisual(index = 0) {
  if (state.estiloVisual) {
    await abrirParametrosSlides(index);
    return;
  }
  await carregarEstilosVisuais();
}

async function carregarEstilosVisuais() {
  const btn = document.getElementById('btnSlides');
  const container = document.getElementById('estiloVisualContainer');
  const lista = document.getElementById('estilosVisuaisList');
  btn.disabled = true;
  try {
    const r = await fetch('/api/estilos-visuais');
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao gerar opções de estilo visual.'); return; }
    if (!data.estilos?.length) { alert('Não foi possível gerar opções de estilo visual.'); return; }

    lista.innerHTML = data.estilos.map((estilo, i) =>
      `<label class="bncc-item">` +
      `<input type="radio" name="estiloVisualOpcao" value="${escHtml(estilo.id || String(i))}" ` +
      `data-titulo="${escHtml(estilo.titulo || '')}" data-house-prompt="${escHtml(estilo.housePrompt || '')}" ${i === 0 ? 'checked' : ''}>` +
      `<span><strong>${escHtml(estilo.titulo || '')}</strong> — ${escHtml(estilo.descricao || '')}</span>` +
      `</label>`
    ).join('');
    container.style.display = 'block';
  } catch (err) {
    alert('Erro ao carregar estilos visuais: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('btnConfirmarEstiloVisual').addEventListener('click', async () => {
  const opcao = document.querySelector('#estilosVisuaisList input[name=estiloVisualOpcao]:checked');
  if (!opcao) {
    alert('Selecione um estilo antes de confirmar.');
    return;
  }
  const escolha = { id: opcao.value, titulo: opcao.dataset.titulo, housePrompt: opcao.dataset.housePrompt };
  try {
    const r = await fetch('/api/estilos-visuais/selecionar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(escolha)
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao salvar o estilo escolhido.'); return; }
    state.estiloVisual = escolha;
    document.getElementById('estiloVisualContainer').style.display = 'none';
    await abrirParametrosSlides(0);
  } catch (err) {
    alert('Erro ao salvar o estilo escolhido: ' + err.message);
  }
});

// Monta (sem IA) e exibe os parâmetros da aula de índice `index` para revisão.
async function abrirParametrosSlides(index) {
  const btn = document.getElementById('btnSlides');
  btn.disabled = true;
  try {
    const r = await fetch(`/api/slides/parametros?index=${index}`);
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao montar parâmetros dos slides.'); return; }

    state.slidesIndex = index;
    document.getElementById('slidesAulaProgresso').textContent = `${data.index + 1} de ${data.total} — ${data.titulo}`;
    document.getElementById('slidesQuantidadeSelect').value = String(data.quantidadePadrao);
    document.getElementById('slidesObservacaoTexto').value = data.observacaoPadrao;
    document.getElementById('slidesParametrosCard').style.display = 'block';
    // Só existe template para trocar quando GAMMA_TEMPLATE_IDS está
    // configurada — nesse caso o servidor já teria rejeitado esta chamada
    // sem um template selecionado, então state.slidesTemplate garante isso.
    document.getElementById('btnTrocarSlidesTemplate').style.display = state.slidesTemplate ? '' : 'none';
    document.getElementById('logSlides').innerHTML = '';
  } catch (err) {
    alert('Erro ao montar parâmetros dos slides: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('btnGerarSlidesAula').addEventListener('click', async () => {
  const index = state.slidesIndex;
  const texto = document.getElementById('slidesObservacaoTexto').value;
  const quantidade = Number(document.getElementById('slidesQuantidadeSelect').value);
  const gerarBtn = document.getElementById('btnGerarSlidesAula');
  gerarBtn.disabled = true;

  try {
    const r = await fetch('/api/slides/parametros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, texto, quantidade })
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao aprovar os parâmetros.'); gerarBtn.disabled = false; return; }

    const logPanel = initLog('logSlides');
    addLog(logPanel, 'Iniciando geração dos slides desta aula...');

    const es = new EventSource('/api/slides/gerar');

    es.onmessage = e => {
      const msg = JSON.parse(e.data);

      if (msg.type === 'progress') {
        if (msg.message.includes('concluídos')) finishLog(logPanel, msg.message);
        else addLog(logPanel, msg.message);
      } else if (msg.type === 'done') {
        clearSpinner(logPanel);
        registrarArquivoSlideGerado(msg);
        es.close();
        refreshTokenCounter();
        gerarBtn.disabled = false;
        if (msg.proximoIndex !== null && msg.proximoIndex !== undefined) {
          abrirParametrosSlides(msg.proximoIndex);
        } else {
          document.getElementById('slidesParametrosCard').style.display = 'none';
          document.getElementById('slidesResultCard').style.display = 'block';
        }
      } else if (msg.type === 'error') {
        errLog(logPanel, msg.message);
        es.close();
        refreshTokenCounter();
        gerarBtn.disabled = false;
      }
    };

    es.onerror = () => {
      errLog(logPanel, 'Erro de conexão com o servidor.');
      es.close();
      refreshTokenCounter();
      gerarBtn.disabled = false;
    };
  } catch (err) {
    alert('Erro ao aprovar os parâmetros: ' + err.message);
    gerarBtn.disabled = false;
  }
});

function registrarArquivoSlideGerado(msg) {
  const container = document.getElementById('slidesArquivos');
  container.style.display = 'flex';
  container.insertAdjacentHTML('beforeend',
    `<span style="background:#ede9fb;color:#4A3B8C;border-radius:6px;padding:4px 10px;font-size:.8rem">🖥️ ${escHtml(msg.titulo)}</span>`);
}

// ── STEP 9 — Roteiros ───────────────────────────────────────────────────────
// Diferente das demais etapas, o fluxo aqui não é um loop automático único:
// cada aula exige revisão/edição humana do prompt antes de chamar a IA, então
// o cliente pede um prompt por vez (GET /api/roteiro/prompt), deixa o usuário
// aprovar (POST /api/roteiro/aprovar) e só então gera via SSE
// (GET /api/roteiro/gerar), avançando automaticamente para a próxima aula ao
// receber "proximoIndex" no evento "done" — até esgotar sess.aulas.length.

document.getElementById('btnRoteiros').addEventListener('click', async () => {
  if (!state.doneSteps.has(4)) {
    alert('Conclua a Etapa 4 (Plano de Aula) antes de gerar roteiros.');
    return;
  }
  if (state.roteiroBlocos) {
    await abrirPromptRoteiro(0);
    return;
  }
  document.getElementById('roteiroBlocosContainer').style.display = 'block';
});

document.getElementById('btnConfirmarRoteiroBlocos').addEventListener('click', async () => {
  const blocos = Number(document.getElementById('roteiroBlocosSelect').value);
  try {
    const r = await fetch('/api/roteiro/blocos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocos })
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao salvar número de blocos.'); return; }
    state.roteiroBlocos = blocos;
    document.getElementById('roteiroBlocosContainer').style.display = 'none';
    await abrirPromptRoteiro(0);
  } catch (err) {
    alert('Erro ao salvar número de blocos: ' + err.message);
  }
});

// Monta (sem IA) e exibe o prompt da aula de índice `index` para revisão.
async function abrirPromptRoteiro(index) {
  const btn = document.getElementById('btnRoteiros');
  btn.disabled = true;
  try {
    const r = await fetch(`/api/roteiro/prompt?index=${index}`);
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao montar prompt do roteiro.'); return; }

    state.roteiroIndex = index;
    document.getElementById('roteiroAulaProgresso').textContent = `${data.index + 1} de ${data.total} — ${data.titulo}`;
    document.getElementById('roteiroPromptTexto').value = data.prompt;
    document.getElementById('roteiroPromptCard').style.display = 'block';
    document.getElementById('logRoteiro').innerHTML = '';
    document.getElementById('resultRoteiro').innerHTML = '';
    document.getElementById('resultRoteiro').classList.remove('active');
  } catch (err) {
    alert('Erro ao montar prompt do roteiro: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('btnGerarRoteiroAula').addEventListener('click', async () => {
  const texto = document.getElementById('roteiroPromptTexto').value;
  const index = state.roteiroIndex;
  const gerarBtn = document.getElementById('btnGerarRoteiroAula');
  gerarBtn.disabled = true;

  try {
    const r = await fetch('/api/roteiro/aprovar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, texto })
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao aprovar prompt.'); gerarBtn.disabled = false; return; }

    const logPanel = initLog('logRoteiro');
    streamSSE('/api/roteiro/gerar', {
      logPanel,
      resultEl: 'resultRoteiro',
      async onDone(fullText, msg) {
        registrarArquivoRoteiroGerado(msg);
        markDone(9);
        gerarBtn.disabled = false;
        if (msg.proximoIndex !== null && msg.proximoIndex !== undefined) {
          await abrirPromptRoteiro(msg.proximoIndex);
        } else {
          document.getElementById('roteiroPromptCard').style.display = 'none';
          document.getElementById('roteiroResultCard').style.display = 'block';
        }
      },
      onError() { gerarBtn.disabled = false; }
    });
  } catch (err) {
    alert('Erro ao aprovar prompt: ' + err.message);
    gerarBtn.disabled = false;
  }
});

function registrarArquivoRoteiroGerado(msg) {
  const container = document.getElementById('roteiroArquivos');
  container.style.display = 'flex';
  container.insertAdjacentHTML('beforeend',
    `<span style="background:#ede9fb;color:#4A3B8C;border-radius:6px;padding:4px 10px;font-size:.8rem">🎬 Roteiro ${escHtml(msg.numero)}: ${escHtml(msg.titulo)}</span>`);
}

// ── STEP 10 — Vídeo com Avatar (HeyGen) ─────────────────────────────────────
// Avatar/voz/controles avançados são escolhidos uma única vez por curso
// (mesmo padrão do estilo visual). Diferente de Slides/Roteiros, o avanço
// entre aulas NÃO é automático: o usuário escolhe manualmente a aula a cada
// rodada (o ciclo por aula envolve revisão humana fora do app em duas etapas
// — roteiro e vídeo — então auto-avançar geraria confusão sobre qual aula
// está em andamento).

document.getElementById('btnVideoAvatar').addEventListener('click', async () => {
  if (!state.doneSteps.has(5)) {
    alert('Conclua as Etapas 1–5 antes de gerar vídeos com avatar.');
    return;
  }
  if (state.heygenConfig) {
    await carregarSeletorAulasVideoAvatar();
    return;
  }
  await carregarHeygenConfig();
});

async function carregarHeygenConfig() {
  const btn = document.getElementById('btnVideoAvatar');
  btn.disabled = true;
  try {
    const [rAvatares, rVozes] = await Promise.all([
      fetch('/api/heygen/avatares'),
      fetch('/api/heygen/vozes')
    ]);
    const dataAvatares = await rAvatares.json();
    const dataVozes = await rVozes.json();
    if (!rAvatares.ok) { alert(dataAvatares.error || 'Erro ao listar avatares do HeyGen.'); return; }
    if (!rVozes.ok) { alert(dataVozes.error || 'Erro ao listar vozes do HeyGen.'); return; }
    if (!dataAvatares.avatares?.length) {
      alert('Nenhum avatar encontrado no seu workspace HeyGen. Crie um avatar em app.heygen.com antes de continuar.');
      return;
    }
    if (!dataVozes.vozes?.length) {
      alert('Nenhuma voz encontrada no seu workspace HeyGen.');
      return;
    }

    // Ao reabrir para trocar, pré-marca o avatar/voz atualmente configurados
    // (quando ainda presentes na lista) em vez de sempre cair no primeiro item.
    const avatarIndexAtual = dataAvatares.avatares.findIndex(a => a.id === state.heygenConfig?.avatarId);
    const vozIndexAtual = dataVozes.vozes.findIndex(v => v.voice_id === state.heygenConfig?.voiceId);

    const avataresList = document.getElementById('heygenAvataresList');
    avataresList.innerHTML = dataAvatares.avatares.map((a, i) =>
      `<label class="bncc-item">` +
      `<input type="radio" name="heygenAvatarOpcao" value="${escHtml(a.id)}" ` +
      `data-name="${escHtml(a.name || '')}" data-type="${escHtml(a.avatar_type || '')}" ${i === (avatarIndexAtual >= 0 ? avatarIndexAtual : 0) ? 'checked' : ''}>` +
      (a.preview_image_url ? `<img class="avatar-preview" src="${escHtml(a.preview_image_url)}" alt="" onerror="this.style.display='none'">` : '') +
      `<span><strong>${escHtml(a.name || a.id)}</strong>${a.avatar_type ? ` — ${escHtml(a.avatar_type)}` : ''}</span>` +
      `</label>`
    ).join('');

    const vozesList = document.getElementById('heygenVozesList');
    vozesList.innerHTML = dataVozes.vozes.map((v, i) =>
      `<label class="bncc-item">` +
      `<input type="radio" name="heygenVozOpcao" value="${escHtml(v.voice_id)}" ` +
      `data-name="${escHtml(v.name || '')}" ${i === (vozIndexAtual >= 0 ? vozIndexAtual : 0) ? 'checked' : ''}>` +
      `<span><strong>${escHtml(v.name || v.voice_id)}</strong>${v.language ? ` — ${escHtml(v.language)}` : ''}</span>` +
      `</label>`
    ).join('');

    document.getElementById('heygenConfigContainer').style.display = 'block';
  } catch (err) {
    alert('Erro ao carregar avatares/vozes do HeyGen: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('btnConfirmarHeygenConfig').addEventListener('click', async () => {
  const avatarOpcao = document.querySelector('#heygenAvataresList input[name=heygenAvatarOpcao]:checked');
  const vozOpcao = document.querySelector('#heygenVozesList input[name=heygenVozOpcao]:checked');
  if (!avatarOpcao || !vozOpcao) {
    alert('Selecione um avatar e uma voz antes de confirmar.');
    return;
  }
  const escolha = {
    avatarId: avatarOpcao.value,
    avatarName: avatarOpcao.dataset.name,
    avatarType: avatarOpcao.dataset.type,
    voiceId: vozOpcao.value,
    voiceName: vozOpcao.dataset.name,
    expressiveness: document.getElementById('heygenExpressividade').value || null,
    motionPrompt: document.getElementById('heygenMotionPrompt').value.trim()
  };
  try {
    const r = await fetch('/api/heygen/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(escolha)
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao salvar a configuração do HeyGen.'); return; }
    state.heygenConfig = escolha;
    document.getElementById('heygenConfigContainer').style.display = 'none';
    document.getElementById('btnCancelarHeygenConfig').style.display = 'none';
    await carregarSeletorAulasVideoAvatar();
  } catch (err) {
    alert('Erro ao salvar a configuração do HeyGen: ' + err.message);
  }
});

// "Trocar avatar/voz": reabre a tela de seleção (já com a config atual
// pré-marcada, via carregarHeygenConfig) sem perder o estado da aula
// selecionada, que fica escondido até o usuário confirmar ou cancelar.
document.getElementById('btnTrocarHeygenConfig').addEventListener('click', async () => {
  document.getElementById('videoAvatarAulaCard').style.display = 'none';
  document.getElementById('videoAvatarParametrosCard').style.display = 'none';
  document.getElementById('btnCancelarHeygenConfig').style.display = '';
  await carregarHeygenConfig();
});

// Fecha a tela de seleção sem persistir nada — só faz sentido quando
// reaberta via "Trocar avatar/voz" (o botão fica oculto na 1ª configuração
// do curso, quando ainda não há seletor de aula para voltar).
document.getElementById('btnCancelarHeygenConfig').addEventListener('click', () => {
  document.getElementById('heygenConfigContainer').style.display = 'none';
  document.getElementById('btnCancelarHeygenConfig').style.display = 'none';
  document.getElementById('videoAvatarAulaCard').style.display = 'block';
  document.getElementById('videoAvatarParametrosCard').style.display = 'block';
});

// Popula o seletor de aulas (1x, usando o "total" devolvido pelos parâmetros
// da primeira aula) e abre a primeira aula por padrão.
async function carregarSeletorAulasVideoAvatar() {
  try {
    const r = await fetch('/api/video-avatar/parametros?index=0');
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao carregar aulas.'); return; }

    const select = document.getElementById('videoAvatarAulaSelect');
    select.innerHTML = Array.from({ length: data.total }, (_, i) =>
      `<option value="${i}">Aula ${i + 1}</option>`
    ).join('');
    document.getElementById('videoAvatarAulaCard').style.display = 'block';
    await abrirParametrosVideoAvatar(0);
  } catch (err) {
    alert('Erro ao carregar aulas: ' + err.message);
  }
}

document.getElementById('videoAvatarAulaSelect').addEventListener('change', async (e) => {
  await abrirParametrosVideoAvatar(Number(e.target.value));
});

// Monta (sem IA) e exibe os parâmetros da aula de índice `index` — reseta o
// estado visual do roteiro/vídeo, já que é uma aula nova sendo aberta.
async function abrirParametrosVideoAvatar(index) {
  try {
    const r = await fetch(`/api/video-avatar/parametros?index=${index}`);
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao montar parâmetros do vídeo.'); return; }

    state.videoAvatarIndex = index;
    state.videoAvatarNumero = data.numero;
    document.getElementById('videoAvatarAulaSelect').value = String(index);
    document.getElementById('videoAvatarAulaProgresso').textContent = `${data.index + 1} de ${data.total} — ${data.titulo}`;
    document.getElementById('duracaoSegundosInput').value = String(data.duracaoPadrao);
    document.getElementById('videoAvatarParametrosCard').style.display = 'block';
    document.getElementById('logRoteiroAvatar').innerHTML = '';
    document.getElementById('resultRoteiroAvatar').innerHTML = '';
    document.getElementById('resultRoteiroAvatar').classList.remove('active');
    document.getElementById('logVideoAvatar').innerHTML = '';
    document.getElementById('videoAvatarRoteiroActions').style.display = 'none';
  } catch (err) {
    alert('Erro ao montar parâmetros do vídeo: ' + err.message);
  }
}

// Só dígitos no campo de segundos — validação client-side complementar à do
// servidor (Number.isInteger + faixa válida).
document.getElementById('duracaoSegundosInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^\d]/g, '');
});

document.getElementById('btnGerarRoteiroAvatar').addEventListener('click', async () => {
  const index = state.videoAvatarIndex;
  const segundos = Number(document.getElementById('duracaoSegundosInput').value);
  const gerarBtn = document.getElementById('btnGerarRoteiroAvatar');
  if (!Number.isInteger(segundos) || segundos < 5) {
    alert('Informe uma duração inteira válida, em segundos.');
    return;
  }
  gerarBtn.disabled = true;

  try {
    const r = await fetch('/api/video-avatar/parametros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, segundos })
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao aprovar a duração.'); gerarBtn.disabled = false; return; }

    const logPanel = initLog('logRoteiroAvatar');
    streamSSE('/api/video-avatar/roteiro/gerar', {
      logPanel,
      resultEl: 'resultRoteiroAvatar',
      onDone() {
        gerarBtn.disabled = false;
        document.getElementById('videoAvatarRoteiroActions').style.display = 'flex';
      },
      onError() { gerarBtn.disabled = false; }
    });
  } catch (err) {
    alert('Erro ao aprovar a duração: ' + err.message);
    gerarBtn.disabled = false;
  }
});

document.getElementById('btnImportarRoteiroAvatar').addEventListener('click', () => {
  if (!state.videoAvatarNumero) return;
  abrirImportar('roteiroAvatar' + state.videoAvatarNumero);
});

document.getElementById('btnEnviarHeygen').addEventListener('click', () => {
  const index = state.videoAvatarIndex;
  const btn = document.getElementById('btnEnviarHeygen');
  btn.disabled = true;

  const logPanel = initLog('logVideoAvatar');
  addLog(logPanel, 'Enviando roteiro ao HeyGen...');

  const es = new EventSource(`/api/video-avatar/gerar?index=${index}`);

  es.onmessage = e => {
    const msg = JSON.parse(e.data);

    if (msg.type === 'progress') {
      if (msg.message.includes('concluído')) finishLog(logPanel, msg.message);
      else addLog(logPanel, msg.message);
    } else if (msg.type === 'done') {
      clearSpinner(logPanel);
      registrarArquivoVideoAvatarGerado(msg);
      markDone(10);
      es.close();
      refreshTokenCounter();
      btn.disabled = false;
      document.getElementById('videoAvatarResultCard').style.display = 'block';
    } else if (msg.type === 'error') {
      errLog(logPanel, msg.message);
      es.close();
      refreshTokenCounter();
      btn.disabled = false;
    }
  };

  es.onerror = () => {
    errLog(logPanel, 'Erro de conexão com o servidor.');
    es.close();
    refreshTokenCounter();
    btn.disabled = false;
  };
});

function registrarArquivoVideoAvatarGerado(msg) {
  const container = document.getElementById('videoAvatarArquivos');
  container.style.display = 'flex';
  container.insertAdjacentHTML('beforeend',
    `<span style="background:#ede9fb;color:#4A3B8C;border-radius:6px;padding:4px 10px;font-size:.8rem">🧑‍🏫 Vídeo ${escHtml(msg.numero)}: ${escHtml(msg.titulo)}</span>`);
}

// ── Copiar ───────────────────────────────────────────────────────────────────
function copyResult(elId) {
  const el = document.getElementById(elId);
  const text = el.innerText || el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    alert('Copiado para a área de transferência!');
  }).catch(() => {
    alert('Não foi possível copiar automaticamente. Selecione o texto manualmente.');
  });
}

// ── Exportar .docx ───────────────────────────────────────────────────────────
async function exportDocx(step) {
  const body = step === 'pesquisa' ? { sites: state.sites } : {};
  try {
    const r = await fetch(`/api/export/${step}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = await r.json();
      alert('Erro ao exportar: ' + (err.error || r.statusText));
      return;
    }

    const data = await r.json();
    if (data.saved) {
      alert(`Arquivo salvo em:\n${data.path}`);
    }
  } catch (err) {
    alert('Erro ao exportar: ' + err.message);
  }
}

// ── Abrir projeto existente por pasta ──────────────────────────────────────────
const STAGE_TO_STEP = {
  ementa: 1, pesquisa: 2, plano_de_ensino: 3, plano_de_aula: 4, conteudo: 5
};

// Abre o seletor nativo de pasta do Windows (via servidor) e devolve o caminho
// escolhido, ou null se o usuário cancelou ou o seletor falhou.
async function escolherPasta() {
  try {
    const r = await fetch('/api/escolher-pasta');
    const data = await r.json();
    if (!r.ok) {
      alert(data.error || 'Não foi possível abrir o seletor de pasta. Digite o caminho manualmente.');
      return null;
    }
    return data.pasta || null;
  } catch (err) {
    alert('Não foi possível abrir o seletor de pasta. Digite o caminho manualmente.');
    return null;
  }
}

document.getElementById('btnSelecionarPastaProjeto').addEventListener('click', async () => {
  const pasta = await escolherPasta();
  if (pasta) await carregarProjetoPorPasta(pasta);
});

document.getElementById('btnProcurarPastaProjeto').addEventListener('click', async () => {
  const pasta = await escolherPasta();
  if (pasta) document.getElementById('pastaProjeto').value = pasta;
});

async function carregarProjetoPorPasta(pasta) {
  try {
    const r = await fetch('/api/carregar-projeto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pasta })
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao carregar projeto'); return; }

    // Cards com os arquivos reais encontrados na pasta selecionada
    const container = document.getElementById('arquivosProjetoCarregado');
    if (data.arquivos?.length) {
      container.innerHTML = data.arquivos.map(a =>
        `<span style="background:#ede9fb;color:#4A3B8C;border-radius:6px;padding:4px 10px;font-size:.8rem">${escHtml(a.rotulo)}</span>`
      ).join('');
    } else {
      container.innerHTML = '';
    }

    // Marca etapas concluídas com base nos stages carregados
    const stageStepMap = { ementa: 1, pesquisa: 2, plano_de_ensino: 3, plano_de_aula: 4, conteudo: 5 };
    let maxStep = 0;
    for (const stage of data.etapasCarregadas) {
      const step = stageStepMap[stage];
      if (step) { markDone(step); if (step > maxStep) maxStep = step; }
      if (stage.startsWith('aula') && stage.endsWith('_conteudo')) { markDone(5); maxStep = Math.max(maxStep, 5); }
    }
    if (data.stages) {
      Object.entries(data.stages).forEach(([stage, info]) => atualizarBadgeOrigem(stage, info.fonte, info.geradoEm));
    }

    // Repopula campos do formulário da Etapa 1
    if (data.config) {
      const c = data.config;
      ['nome','publico','carga','duracao','nivel','objetivos','modalidade','distribuicaoHibrida','cargaSincronaPorAula','proporcaoTeoricoPratico','preRequisitos','pastaProjeto'].forEach(id => {
        const el = document.getElementById(id);
        if (el && c[id] != null) el.value = c[id];
      });
      atualizarCamposModalidade();
    }

    // Restaura o estilo visual escolhido (Etapa 8) — evita pedir de novo se já
    // salvo no projeto.json de uma sessão anterior.
    if (data.estiloVisual) state.estiloVisual = data.estiloVisual;

    // Restaura o template Gamma escolhido (Etapa 8), quando a funcionalidade
    // está configurada e uma seleção já foi feita nesta pasta de projeto.
    if (data.slidesTemplate) state.slidesTemplate = data.slidesTemplate;

    // Restaura o número de blocos (Etapa 9) e os roteiros já gerados, evitando
    // pedir a escolha de blocos de novo e repopulando os badges de arquivos.
    if (data.roteiroBlocos) state.roteiroBlocos = data.roteiroBlocos;
    if (data.roteirosGerados?.length) {
      const container = document.getElementById('roteiroArquivos');
      container.style.display = 'flex';
      container.innerHTML = data.roteirosGerados.map(a =>
        `<span style="background:#ede9fb;color:#4A3B8C;border-radius:6px;padding:4px 10px;font-size:.8rem">🎬 Roteiro ${escHtml(a.numero)}: ${escHtml(a.titulo)}</span>`
      ).join('');
      document.getElementById('roteiroResultCard').style.display = 'block';
    }

    // Restaura os arquivos de slides já gerados (Etapa 8) — os valores sticky
    // de observação/quantidade já ficam no lado servidor (sess), devolvidos a
    // cada GET /api/slides/parametros, sem precisar de espelho no client state.
    if (data.slidesGerados?.length) {
      const container = document.getElementById('slidesArquivos');
      container.style.display = 'flex';
      container.innerHTML = data.slidesGerados.map(a =>
        `<span style="background:#ede9fb;color:#4A3B8C;border-radius:6px;padding:4px 10px;font-size:.8rem">🖥️ ${escHtml(a.titulo)}</span>`
      ).join('');
      document.getElementById('slidesResultCard').style.display = 'block';
    }

    // Restaura a configuração do HeyGen (Etapa 10) e os vídeos já gerados —
    // os valores sticky de duração já ficam no lado servidor (sess), devolvidos
    // a cada GET /api/video-avatar/parametros.
    if (data.heygenConfig) state.heygenConfig = data.heygenConfig;
    if (data.videosAvatarGerados?.length) {
      const container = document.getElementById('videoAvatarArquivos');
      container.style.display = 'flex';
      container.innerHTML = data.videosAvatarGerados.map(a =>
        `<span style="background:#ede9fb;color:#4A3B8C;border-radius:6px;padding:4px 10px;font-size:.8rem">🧑‍🏫 Vídeo ${escHtml(a.numero)}: ${escHtml(a.titulo)}</span>`
      ).join('');
      document.getElementById('videoAvatarResultCard').style.display = 'block';
      markDone(10);
    }

    // Restaura metodologia no painel da Etapa 0
    if (data.metodologia) {
      const el = document.getElementById('metodologiaResult');
      el.innerHTML = renderMarkdown(data.metodologia);
      el.style.display = 'block';
      document.getElementById('metodologiaActions').style.display = 'block';
    }

    // Repopula campos de texto livre das Etapas 2–4
    if (data.inputs) {
      const inp = data.inputs;
      if (inp.topicos != null) document.getElementById('topicos').value = inp.topicos;
      if (inp.limite != null) document.getElementById('limite').value = inp.limite;
      if (inp.ajustesEnsino != null) document.getElementById('ajustesEnsino').value = inp.ajustesEnsino;
      if (inp.observacoesAula != null) document.getElementById('observacoesAula').value = inp.observacoesAula;
    }

    const banner = document.getElementById('bannerProjetoCarregado');
    banner.style.display = 'block';
    banner.textContent = `✅ Projeto "${data.nome}" carregado — ${data.etapasCarregadas.length} etapas restauradas.`;
    if (data.camposFaltantes?.length)
      banner.textContent += ` Campos a reinserir: ${data.camposFaltantes.join(', ')}.`;

    // Só agora a sessão tem config.nome/pastaProjeto — GET /api/tokens passa a
    // conseguir localizar e devolver o histórico persistido (scr/token_usage.json).
    refreshTokenCounter();

    if (maxStep > 0) setTimeout(() => goStep(maxStep), 800);
  } catch (err) {
    alert('Erro ao carregar projeto: ' + err.message);
  }
}

// ── Badge de origem ───────────────────────────────────────────────────────────
const STAGE_BADGE_MAP = {
  metodologia: 'origemMetodologia',
  pesquisa: 'origemEtapa2',
  plano_de_ensino: 'origemEtapa3',
  plano_de_aula: 'origemEtapa4',
  conteudo: 'origemEtapa5',
};

// Elemento de resultado de cada etapa fixa (re-render após importação).
// aulaNN_conteudo fica de fora: resultConteudo agrega todas as aulas e seria
// clobberado por um texto de aula única — a versão importada é persistida e
// aparece ao recarregar o projeto.
const STAGE_RESULT_MAP = {
  metodologia: 'metodologiaResult',
  pesquisa: 'resultSearch',
  plano_de_ensino: 'resultEnsino',
  plano_de_aula: 'resultAula',
  revisao_qualidade: 'resultRevisaoQualidade',
};

function atualizarBadgeOrigem(stage, fonte, data) {
  const badgeId = STAGE_BADGE_MAP[stage];
  if (!badgeId) return;
  const el = document.getElementById(badgeId);
  if (!el) return;
  if (fonte === 'usuario') {
    const d = data ? new Date(data).toLocaleDateString('pt-BR') : '';
    el.className = 'badge-origem badge-usuario';
    el.textContent = `✏️ Versão do usuário${d ? ' · ' + d : ''}`;
  } else {
    el.className = 'badge-origem badge-ia';
    el.textContent = '🤖 Gerado pela IA';
  }
}

// ── Importar .docx editado ────────────────────────────────────────────────────
let _importarTextoBuffer = '';
let _importarStageBuffer = '';

function abrirImportar(stageHint) {
  _importarTextoBuffer = '';
  _importarStageBuffer = stageHint || '';
  document.getElementById('importarDeteccao').style.display = 'none';
  document.getElementById('importarSeletor').style.display = 'none';
  document.getElementById('btnConfirmarImportar').disabled = true;
  document.getElementById('importarFileInput').value = '';
  const modal = document.getElementById('modalImportar');
  modal.style.display = 'flex';
}

function fecharModalImportar() {
  document.getElementById('modalImportar').style.display = 'none';
}

document.getElementById('importarFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('arquivo', file);
  const detDiv = document.getElementById('importarDeteccao');
  const selDiv = document.getElementById('importarSeletor');
  const btnConf = document.getElementById('btnConfirmarImportar');
  detDiv.style.display = 'none';
  selDiv.style.display = 'none';
  btnConf.disabled = true;
  try {
    const r = await fetch('/api/importar', { method: 'POST', body: form });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao processar arquivo'); return; }
    _importarTextoBuffer = data.texto || '';
    if (data.detectadoPor === 'ambiguo') {
      selDiv.style.display = 'block';
      const sel = document.getElementById('importarStageSeletor');
      sel.innerHTML = (data.candidatos || []).map(c => `<option value="${c.stage}">${c.titulo}</option>`).join('');
      // Hint da etapa de origem do clique pré-seleciona (usuário pode trocar)
      const hint = _importarStageBuffer;
      if (hint && (data.candidatos || []).some(c => c.stage === hint)) {
        sel.value = hint;
        btnConf.disabled = false;
      } else {
        _importarStageBuffer = '';
      }
      sel.onchange = () => { _importarStageBuffer = sel.value; btnConf.disabled = !_importarStageBuffer; };
    } else {
      _importarStageBuffer = data.stagioDetectado;
      detDiv.style.display = 'block';
      detDiv.textContent = `Detectado: ${data.titulo} (${data.chars} caracteres) — via ${data.detectadoPor}`;
      btnConf.disabled = false;
    }
  } catch (err) {
    alert('Erro: ' + err.message);
  }
});

document.getElementById('btnConfirmarImportar').addEventListener('click', async () => {
  if (!_importarStageBuffer || !_importarTextoBuffer) return;

  // Aviso se stage já tem versão do usuário (regressão consciente)
  const badgeId = STAGE_BADGE_MAP[_importarStageBuffer];
  if (badgeId) {
    const el = document.getElementById(badgeId);
    if (el?.classList.contains('badge-usuario')) {
      if (!confirm('Este artefato já tem uma versão importada por você. Substituir pela nova versão?')) return;
    }
  }

  try {
    const r = await fetch('/api/importar/confirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: _importarStageBuffer, texto: _importarTextoBuffer })
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Erro ao confirmar'); return; }
    atualizarBadgeOrigem(_importarStageBuffer, 'usuario', new Date().toISOString());
    // Reflete o texto importado no resultado exibido da etapa
    const resultId = STAGE_RESULT_MAP[_importarStageBuffer];
    const resultEl = resultId && document.getElementById(resultId);
    if (resultEl) resultEl.innerHTML = renderMarkdown(_importarTextoBuffer);
    fecharModalImportar();
    alert(`Artefato "${_importarStageBuffer}" atualizado com sua versão.`);
  } catch (err) {
    alert('Erro: ' + err.message);
  }
});
