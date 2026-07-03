// ── Estado global ────────────────────────────────────────────────────────────
const state = {
  currentStep: 0,
  doneSteps: new Set(),
  sites: [],
  bncc: { ativo: false, publico: null, nivel: null, itens: [] },
  estiloVisual: null
};

// ── Contador global de tokens ────────────────────────────────────────────────
async function refreshTokenCounter() {
  try {
    const r = await fetch('/api/tokens');
    if (!r.ok) return;
    const { total } = await r.json();
    document.getElementById('tokenCount').textContent = (total || 0).toLocaleString('pt-BR');
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
}

// ── Log panel helpers ────────────────────────────────────────────────────────
function initLog(panelId) {
  const el = document.getElementById(panelId);
  el.innerHTML = '';
  el.classList.add('active');
  return el;
}

function addLog(panel, msg, type = 'current') {
  // Remove spinner da linha anterior
  panel.querySelectorAll('.log-line.current').forEach(l => {
    l.classList.remove('current');
    const sp = l.querySelector('.spinner');
    if (sp) sp.remove();
    l.classList.add('done-line');
  });

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
  panel.querySelectorAll('.log-line.current').forEach(l => {
    l.classList.remove('current');
    const sp = l.querySelector('.spinner');
    if (sp) sp.remove();
    l.classList.add('done-line');
  });
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
      fullText = msg.fullText;
      resultArea.innerHTML = renderMarkdown(fullText);
      resultArea.scrollTop = resultArea.scrollHeight;
      es.close();
      refreshTokenCounter();
      if (onDone) onDone(fullText);
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
    resumoEl.innerHTML =
      `<strong>✔ Arquivo processado!</strong> ` +
      `${total} aula(s) identificada(s), ` +
      `<strong>${comObs}</strong> com observações do revisor.<br>` +
      `<span style="color:#555">Clique em "Aplicar Melhorias" para iniciar o processamento.</span>`;
    resumoEl.style.display = 'block';

    const bannerDup = document.getElementById('bannerDuplicata');
    bannerDup.style.display = 'none';

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
    onDone() {
      document.getElementById('melhoriaActions').style.display = 'flex';
      document.getElementById('btnAplicarMelhorias').disabled = false;
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

// ── STEP 8 — Slides (PowerPoint) ─────────────────────────────────────────────
// Não usa streamSSE(): o evento "done" aqui carrega uma lista de arquivos
// .pptx gerados (binários, um por aula), não um texto para renderizar como
// markdown — por isso um handler de EventSource dedicado, mais enxuto.
document.getElementById('btnSlides').addEventListener('click', async () => {
  if (!state.doneSteps.has(5)) {
    alert('Conclua as Etapas 1–5 antes de gerar os slides.');
    return;
  }

  // Estilo visual já escolhido nesta sessão (ou restaurado de um projeto
  // carregado) — pula direto para a geração, sem pedir de novo.
  if (state.estiloVisual) {
    iniciarGeracaoSlides();
    return;
  }

  await carregarEstilosVisuais();
});

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
    iniciarGeracaoSlides();
  } catch (err) {
    alert('Erro ao salvar o estilo escolhido: ' + err.message);
  }
});

function iniciarGeracaoSlides() {
  const resultCard = document.getElementById('slidesResultCard');
  const arquivosEl = document.getElementById('slidesArquivos');
  const btn = document.getElementById('btnSlides');
  resultCard.style.display = 'block';
  arquivosEl.innerHTML = '';
  btn.disabled = true;

  const logPanel = initLog('logSlides');
  addLog(logPanel, 'Iniciando geração dos slides...');

  const es = new EventSource('/api/slides');

  es.onmessage = e => {
    const msg = JSON.parse(e.data);

    if (msg.type === 'progress') {
      if (msg.message === 'Concluído') finishLog(logPanel, msg.message);
      else addLog(logPanel, msg.message);
    } else if (msg.type === 'done') {
      arquivosEl.innerHTML = (msg.arquivos || []).map(a =>
        `<span style="background:#ede9fb;color:#4A3B8C;border-radius:6px;padding:4px 10px;font-size:.8rem" title="${escHtml(a.path)}">🖥️ ${escHtml(a.titulo)}</span>`
      ).join('');
      es.close();
      refreshTokenCounter();
      btn.disabled = false;
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
      ['nome','publico','carga','duracao','nivel','objetivos','modalidade','proporcaoTeoricoPratico','preRequisitos','pastaProjeto'].forEach(id => {
        const el = document.getElementById(id);
        if (el && c[id] != null) el.value = c[id];
      });
    }

    // Restaura o estilo visual escolhido (Etapa 8) — evita pedir de novo se já
    // salvo no projeto.json de uma sessão anterior.
    if (data.estiloVisual) state.estiloVisual = data.estiloVisual;

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
      _importarStageBuffer = '';
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
    fecharModalImportar();
    alert(`Artefato "${_importarStageBuffer}" atualizado com sua versão.`);
  } catch (err) {
    alert('Erro: ' + err.message);
  }
});
