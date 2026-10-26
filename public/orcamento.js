'use strict';

// Orçamento e custo na interface (change governanca-de-custo): painel com saldo, gasto por
// etapa, perfil e alertas; decisão do usuário depois de uma pausa por orçamento ou de um
// disparo do disjuntor; e confirmação quando a estimativa passa do saldo restante.
// Tudo via HTTP/SSE; a tela não guarda estado além do que GET /api/orcamento devolve.

const orcamentoUI = { estado: null, resolver: null };

const orcEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const orcUsd = (n) => (n === null || n === undefined || !Number.isFinite(Number(n))
  ? '—'
  : 'US$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(Number(n)) < 1 ? 4 : 2 }));

const ROTULO_ESCOPO = { projeto: 'do projeto', dia: 'do dia', etapa: 'da etapa' };
const ROTULO_MOTIVO = {
  custo: 'o custo de uma aula passou muito da estimativa',
  erro_repetido: 'o mesmo erro se repetiu várias vezes seguidas',
  sem_ganho: 'o último ciclo de melhoria quase não elevou a nota',
  continuacoes: 'as continuações de um texto cortado chegaram ao limite',
  limite_ciclos: 'o perfil de custo atingiu o máximo de ciclos de melhoria'
};

async function orcFetch(rota, opcoes) {
  const r = await fetch(rota, opcoes);
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.error || `Erro ${r.status}`);
  return corpo;
}

function orcSelectPerfis(e, id) {
  return `<select id="${id}">${e.perfis.map(p => `<option value="${orcEsc(p.id)}"${p.id === e.perfil.id ? ' selected' : ''}>${orcEsc(p.rotulo)}</option>`).join('')}</select>`;
}

// ── Emblema do cabeçalho e painel ───────────────────────────────────────────
async function atualizarOrcamento() {
  try {
    orcamentoUI.estado = await orcFetch('/api/orcamento');
    renderEmblemaOrcamento(orcamentoUI.estado);
    renderPainelOrcamento(orcamentoUI.estado);
  } catch {
    // painel é informativo: falha de rede não deve incomodar o usuário
  }
}

function renderEmblemaOrcamento(e) {
  const el = document.getElementById('orcamentoResumo');
  const btn = document.getElementById('btnOrcamento');
  if (!el || !btn) return;
  const pendente = e.pausa || e.disjuntor;
  const restantes = ['projeto', 'dia'].map(k => e[k]?.restanteUsd).filter(v => v !== null && v !== undefined);
  const restante = restantes.length ? Math.min(...restantes) : null;
  el.textContent = pendente
    ? `${e.perfil.rotulo} · decisão pendente`
    : restante !== null ? `${e.perfil.rotulo} · restam ${orcUsd(restante)}` : `${e.perfil.rotulo} · sem teto`;
  btn.classList.toggle('orcamento-alerta', !!pendente);
}

function renderPainelOrcamento(e) {
  const corpo = document.getElementById('orcamentoCorpo');
  if (!corpo) return;
  const linha = (rotulo, s) => `<tr><td>${rotulo}</td><td>${orcUsd(s?.tetoUsd)}</td><td>${orcUsd(s?.gastoUsd)}</td><td>${orcUsd(s?.restanteUsd)}</td></tr>`;
  const etapas = Object.entries(e.etapa?.porEtapa || {});
  const avisos = [];
  if (!e.ativo) avisos.push('Nenhum teto configurado: nada é barrado. Defina um teto abaixo ou nas variáveis ORCAMENTO_*.');
  if (!e.tarifaBuscaWebConfigurada) avisos.push('A tarifa da busca web (buscaWebPorChamadaUsd) não está configurada: o custo da pesquisa pode estar subestimado.');
  for (const a of e.avisosModelos || []) avisos.push(a.mensagem);
  corpo.innerHTML =
    `<table class="orcamento-tabela"><thead><tr><th>Escopo</th><th>Teto</th><th>Gasto</th><th>Restante</th></tr></thead><tbody>` +
    linha('Projeto', e.projeto) + linha('Dia (todos os projetos)', e.dia) +
    `<tr><td>Por etapa</td><td>${orcUsd(e.etapa?.tetoUsd)}</td><td colspan="2">${etapas.length ? '' : '—'}</td></tr>` +
    etapas.map(([nome, v]) => `<tr class="orcamento-sub"><td>↳ ${orcEsc(nome)}</td><td></td><td>${orcUsd(v.gastoUsd)}</td><td>${orcUsd(v.restanteUsd)}</td></tr>`).join('') +
    `</tbody></table>` +
    (avisos.length ? `<ul class="orcamento-avisos">${avisos.map(a => `<li>${orcEsc(a)}</li>`).join('')}</ul>` : '') +
    (e.perfil?.modeloPesquisa ? `<p class="field-hint">Modelo de pesquisa neste perfil: <code>${orcEsc(e.perfil.modeloPesquisa)}</code></p>` : '') +
    `<div class="orcamento-form">
       <label>Perfil de custo ${orcSelectPerfis(e, 'orcPerfil')}</label>
       <label>Teto do projeto (US$) <input id="orcTetoProjeto" type="number" min="0" step="0.01" value="${orcEsc(e.projeto?.tetoUsd ?? '')}" /></label>
       <label>Teto do dia (US$) <input id="orcTetoDia" type="number" min="0" step="0.01" value="${orcEsc(e.dia?.tetoUsd ?? '')}" /></label>
       <label>Teto por etapa (US$) <input id="orcTetoEtapa" type="number" min="0" step="0.01" value="${orcEsc(e.etapa?.tetoUsd ?? '')}" /></label>
       <button class="btn btn-primary btn-sm" id="btnSalvarOrcamento" type="button">Salvar</button>
       <span id="orcamentoSalvoMsg" class="field-hint"></span>
     </div>
     <p class="field-hint">Alerta em ${orcEsc(e.alertaPct)}% do teto · margem de reserva ${orcEsc(e.margemPct)}% · degradação automática ${e.degradacaoAutomatica ? 'ligada' : 'desligada'}. Estimativas são faixas, não valores exatos.</p>`;
  document.getElementById('btnSalvarOrcamento').addEventListener('click', salvarOrcamento);
}

async function salvarOrcamento() {
  const num = (id) => {
    const v = document.getElementById(id).value.trim();
    return v === '' ? null : Number(v);
  };
  const msg = document.getElementById('orcamentoSalvoMsg');
  try {
    const e = orcamentoUI.estado;
    const corpo = { tetos: { projeto: num('orcTetoProjeto'), dia: num('orcTetoDia'), etapa: num('orcTetoEtapa') } };
    const perfil = document.getElementById('orcPerfil').value;
    if (perfil !== e.perfil.id) corpo.perfil = perfil;
    await orcFetch('/api/orcamento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    await atualizarOrcamento();
    document.getElementById('orcamentoSalvoMsg').textContent = 'Salvo.';
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
}

function abrirPainelOrcamento() {
  document.getElementById('orcamentoOverlay').style.display = 'flex';
  atualizarOrcamento();
}

function fecharPainelOrcamento() {
  document.getElementById('orcamentoOverlay').style.display = 'none';
  document.getElementById('orcamentoDecisao').style.display = 'none';
  const r = orcamentoUI.resolver;
  orcamentoUI.resolver = null;
  if (r) r(false);
}

// ── Decisões do usuário (pausa, disjuntor, estimativa acima do saldo) ───────
// Mostra o bloco de decisão no painel e devolve uma promessa (true = seguir; false = não).
function mostrarDecisaoOrcamento({ titulo, mensagem, controles }) {
  const caixa = document.getElementById('orcamentoDecisao');
  caixa.innerHTML = `<h3>${orcEsc(titulo)}</h3><p>${orcEsc(mensagem)}</p><div class="orcamento-decisao-acoes">${controles}</div><p id="orcamentoDecisaoMsg" class="field-hint"></p>`;
  caixa.style.display = 'block';
  document.getElementById('orcamentoOverlay').style.display = 'flex';
  return new Promise(resolver => { orcamentoUI.resolver = resolver; });
}

function concluirDecisao(valor, mensagem) {
  const r = orcamentoUI.resolver;
  orcamentoUI.resolver = null;
  const msg = document.getElementById('orcamentoDecisaoMsg');
  if (msg && mensagem) msg.textContent = mensagem;
  atualizarOrcamento();
  if (r) r(valor);
}

async function enviarDecisao(corpo, mensagemOk, valor = true) {
  try {
    await orcFetch('/api/orcamento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    concluirDecisao(valor, mensagemOk);
  } catch (err) {
    const msg = document.getElementById('orcamentoDecisaoMsg');
    if (msg) msg.textContent = err.message;
  }
}

async function decidirPausaOrcamento(info) {
  await atualizarOrcamento();
  const e = orcamentoUI.estado;
  const escopo = info.escopo;
  const sugestao = Math.ceil((Number(info.tetoUsd) || 1) * 2 * 100) / 100;
  const promessa = mostrarDecisaoOrcamento({
    titulo: 'Geração pausada por orçamento',
    mensagem: `O gasto ${ROTULO_ESCOPO[escopo] || escopo} é ${orcUsd(info.gastoUsd)} e a próxima chamada custaria ~${orcUsd(info.estimativaProximaUsd)}, acima do teto de ${orcUsd(info.tetoUsd)}. O que já foi gerado está salvo; depois de decidir, execute a etapa de novo para continuar de onde parou.`,
    controles:
      `<label>Novo teto (US$) <input id="orcNovoTeto" type="number" min="0" step="0.01" value="${orcEsc(sugestao)}" /></label>
       <button class="btn btn-primary btn-sm" id="orcAumentar" type="button">Aumentar o teto</button>
       <label>Perfil ${orcSelectPerfis(e, 'orcDecPerfil')}</label>
       <button class="btn btn-secondary btn-sm" id="orcTrocar" type="button">Trocar o perfil</button>
       <button class="btn btn-ghost btn-sm" id="orcCancelar" type="button">Cancelar</button>`
  });
  document.getElementById('orcAumentar').addEventListener('click', () => {
    const valor = Number(document.getElementById('orcNovoTeto').value);
    enviarDecisao({ tetos: { [escopo]: valor } }, 'Teto atualizado. Execute a etapa de novo para continuar.');
  });
  document.getElementById('orcTrocar').addEventListener('click', () =>
    enviarDecisao({ perfil: document.getElementById('orcDecPerfil').value }, 'Perfil trocado. Execute a etapa de novo para continuar.'));
  document.getElementById('orcCancelar').addEventListener('click', () => concluirDecisao(false));
  return promessa;
}

async function decidirDisjuntor(info) {
  await atualizarOrcamento();
  const e = orcamentoUI.estado;
  const promessa = mostrarDecisaoOrcamento({
    titulo: 'Disjuntor acionado',
    mensagem: `A etapa foi interrompida${info.unidade ? ` em ${info.unidade}` : ''}: ${ROTULO_MOTIVO[info.motivo] || info.motivo}. O texto parcial, se houver, ficou em arquivo .partial. Decida como seguir e execute a etapa de novo.`,
    controles:
      `<button class="btn btn-primary btn-sm" id="orcLimite" type="button">Aumentar o limite</button>
       <label>Perfil ${orcSelectPerfis(e, 'orcDecPerfil')}</label>
       <button class="btn btn-secondary btn-sm" id="orcTrocar" type="button">Trocar o perfil</button>
       <button class="btn btn-secondary btn-sm" id="orcPular" type="button">Pular${info.unidade ? ` (${orcEsc(info.unidade)})` : ''}</button>`
  });
  document.getElementById('orcLimite').addEventListener('click', () =>
    enviarDecisao({ decisao: 'aumentar-limite' }, 'Limite aumentado. Execute a etapa de novo para continuar.'));
  document.getElementById('orcTrocar').addEventListener('click', () =>
    enviarDecisao({ decisao: 'trocar-perfil', perfil: document.getElementById('orcDecPerfil').value }, 'Perfil trocado. Execute a etapa de novo para continuar.'));
  document.getElementById('orcPular').addEventListener('click', () =>
    enviarDecisao({ decisao: 'pular' }, 'Unidade pulada: continua marcada como incompleta. Execute a etapa de novo para seguir.'));
  return promessa;
}

// Antes de uma etapa pesada: se a faixa máxima da estimativa passa do saldo restante, pede confirmação.
async function confirmarEstimativa(etapa) {
  let e;
  try { e = await orcFetch(`/api/estimativa?etapa=${encodeURIComponent(etapa)}`); } catch { return true; }
  if (!e.excedeSaldo) return true;
  const sugestao = Math.ceil(((e.custoProjetoUsd || 0) + e.custoUsd.maximo) * 1.2 * 100) / 100;
  const promessa = mostrarDecisaoOrcamento({
    titulo: 'A estimativa passa do saldo restante',
    mensagem: `A faixa máxima estimada desta etapa é ${orcUsd(e.custoUsd.maximo)}, e o saldo restante é ${orcUsd(e.saldo.restanteUsd)}. É uma estimativa, não um valor exato. Se o teto for atingido, a etapa pausa e o que foi gerado fica salvo.`,
    controles:
      `<button class="btn btn-primary btn-sm" id="orcContinuar" type="button">Continuar mesmo assim</button>
       <label>Novo teto do projeto (US$) <input id="orcNovoTeto" type="number" min="0" step="0.01" value="${sugestao}" /></label>
       <button class="btn btn-secondary btn-sm" id="orcAumentar" type="button">Aumentar o teto e continuar</button>
       <button class="btn btn-ghost btn-sm" id="orcCancelar" type="button">Cancelar</button>`
  });
  document.getElementById('orcContinuar').addEventListener('click', () => concluirDecisao(true));
  document.getElementById('orcAumentar').addEventListener('click', () =>
    enviarDecisao({ tetos: { projeto: Number(document.getElementById('orcNovoTeto').value) } }, 'Teto atualizado.'));
  document.getElementById('orcCancelar').addEventListener('click', () => concluirDecisao(false));
  const seguir = await promessa;
  document.getElementById('orcamentoOverlay').style.display = 'none';
  document.getElementById('orcamentoDecisao').style.display = 'none';
  return seguir;
}

// Eventos SSE da governança. Devolve a decisão pendente (para abrir depois do evento de erro), se houver.
function tratarEventoOrcamento(msg, logPanel) {
  if (msg.type === 'alerta_orcamento') {
    warnLog(logPanel, `Orçamento ${ROTULO_ESCOPO[msg.escopo] || msg.escopo} em ${msg.pct}% do teto (${orcUsd(msg.gastoUsd)} de ${orcUsd(msg.tetoUsd)}).`);
    atualizarOrcamento();
    return null;
  }
  if (msg.type === 'perfil_alterado') {
    warnLog(logPanel, `Perfil de custo reduzido de ${msg.de} para ${msg.para} (${msg.motivo}).`);
    atualizarOrcamento();
    return null;
  }
  if (msg.type === 'pausado_orcamento') {
    warnLog(logPanel, 'Geração pausada por orçamento — o que já foi gerado está salvo.');
    return () => decidirPausaOrcamento(msg);
  }
  if (msg.type === 'disjuntor') {
    warnLog(logPanel, 'Disjuntor acionado — a etapa foi interrompida para você decidir.');
    return () => decidirDisjuntor(msg);
  }
  return null;
}

document.getElementById('btnOrcamento').addEventListener('click', abrirPainelOrcamento);
document.getElementById('btnFecharOrcamento').addEventListener('click', fecharPainelOrcamento);
document.getElementById('orcamentoOverlay').addEventListener('click', (e) => { if (e.target.id === 'orcamentoOverlay') fecharPainelOrcamento(); });
atualizarOrcamento();
