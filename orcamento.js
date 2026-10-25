'use strict';

// Governança de custo (change governanca-de-custo): tetos por escopo com reserva
// antes da chamada e acerto depois, alerta, pausa, gasto persistido em
// scr/uso.json, calibração da estimativa, perfis, roteamento de modelos por papel
// e gatilhos do disjuntor. Sem nenhum teto configurado, a governança só contabiliza
// (nada é barrado, degradado ou reservado). O módulo não conhece o Express: o
// servidor injeta onde fica a pasta do projeto e como emitir um evento SSE.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const custo = require('./custo');
const modelos = require('./config/modelos');

const FATOR_MIN = 0.5;
const FATOR_MAX = 3;
const ALFA_CALIBRACAO = 0.3;
const RESERVA_TTL_MS = 15 * 60_000;
const MAX_DISPAROS_GUARDADOS = 100;
const EPSILON_GANHO_PADRAO = 0.02; // mesmo limiar do gate de ganho de nota (EPSILON_CONVERGENCIA)

const PERFIS_PADRAO = {
  padrao: 'padrao',
  ordem: ['economico', 'padrao', 'premium'],
  perfis: {
    economico: { rotulo: 'Econômico', consultasPesquisa: 2, contextoBusca: 'low', modeloRedacao: 'economia', ciclosMelhoriaMax: 1, fontesPorSecao: 3, juizForte: 'nunca', disjuntorSemGanho: 'interrompe' },
    padrao: { rotulo: 'Padrão', consultasPesquisa: 4, contextoBusca: 'medium', modeloRedacao: 'conteudo', ciclosMelhoriaMax: 2, fontesPorSecao: 5, juizForte: 'duvidoso', disjuntorSemGanho: 'interrompe' },
    premium: { rotulo: 'Premium', consultasPesquisa: 5, contextoBusca: 'high', modeloRedacao: 'juiz', ciclosMelhoriaMax: 3, fontesPorSecao: 8, juizForte: 'sempre', disjuntorSemGanho: 'avisa' }
  }
};

const numPositivo = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const arred = (n, casas = 6) => Number(Number(n).toFixed(casas));
const pad = (n) => String(n).padStart(2, '0');
const hojeLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

function usoVazio() {
  return {
    versao: 1,
    dias: {}, etapas: {}, modelos: {}, calibracao: {},
    tetos: {}, limites: {}, perfil: null, degradarPendente: false,
    alertas: {}, pausa: null, disjuntor: null, disparos: [], puladas: {}
  };
}

function lerPerfisConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'perfis-custo.json'), 'utf-8'));
    if (cfg && cfg.perfis && Array.isArray(cfg.ordem)) return cfg;
  } catch { /* usa o padrão embutido */ }
  return PERFIS_PADRAO;
}

function lerCapacidades() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'modelos-capacidades.json'), 'utf-8'));
  } catch {
    return { modelos: {}, exigencias: {} };
  }
}

// Confere cada papel com a tabela de capacidades. Só devolve avisos (nunca erro).
function validarModelos(porPapel = modelos.modelosPorPapel(), tabela = lerCapacidades()) {
  const avisos = [];
  for (const [papel, modelo] of Object.entries(porPapel)) {
    const conhecido = (tabela.modelos || {})[modelo];
    const exigidas = (tabela.exigencias || {})[papel] || [];
    if (!conhecido) {
      avisos.push({ papel, modelo, tipo: 'nao_conferido', mensagem: `O modelo "${modelo}" (papel ${papel}) não está na tabela de capacidades — a capacidade não pôde ser conferida.` });
      continue;
    }
    for (const cap of exigidas) {
      if (conhecido[cap] !== true) {
        avisos.push({ papel, modelo, tipo: 'sem_capacidade', capacidade: cap, mensagem: `O modelo "${modelo}" (papel ${papel}) está marcado sem "${cap}", que o papel exige.` });
      }
    }
  }
  return avisos;
}

function criarGovernanca({
  courseScrDir = () => null,
  emitir = () => {},
  logger = console,
  env = process.env,
  agora = () => new Date(),
  arquivoDiarioPadrao = path.join(__dirname, '.uso-diario.json')
} = {}) {
  const avisados = new Set();
  const avisarUma = (chave, msg) => {
    if (avisados.has(chave)) return;
    avisados.add(chave);
    logger.warn(msg);
  };
  const reservas = new Set();
  const unidadeAls = new AsyncLocalStorage();
  const errosSeguidos = new Map(); // etapa -> { codigo, n }

  // ── Estado de uso por projeto ───────────────────────────────────────────────
  function chaveProjeto(sess) {
    const dir = courseScrDir(sess);
    if (dir) return dir;
    if (!sess.__orcId) Object.defineProperty(sess, '__orcId', { value: crypto.randomUUID(), enumerable: false });
    return sess.__orcId;
  }

  function arquivoUso(sess) {
    const dir = courseScrDir(sess);
    return dir ? path.join(dir, 'uso.json') : null;
  }

  // Lê scr/uso.json para a sessão (carregar-projeto, importar, projeto recém-nomeado).
  function carregarUso(sess) {
    const arquivo = arquivoUso(sess);
    if (!arquivo || !fs.existsSync(arquivo)) return sess.uso || null;
    try {
      const lido = JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
      if (!lido || typeof lido !== 'object' || Array.isArray(lido)) throw new Error('formato inválido');
      sess.uso = { ...usoVazio(), ...lido };
    } catch (err) {
      logger.warn(`[orcamento] uso.json ilegível (${err.message}) — iniciando com o gasto zerado nesse arquivo`);
      sess.uso = usoVazio();
    }
    return sess.uso;
  }

  function usoDe(sess) {
    if (!sess.uso) sess.uso = usoVazio();
    return sess.uso;
  }

  // Gravação atômica: arquivo temporário e renomeação.
  function gravarUso(sess) {
    const arquivo = arquivoUso(sess);
    if (!arquivo) return;
    try {
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      const tmp = `${arquivo}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(usoDe(sess), null, 2), 'utf-8');
      fs.renameSync(tmp, arquivo);
    } catch (err) {
      avisarUma('gravar-uso', `[orcamento] não foi possível gravar uso.json: ${err.message}`);
    }
  }

  // ── Teto diário entre projetos (arquivo global) ─────────────────────────────
  let diario = null; // { data, total }
  let diarioDesligado = false;
  const arquivoDiario = () => (env.USO_DIARIO_FILE || arquivoDiarioPadrao);

  function lerDiario(hoje) {
    try {
      const j = JSON.parse(fs.readFileSync(arquivoDiario(), 'utf-8'));
      diario = j && j.data === hoje && Number.isFinite(j.totalUsd) ? { data: hoje, total: j.totalUsd } : { data: hoje, total: 0 };
    } catch (err) {
      if (err.code === 'ENOENT') { diario = { data: hoje, total: 0 }; return; }
      diarioDesligado = true;
      avisarUma('diario', `[orcamento] o arquivo de gasto diário não pôde ser lido (${err.message}) — teto diário desligado`);
    }
  }

  function totalDiario() {
    if (diarioDesligado) return 0;
    const hoje = hojeLocal(agora());
    if (!diario || diario.data !== hoje) lerDiario(hoje);
    if (diarioDesligado || !diario) return 0;
    if (diario.data !== hoje) diario = { data: hoje, total: 0 };
    return diario.total;
  }

  function somarDiario(usd) {
    const total = totalDiario();
    if (diarioDesligado || !diario) return;
    diario.total = total + usd;
    try {
      const tmp = `${arquivoDiario()}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify({ data: diario.data, totalUsd: arred(diario.total) }, null, 2), 'utf-8');
      fs.renameSync(tmp, arquivoDiario());
    } catch (err) {
      diarioDesligado = true;
      avisarUma('diario', `[orcamento] o arquivo de gasto diário não pôde ser gravado (${err.message}) — teto diário desligado`);
    }
  }

  // ── Tetos ───────────────────────────────────────────────────────────────────
  function lerTetoEnv(nome) {
    const bruto = env[nome];
    if (bruto === undefined || bruto === '') return null;
    const n = numPositivo(bruto);
    if (n === null) avisarUma(`env-${nome}`, `[orcamento] ${nome}="${bruto}" não é um número positivo — escopo sem teto`);
    return n;
  }

  function tetosDe(sess) {
    const ajustes = usoDe(sess).tetos || {};
    let projetoEnv = lerTetoEnv('ORCAMENTO_MAX_USD');
    if (projetoEnv === null && env.ORCAMENTO_USD !== undefined && env.ORCAMENTO_USD !== '') {
      projetoEnv = lerTetoEnv('ORCAMENTO_USD');
      avisarUma('depreciacao', '[orcamento] ORCAMENTO_USD foi substituída por ORCAMENTO_MAX_USD (continua aceita como sinônimo)');
    }
    const pct = Number(env.ORCAMENTO_ALERTA_PCT);
    const margem = Number(env.ORCAMENTO_MARGEM_PCT);
    return {
      projeto: numPositivo(ajustes.projeto) ?? projetoEnv,
      dia: numPositivo(ajustes.dia) ?? lerTetoEnv('ORCAMENTO_DIA_MAX_USD'),
      etapa: numPositivo(ajustes.etapa) ?? lerTetoEnv('ORCAMENTO_ETAPA_MAX_USD'),
      alertaPct: Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct : 80,
      margemPct: Number.isFinite(margem) && margem >= 0 ? margem : 15
    };
  }

  const temTeto = (t) => t.projeto !== null || t.dia !== null || t.etapa !== null;

  function escoposDe(sess, etapa, tetos = tetosDe(sess)) {
    const uso = usoDe(sess);
    const proj = chaveProjeto(sess);
    const hoje = hojeLocal(agora());
    // O teto diário só é mantido quando configurado (evita criar o arquivo global sem necessidade);
    // se o arquivo global está inacessível, o escopo dia fica desligado.
    const gastoDia = tetos.dia !== null ? totalDiario() : 0;
    const tetoDia = tetos.dia !== null && !diarioDesligado ? tetos.dia : null;
    return [
      { nome: 'projeto', chave: `projeto:${proj}`, tetoUsd: tetos.projeto, gastoUsd: Number(sess.custoProjetoUsd || 0) },
      { nome: 'dia', chave: `dia:${hoje}`, tetoUsd: tetoDia, gastoUsd: gastoDia },
      { nome: 'etapa', chave: `etapa:${proj}:${etapa}`, tetoUsd: tetos.etapa, gastoUsd: Number(uso.etapas?.[etapa]?.usd || 0) }
    ];
  }

  // ── Reserva e acerto ────────────────────────────────────────────────────────
  function reservadoEm(chave) {
    const limite = Date.now() - RESERVA_TTL_MS;
    let soma = 0;
    for (const r of [...reservas]) {
      if (r.criadaEm < limite) { reservas.delete(r); continue; } // reserva esquecida (stream abandonado)
      if (r.chaves.includes(chave)) soma += r.valor;
    }
    return soma;
  }

  function reservar(escopos, valor) {
    for (const e of escopos) {
      if (e.tetoUsd === null) continue;
      if (e.gastoUsd + reservadoEm(e.chave) + valor > e.tetoUsd + 1e-12) return { ok: false, escopo: e };
    }
    const token = { valor, chaves: escopos.filter(e => e.tetoUsd !== null).map(e => e.chave), criadaEm: Date.now() };
    reservas.add(token);
    return { ok: true, token };
  }

  const liberar = (token) => { if (token) reservas.delete(token); };

  const fatorDe = (uso, etapa) => limitar(Number(uso.calibracao?.[etapa]?.fator) || 1, FATOR_MIN, FATOR_MAX);

  // ── Pausa ───────────────────────────────────────────────────────────────────
  function pausar(sess, escopo, estimativaUsd) {
    const uso = usoDe(sess);
    const info = {
      escopo: escopo.nome,
      gastoUsd: arred(escopo.gastoUsd, 4),
      tetoUsd: arred(escopo.tetoUsd, 4),
      estimativaProximaUsd: arred(estimativaUsd, 4),
      opcoes: ['aumentar-teto', 'trocar-perfil', 'cancelar']
    };
    uso.pausa = { ...info, desde: agora().toISOString() };
    gravarUso(sess);
    emitir({ type: 'pausado_orcamento', ...info });
    const nomeEscopo = { projeto: 'do projeto', dia: 'diário', etapa: 'da etapa' }[escopo.nome];
    const varEnv = { projeto: env.ORCAMENTO_MAX_USD ? 'ORCAMENTO_MAX_USD' : (env.ORCAMENTO_USD ? 'ORCAMENTO_USD' : 'ORCAMENTO_MAX_USD'), dia: 'ORCAMENTO_DIA_MAX_USD', etapa: 'ORCAMENTO_ETAPA_MAX_USD' }[escopo.nome];
    const varTeto = numPositivo(uso.tetos?.[escopo.nome]) ? 'teto ajustado na tela' : varEnv;
    const err = new Error(
      `Orçamento ${nomeEscopo} atingido: custo acumulado US$ ${escopo.gastoUsd.toFixed(4)} + próxima chamada ~US$ ${estimativaUsd.toFixed(4)} ` +
      `ultrapassa o teto de US$ ${escopo.tetoUsd.toFixed(2)} (${varTeto}). Aumente o teto ou troque o perfil e execute a etapa de novo para continuar de onde parou.`);
    err.code = 'ORCAMENTO_EXCEDIDO';
    err.detalhes = info;
    err.alreadyReported = false;
    throw err;
  }

  // ── Disjuntor: limites e disparo ────────────────────────────────────────────
  function limitesDisjuntor(sess) {
    const l = usoDe(sess).limites || {};
    return {
      fatorCusto: numPositivo(l.fatorCusto) ?? numPositivo(env.DISJUNTOR_FATOR_CUSTO) ?? 2,
      errosSeguidos: Math.floor(numPositivo(l.errosSeguidos) ?? numPositivo(env.DISJUNTOR_ERROS_SEGUIDOS) ?? 3),
      ganhoMin: numPositivo(l.ganhoMin) ?? numPositivo(env.DISJUNTOR_GANHO_MIN) ?? EPSILON_GANHO_PADRAO,
      continuacoesExtra: Math.max(0, Math.floor(Number(l.continuacoesExtra) || 0))
    };
  }

  function disparar(sess, motivo, { unidade = null, valores = {} } = {}) {
    const uso = usoDe(sess);
    const registro = { motivo, unidade, valores, desde: agora().toISOString() };
    uso.disjuntor = { ...registro, resolvido: false };
    uso.disparos = [...(uso.disparos || []), registro].slice(-MAX_DISPAROS_GUARDADOS);
    gravarUso(sess);
    logger.warn(`[disjuntor] disparado: ${motivo}${unidade ? ` (${unidade})` : ''} ${JSON.stringify(valores)}`);
    emitir({ type: 'disjuntor', motivo, unidade, valores, opcoes: ['aumentar-limite', 'trocar-perfil', 'pular'] });
    const err = new Error(mensagemDisjuntor(motivo, unidade, valores));
    err.code = 'DISJUNTOR_DISPARADO';
    err.detalhes = registro;
    return err;
  }

  function mensagemDisjuntor(motivo, unidade, valores) {
    const onde = unidade ? ` em ${unidade}` : '';
    const fim = ' Decida na tela (aumentar o limite, trocar o perfil ou pular) e execute a etapa de novo.';
    switch (motivo) {
      case 'custo': return `Disjuntor: o custo${onde} (US$ ${Number(valores.custoUsd || 0).toFixed(4)}) passou de ${valores.fator}× a estimativa (US$ ${Number(valores.estimativaUsd || 0).toFixed(4)}).${fim}`;
      case 'erro_repetido': return `Disjuntor: o mesmo erro (${valores.codigo}) se repetiu ${valores.vezes} vezes seguidas${onde}.${fim}`;
      case 'sem_ganho': return `Disjuntor: o último ciclo de melhoria elevou a nota em apenas ${valores.ganhoMedio} (mínimo ${valores.ganhoMin}).${fim}`;
      case 'continuacoes': return `Disjuntor: as continuações${onde} chegaram ao limite sem terminar o texto.${fim}`;
      default: return `Disjuntor disparado (${motivo})${onde}.${fim}`;
    }
  }

  // ── Unidades de trabalho (aula/módulo) ──────────────────────────────────────
  function emUnidade(sess, { tipo = 'aula', numero = null, estimativaUsd = 0 } = {}, fn) {
    const store = { tipo, numero, estimativaUsd, custo: 0, rotulo: numero !== null ? `${tipo} ${numero}` : tipo };
    return unidadeAls.run(store, fn);
  }

  function verificarUnidade(sess) {
    const u = unidadeAls.getStore();
    if (!u || !(u.estimativaUsd > 0)) return;
    const { fatorCusto } = limitesDisjuntor(sess);
    if (u.custo > fatorCusto * u.estimativaUsd) {
      throw disparar(sess, 'custo', {
        unidade: u.rotulo,
        valores: { custoUsd: arred(u.custo, 4), estimativaUsd: arred(u.estimativaUsd, 4), fator: fatorCusto }
      });
    }
  }

  // ── Perfis ──────────────────────────────────────────────────────────────────
  function perfilPadraoId() {
    const cfg = lerPerfisConfig();
    const pedido = (env.CUSTO_PERFIL || '').trim();
    if (!pedido) return cfg.padrao in cfg.perfis ? cfg.padrao : 'padrao';
    if (pedido in cfg.perfis) return pedido;
    avisarUma('perfil-env', `[orcamento] CUSTO_PERFIL="${pedido}" é desconhecido — usando "padrao"`);
    return 'padrao' in cfg.perfis ? 'padrao' : cfg.ordem[0];
  }

  function perfil(sess) {
    const cfg = lerPerfisConfig();
    const id = usoDe(sess).perfil && usoDe(sess).perfil in cfg.perfis ? usoDe(sess).perfil : perfilPadraoId();
    return { id, ...cfg.perfis[id] };
  }

  // Desce um nível quando um alerta marcou a degradação; só entre unidades de trabalho.
  function aplicarDegradacao(sess) {
    const uso = usoDe(sess);
    if (!uso.degradarPendente) return null;
    uso.degradarPendente = false;
    if (String(env.CUSTO_DEGRADACAO_AUTOMATICA || '').toLowerCase() === 'false') return null;
    const cfg = lerPerfisConfig();
    const atual = perfil(sess).id;
    const idx = cfg.ordem.indexOf(atual);
    if (idx <= 0) { gravarUso(sess); return null; }
    const novo = cfg.ordem[idx - 1];
    uso.perfil = novo;
    gravarUso(sess);
    emitir({ type: 'perfil_alterado', de: atual, para: novo, motivo: 'alerta de orçamento' });
    logger.warn(`[orcamento] perfil de custo reduzido de ${atual} para ${novo} (alerta de orçamento)`);
    return novo;
  }

  // ── Antes e depois de cada chamada ──────────────────────────────────────────
  function antes(sess, etapa, params) {
    const uso = usoDe(sess);
    if (uso.disjuntor && !uso.disjuntor.resolvido) {
      emitir({ type: 'disjuntor', motivo: uso.disjuntor.motivo, unidade: uso.disjuntor.unidade, valores: uso.disjuntor.valores, opcoes: ['aumentar-limite', 'trocar-perfil', 'pular'] });
      const err = new Error(mensagemDisjuntor(uso.disjuntor.motivo, uso.disjuntor.unidade, uso.disjuntor.valores));
      err.code = 'DISJUNTOR_DISPARADO';
      err.detalhes = uso.disjuntor;
      throw err;
    }
    verificarUnidade(sess);

    const tetos = tetosDe(sess);
    const base = custo.estimarCustoChamada(params);
    if (!temTeto(tetos)) return { token: null, base, valor: 0 };

    const valor = base * fatorDe(uso, etapa) * (1 + tetos.margemPct / 100);
    const escopos = escoposDe(sess, etapa, tetos);
    const r = reservar(escopos, valor);
    if (!r.ok) pausar(sess, r.escopo, valor);
    return { token: r.token, base, valor };
  }

  function contabilizar(sess, etapa, { modelo, custoUsd, usage, base, tarifaUsd = 0 }) {
    const uso = usoDe(sess);
    const hoje = hojeLocal(agora());
    uso.dias[hoje] = { usd: arred((uso.dias[hoje]?.usd || 0) + custoUsd) };
    const e = uso.etapas[etapa] || { usd: 0, chamadas: 0 };
    uso.etapas[etapa] = { usd: arred(e.usd + custoUsd), chamadas: e.chamadas + 1 };
    if (modelo) {
      const m = uso.modelos[modelo] || { usd: 0, chamadas: 0, tokensEntrada: 0, tokensSaida: 0 };
      uso.modelos[modelo] = {
        usd: arred(m.usd + custoUsd), chamadas: m.chamadas + 1,
        tokensEntrada: m.tokensEntrada + (usage?.prompt_tokens || 0), tokensSaida: m.tokensSaida + (usage?.completion_tokens || 0)
      };
    }
    const real = custoUsd - tarifaUsd;
    if (base > 0 && real > 0) {
      const c = uso.calibracao[etapa] || { fator: 1, n: 0 };
      c.fator = arred(limitar(c.fator * (1 - ALFA_CALIBRACAO) + (real / base) * ALFA_CALIBRACAO, FATOR_MIN, FATOR_MAX), 4);
      c.n += 1;
      uso.calibracao[etapa] = c;
    }
    const unidade = unidadeAls.getStore();
    if (unidade) unidade.custo += custoUsd;
  }

  function verificarAlertas(sess, etapa) {
    const uso = usoDe(sess);
    const tetos = tetosDe(sess);
    if (!temTeto(tetos)) return;
    for (const e of escoposDe(sess, etapa, tetos)) {
      if (e.tetoUsd === null || e.tetoUsd <= 0) continue;
      const pct = (e.gastoUsd / e.tetoUsd) * 100;
      if (pct < tetos.alertaPct) continue;
      const chave = `${e.nome}:${e.nome === 'dia' ? hojeLocal(agora()) + ':' : ''}${e.tetoUsd}`;
      if (uso.alertas[chave]) continue;
      uso.alertas[chave] = agora().toISOString();
      emitir({ type: 'alerta_orcamento', escopo: e.nome, gastoUsd: arred(e.gastoUsd, 4), tetoUsd: arred(e.tetoUsd, 4), pct: Math.round(pct) });
      logger.warn(`[orcamento] alerta: escopo ${e.nome} em ${Math.round(pct)}% do teto (US$ ${e.gastoUsd.toFixed(4)} de US$ ${e.tetoUsd.toFixed(2)})`);
      uso.degradarPendente = true;
    }
  }

  // Acerta uma chamada: libera a reserva e contabiliza o custo real (se houve).
  function depois(sess, etapa, reserva, { modelo, custoUsd, usage, tarifaUsd = 0, erro = false } = {}) {
    if (reserva?.token) liberar(reserva.token);
    const ok = typeof custoUsd === 'number' && custoUsd >= 0 && !Number.isNaN(custoUsd);
    if (ok) {
      const tetos = tetosDe(sess);
      if (tetos.dia !== null) somarDiario(custoUsd);
      contabilizar(sess, etapa, { modelo, custoUsd, usage, base: reserva?.base || 0, tarifaUsd });
      verificarAlertas(sess, etapa);
      gravarUso(sess);
    }
    if (!erro) errosSeguidos.delete(etapa);
  }

  // Erro repetido: o mesmo código N vezes em sequência na mesma etapa. Devolve o erro do
  // disjuntor (para o chamador lançar) ou null.
  function registrarErro(sess, etapa, err) {
    if (!err || err.code === 'ORCAMENTO_EXCEDIDO' || err.code === 'DISJUNTOR_DISPARADO' || err.name === 'APIUserAbortError') return null;
    const codigo = String(err.status ?? err.code ?? err.name ?? 'erro');
    const atual = errosSeguidos.get(etapa);
    const n = atual && atual.codigo === codigo ? atual.n + 1 : 1;
    errosSeguidos.set(etapa, { codigo, n });
    const { errosSeguidos: limite } = limitesDisjuntor(sess);
    if (n >= limite) {
      errosSeguidos.delete(etapa);
      return disparar(sess, 'erro_repetido', { unidade: etapa, valores: { codigo, vezes: n } });
    }
    return null;
  }

  // ── Política do juiz em cascata ─────────────────────────────────────────────
  function decidirJuizForte(sess, { ganho, divergencia }) {
    const politica = perfil(sess).juizForte;
    if (politica === 'nunca') return false;
    if (politica === 'sempre') return true;
    const margem = numPositivo(env.JUIZ_MARGEM_GANHO) ?? 0.05;
    const divMax = numPositivo(env.JUIZ_DIVERGENCIA_MAX) ?? 0.3;
    const limiar = EPSILON_GANHO_PADRAO;
    return (Number.isFinite(ganho) && Math.abs(ganho - limiar) <= margem) || (Number.isFinite(divergencia) && divergencia > divMax);
  }

  // ── Gatilhos explícitos (continuações, ciclo sem ganho) ─────────────────────
  function gatilhoContinuacoes(sess, unidade) {
    return disparar(sess, 'continuacoes', { unidade });
  }

  // Ciclo de melhoria sem ganho: interrompe nos perfis Econômico/Padrão, só avisa no Premium.
  function gatilhoSemGanho(sess, ganhoMedio) {
    const { ganhoMin } = limitesDisjuntor(sess);
    if (!(ganhoMedio < ganhoMin)) return { interrompe: false };
    if (perfil(sess).disjuntorSemGanho === 'avisa') return { interrompe: false, aviso: true, ganhoMedio, ganhoMin };
    return { interrompe: true, erro: disparar(sess, 'sem_ganho', { unidade: 'ciclo de melhoria', valores: { ganhoMedio: arred(ganhoMedio, 4), ganhoMin } }) };
  }

  const limiteContinuacoes = (sess, base) => base + limitesDisjuntor(sess).continuacoesExtra;
  const unidadePulada = (sess, chave) => !!usoDe(sess).puladas?.[chave];

  // ── Consulta e ajuste (GET/POST /api/orcamento) ─────────────────────────────
  function linhaEscopo(e) {
    return {
      tetoUsd: e.tetoUsd,
      gastoUsd: arred(e.gastoUsd, 4),
      restanteUsd: e.tetoUsd === null ? null : arred(Math.max(0, e.tetoUsd - e.gastoUsd - reservadoEm(e.chave)), 4)
    };
  }

  function estado(sess, etapaAtual = null) {
    const uso = usoDe(sess);
    const tetos = tetosDe(sess);
    const escopos = escoposDe(sess, etapaAtual || '_', tetos);
    const porNome = Object.fromEntries(escopos.map(e => [e.nome, linhaEscopo(e)]));
    const etapas = Object.fromEntries(Object.entries(uso.etapas).map(([nome, v]) => [nome, {
      gastoUsd: v.usd, chamadas: v.chamadas,
      restanteUsd: tetos.etapa === null ? null : arred(Math.max(0, tetos.etapa - v.usd), 4)
    }]));
    const cfg = lerPerfisConfig();
    const p = perfil(sess);
    const precos = require('./observabilidade').carregarPrecos();
    return {
      ativo: temTeto(tetos),
      projeto: porNome.projeto,
      dia: porNome.dia,
      etapa: { tetoUsd: tetos.etapa, porEtapa: etapas },
      alertaPct: tetos.alertaPct,
      margemPct: tetos.margemPct,
      porModelo: uso.modelos,
      perfil: { id: p.id, rotulo: p.rotulo, parametros: { ...p, id: undefined, rotulo: undefined } },
      perfis: cfg.ordem.map(id => ({ id, rotulo: cfg.perfis[id]?.rotulo || id })),
      degradacaoAutomatica: String(env.CUSTO_DEGRADACAO_AUTOMATICA || '').toLowerCase() !== 'false',
      pausa: uso.pausa,
      disjuntor: uso.disjuntor && !uso.disjuntor.resolvido ? uso.disjuntor : null,
      limites: limitesDisjuntor(sess),
      calibracao: uso.calibracao,
      tarifaBuscaWebConfigurada: Number(precos.buscaWebPorChamadaUsd) > 0,
      modelos: modelos.modelosPorPapel(),
      avisosModelos: validarModelos()
    };
  }

  // Saldo restante mínimo entre os escopos com teto (null sem nenhum teto).
  function saldoRestante(sess, etapa) {
    const lista = escoposDe(sess, etapa).filter(e => e.tetoUsd !== null)
      .map(e => ({ escopo: e.nome, restanteUsd: Math.max(0, e.tetoUsd - e.gastoUsd - reservadoEm(e.chave)) }));
    if (!lista.length) return { restanteUsd: null, escopos: [] };
    return { restanteUsd: arred(Math.min(...lista.map(l => l.restanteUsd)), 4), escopos: lista.map(l => ({ ...l, restanteUsd: arred(l.restanteUsd, 4) })) };
  }

  const DECISOES = ['aumentar-limite', 'trocar-perfil', 'pular'];

  function ajustar(sess, corpo = {}) {
    const uso = usoDe(sess);
    const cfg = lerPerfisConfig();
    const mudou = { tetos: false, perfil: false };

    if (corpo.tetos !== undefined) {
      if (typeof corpo.tetos !== 'object' || corpo.tetos === null) return { erro: 'tetos deve ser um objeto com projeto, dia e/ou etapa.' };
      for (const [k, v] of Object.entries(corpo.tetos)) {
        if (!['projeto', 'dia', 'etapa'].includes(k)) return { erro: `Escopo de teto desconhecido: ${k}.` };
        if (v !== null && numPositivo(v) === null) return { erro: `O teto "${k}" deve ser um número positivo (ou null para remover o ajuste).` };
      }
      for (const [k, v] of Object.entries(corpo.tetos)) {
        if (v === null) delete uso.tetos[k]; else uso.tetos[k] = Number(v);
      }
      mudou.tetos = true;
    }
    if (corpo.perfil !== undefined) {
      if (!(corpo.perfil in cfg.perfis)) return { erro: `Perfil desconhecido: ${corpo.perfil}.` };
      uso.perfil = corpo.perfil;
      uso.degradarPendente = false;
      mudou.perfil = true;
    }
    if (corpo.decisao !== undefined) {
      if (!DECISOES.includes(corpo.decisao)) return { erro: `Decisão desconhecida: ${corpo.decisao}.` };
      if (!uso.disjuntor || uso.disjuntor.resolvido) return { erro: 'Não há disparo do disjuntor aguardando decisão.' };
      const d = uso.disjuntor;
      if (corpo.decisao === 'trocar-perfil') {
        if (!(corpo.perfil in cfg.perfis)) return { erro: 'Informe o perfil para a decisão trocar-perfil.' };
      } else if (corpo.decisao === 'aumentar-limite') {
        const v = corpo.valor === undefined ? null : numPositivo(corpo.valor);
        if (corpo.valor !== undefined && v === null) return { erro: 'valor deve ser um número positivo.' };
        const l = limitesDisjuntor(sess);
        if (d.motivo === 'custo') uso.limites.fatorCusto = v ?? l.fatorCusto * 1.5;
        else if (d.motivo === 'erro_repetido') uso.limites.errosSeguidos = v ?? l.errosSeguidos + 2;
        else if (d.motivo === 'sem_ganho') uso.limites.ganhoMin = v ?? l.ganhoMin / 2;
        else if (d.motivo === 'continuacoes') uso.limites.continuacoesExtra = l.continuacoesExtra + (v ?? 1);
      } else if (corpo.decisao === 'pular') {
        if (d.unidade) uso.puladas[d.unidade] = true;
      }
      uso.disjuntor = null;
      logger.info(`[disjuntor] decisão do usuário: ${corpo.decisao}`);
    }
    if (mudou.tetos || mudou.perfil) uso.pausa = null;
    gravarUso(sess);
    return { ok: true };
  }

  return {
    // estado e persistência
    usoDe, carregarUso, gravarUso, estado, saldoRestante, ajustar,
    ativo: (sess) => temTeto(tetosDe(sess)),
    // fluxo de cada chamada
    antes, depois, registrarErro, emUnidade, verificarUnidade,
    // perfis e papéis
    perfil, aplicarDegradacao, decidirJuizForte, limiteContinuacoes, unidadePulada,
    modeloPara(sess, nome, original) {
      const papel = modelos.papelDaChamada(nome);
      if (!papel) return original;
      return modelos.resolverModelo(papel, { modeloRedacao: perfil(sess).modeloRedacao, original });
    },
    papelDe: (nome) => modelos.papelDaChamada(nome),
    // disjuntor
    gatilhoContinuacoes, gatilhoSemGanho, limitesDisjuntor, disparar,
    // internos expostos para testes
    fatorCalibracao: (sess, etapa) => fatorDe(usoDe(sess), etapa),
    _tetosDe: tetosDe, _reservas: reservas
  };
}

module.exports = { criarGovernanca, validarModelos, usoVazio, lerPerfisConfig, EPSILON_GANHO_PADRAO };
