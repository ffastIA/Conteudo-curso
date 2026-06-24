// ── Estado global ────────────────────────────────────────────────────────────
const state = {
  currentStep: 0,
  doneSteps: new Set(),
  sites: [],
  bncc: { ativo: false, publico: null, nivel: null, itens: [] }
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

// ── Pasta de saída dos arquivos editáveis ───────────────────────────────────
document.getElementById('btnSalvarPasta').addEventListener('click', async () => {
  const btn = document.getElementById('btnSalvarPasta');
  const original = btn.textContent;
  const pasta = document.getElementById('pastaSaida').value.trim();
  btn.disabled = true;
  btn.textContent = 'Verificando...';
  try {
    const r = await fetch('/api/pasta-saida', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pasta })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao definir a pasta');
    if (data.path) {
      alert('Pasta de saída definida:\n' + data.path);
    } else {
      alert('Pasta de saída removida. As exportações voltarão a ser baixadas pelo navegador.');
    }
  } catch (err) {
    alert('Não foi possível definir a pasta: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

// ── Navegação entre etapas ───────────────────────────────────────────────────
function goStep(n) {
  state.currentStep = n;
  document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
  document.getElementById(`step${n}`).classList.add('active');

  document.querySelectorAll('.step-pill').forEach(pill => {
    const step = +pill.dataset.step;
    pill.classList.remove('active');
    if (step === n) pill.classList.add('active');
  });

  // Habilita botões de qualidade/PPC quando etapa 5 estiver concluída
  if (state.doneSteps.has(5)) {
    document.getElementById('btnQualidade').disabled = false;
    document.getElementById('btnPpc').disabled = false;
  }
}

document.getElementById('stepsNav').addEventListener('click', e => {
  const pill = e.target.closest('.step-pill');
  if (pill) goStep(+pill.dataset.step);
});

function markDone(step) {
  state.doneSteps.add(step);
  const pill = document.querySelector(`.step-pill[data-step="${step}"]`);
  if (pill) pill.classList.add('done');
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

// ── Renderiza markdown básico ────────────────────────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
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
      resultArea.innerHTML = renderMarkdown(fullText);
      resultArea.scrollTop = resultArea.scrollHeight;
    } else if (msg.type === 'done') {
      fullText = msg.fullText;
      resultArea.innerHTML = renderMarkdown(fullText);
      es.close();
      refreshTokenCounter();
      if (onDone) onDone(fullText);
    } else if (msg.type === 'error') {
      errLog(logPanel, msg.message);
      es.close();
      refreshTokenCounter();
      if (onError) onError(msg.message);
    }
  };

  es.onerror = () => {
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
  document.getElementById('metodologiaContainer').style.display = 'block';
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
    document.getElementById('metodologiaContainer').style.display = 'block';
  } catch (err) {
    alert('Erro ao salvar seleção BNCC: ' + err.message);
  }
});

// Derivar metodologia
async function derivarMetodologia() {
  const btn = document.getElementById('btnDerivarMetodologia');
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  document.getElementById('metodologiaResult').style.display = 'none';
  document.getElementById('metodologiaActions').style.display = 'none';
  try {
    const r = await fetch('/api/metodologia');
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Erro ao gerar metodologia');
    }
    const data = await r.json();
    const el = document.getElementById('metodologiaResult');
    el.innerHTML = renderMarkdown(data.metodologia || '');
    el.style.display = 'block';
    document.getElementById('metodologiaActions').style.display = 'block';
    refreshTokenCounter();
  } catch (err) {
    alert('Erro: ' + err.message + '\n\nCertifique-se de preencher a Etapa 1 antes de derivar a metodologia.');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚙ Derivar Metodologia';
  }
}

document.getElementById('btnDerivarMetodologia').addEventListener('click', derivarMetodologia);
document.getElementById('btnRegenerarMetodologia').addEventListener('click', derivarMetodologia);

document.getElementById('btnConfirmarMetodologia').addEventListener('click', () => {
  markDone(0);
  goStep(1);
});

document.getElementById('btnPularEtapa0').addEventListener('click', async () => {
  await fetch('/api/bncc/pular', { method: 'POST' });
  goStep(1);
});

// ── STEP 1 — Config ──────────────────────────────────────────────────────────
document.getElementById('configForm').addEventListener('submit', async e => {
  e.preventDefault();
  const config = {
    nome: document.getElementById('nome').value.trim(),
    publico: document.getElementById('publico').value.trim(),
    carga: document.getElementById('carga').value,
    duracao: document.getElementById('duracao').value,
    nivel: document.getElementById('nivel').value,
    objetivos: document.getElementById('objetivos').value.trim(),
    modalidade: document.getElementById('modalidade').value,
    proporcaoTeoricoPratico: document.getElementById('proporcaoTeoricoPratico').value.trim(),
    preRequisitos: document.getElementById('preRequisitos').value.trim()
  };

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
    markDone(1);
    goStep(2);
  } catch (err) {
    alert('Erro ao salvar: ' + err.message);
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
    aplicarBtn.disabled = false;
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

    const contentType = r.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro ao finalizar conteúdo');
      if (data.saved) {
        document.getElementById('bannerFinalizado').innerHTML =
          `✅ Conteúdo finalizado! Arquivo salvo em: <strong>${escHtml(data.path)}</strong>`;
        document.getElementById('bannerFinalizado').style.display = 'block';
        return;
      }
    }
    if (!r.ok) throw new Error('Erro ao finalizar conteúdo');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = r.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="([^"]+)"/);
    a.download = match ? match[1] : 'conteudo_final.docx';
    a.click();
    URL.revokeObjectURL(url);
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

    const contentType = r.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const data = await r.json();
      if (data.saved) {
        alert(`Arquivo salvo em:\n${data.path}`);
        return;
      }
    }

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = r.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="([^"]+)"/);
    a.download = match ? match[1] : `${step}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Erro ao exportar: ' + err.message);
  }
}
