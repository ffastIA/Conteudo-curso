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
    economico: { rotulo: 'Econômico', consultasPesquisa: 2, contextoBusca: 'low', modeloRedacao: 'economia', ciclosMelhoriaMax: 1, achadosDossie: 3, juizForte: 'nunca', disjuntorSemGanho: 'interrompe' },
    padrao: { rotulo: 'Padrão', consultasPesquisa: 4, contextoBusca: 'medium', modeloRedacao: 'conteudo', ciclosMelhoriaMax: 2, achadosDossie: 6, juizForte: 'duvidoso', disjuntorSemGanho: 'interrompe' },
    premium: { rotulo: 'Premium', consultasPesquisa: 5, contextoBusca: 'high', modeloRedacao: 'juiz', ciclosMelhoriaMax: 3, achadosDossie: 8, juizForte: 'sempre', disjuntorSemGanho: 'avisa' }
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
    alertas: {}, pausa: null, disjuntor: null, disparos: [], puladas: {},
    modelosEscolhidos: {}, // escolha do usuário por papel (change selecao-de-modelo-na-tela); `modelos` acima é o gasto por modelo
    consumo: { porEtapa: {}, porDia: {} } // tokens brutos por etapa/dia × modelo (change consumo-de-tokens-com-valor); o US$ é calculado na leitura
  };
}

const ehObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Garante a forma de `uso.consumo` (arquivo antigo, sem o campo, ou com tipo inválido, vira consumo vazio).
function garantirConsumo(uso) {
  if (!ehObjeto(uso.consumo)) uso.consumo = {};
  if (!ehObjeto(uso.consumo.porEtapa)) uso.consumo.porEtapa = {};
  if (!ehObjeto(uso.consumo.porDia)) uso.consumo.porDia = {};
  return uso.consumo;
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
function validarModelos(porPapel = modelos.modelosPorPapel(), tabela = lerCapacidades(), perfis = lerPerfisConfig().perfis) {
  const avisos = [];
  // O modelo de pesquisa que um perfil define (modeloPesquisa) também é conferido, como papel "pesquisa".
  const conferencias = Object.entries(porPapel).map(([papel, modelo]) => ({ papel, modelo, rotulo: papel }));
  for (const [id, p] of Object.entries(perfis || {})) {
    if (p?.modeloPesquisa) conferencias.push({ papel: 'pesquisa', modelo: p.modeloPesquisa, rotulo: `pesquisa, perfil ${p.rotulo || id}` });
  }
  for (const { papel, modelo, rotulo } of conferencias) {
    const conhecido = (tabela.modelos || {})[modelo];
    const exigidas = (tabela.exigencias || {})[papel] || [];
    if (!conhecido) {
      avisos.push({ papel, modelo, tipo: 'nao_conferido', mensagem: `O modelo "${modelo}" (papel ${rotulo}) não está na tabela de capacidades — a capacidade não pôde ser conferida.` });
      continue;
    }
    for (const cap of exigidas) {
      if (conhecido[cap] !== true) {
        avisos.push({ papel, modelo, tipo: 'sem_capacidade', capacidade: cap, mensagem: `O modelo "${modelo}" (papel ${rotulo}) está marcado sem "${cap}", que o papel exige.` });
      }
    }
  }
  return avisos;
}

// Modelos que o usuário pode escolher para um papel (change selecao-de-modelo-na-tela): com preço
// (senão o custo ficaria cego) e capacidades conhecidos, cumprindo as exigências do papel.
function modelosPermitidos(papel, precos = require('./observabilidade').carregarPrecos(), tabela = lerCapacidades()) {
  const exigidas = (tabela.exigencias || {})[papel] || [];
  return Object.keys(precos.porMilhaoDeTokens || {}).filter(m => {
    const c = (tabela.modelos || {})[m];
    return !!c && exigidas.every(cap => c[cap] === true);
  });
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
      garantirConsumo(sess.uso);
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
  // O arquivo é relido a cada uso (é minúsculo): assim o total reflete outros projetos e processos.
  let diarioDesligado = false;
  const arquivoDiario = () => (env.USO_DIARIO_FILE || arquivoDiarioPadrao);

  function totalDiario() {
    if (diarioDesligado) return 0;
    const hoje = hojeLocal(agora());
    try {
      const j = JSON.parse(fs.readFileSync(arquivoDiario(), 'utf-8'));
      return j && j.data === hoje && Number.isFinite(j.totalUsd) ? j.totalUsd : 0; // outra data: o dia virou
    } catch (err) {
      if (err.code === 'ENOENT') return 0;
      diarioDesligado = true;
      avisarUma('diario', `[orcamento] o arquivo de gasto diário não pôde ser lido (${err.message}) — teto diário desligado`);
      return 0;
    }
  }

  function somarDiario(usd) {
    const total = totalDiario();
    if (diarioDesligado) return;
    try {
      const tmp = `${arquivoDiario()}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify({ data: hojeLocal(agora()), totalUsd: arred(total + usd) }, null, 2), 'utf-8');
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
    const usd = (n) => n.toFixed(n < 1 ? 4 : 2); // tetos pequenos precisam de mais casas para não aparecerem como 0,00
    const err = new Error(
      `Orçamento ${nomeEscopo} atingido: custo acumulado US$ ${usd(escopo.gastoUsd)} + próxima chamada ~US$ ${usd(estimativaUsd)} ` +
      `ultrapassa o teto de US$ ${usd(escopo.tetoUsd)} (${varTeto}). Aumente o teto ou troque o perfil e execute a etapa de novo para continuar de onde parou.`);
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
      continuacoesExtra: Math.max(0, Math.floor(Number(l.continuacoesExtra) || 0)),
      ciclosExtra: Math.max(0, Math.floor(Number(l.ciclosExtra) || 0))
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
      case 'limite_ciclos': return `Disjuntor: o perfil de custo permite ${valores.max} ciclo(s) de melhoria e este projeto já tem ${valores.ciclos}.${fim}`;
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

  // Escolha do usuário para o papel, se existir e ainda for permitida (senão é ignorada, com aviso).
  function escolhaDoPapel(sess, papel) {
    const escolhido = usoDe(sess).modelosEscolhidos?.[papel];
    if (!escolhido) return null;
    if (modelosPermitidos(papel).includes(escolhido)) return escolhido;
    avisarUma(`escolha-${papel}-${escolhido}`, `[orcamento] a escolha "${escolhido}" para o papel ${papel} não é mais permitida (sem preço ou capacidade) — usando o padrão do perfil`);
    return null;
  }

  // Modelo efetivo do papel: escolha do usuário > resolução do perfil e das variáveis (como antes).
  function modeloDoPapel(sess, papel, original) {
    const escolhido = escolhaDoPapel(sess, papel);
    if (escolhido) return escolhido;
    const padrao = original ?? modelos.modelosPorPapel()[papel];
    if (papel === 'pesquisa') return perfil(sess).modeloPesquisa || padrao;
    return modelos.resolverModelo(papel, { modeloRedacao: perfil(sess).modeloRedacao, original: padrao });
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
  // Disparo anterior ainda sem decisão do usuário: devolve o erro (e reemite o evento) em vez de gastar.
  function bloqueioPendente(sess) {
    const uso = usoDe(sess);
    if (!uso.disjuntor || uso.disjuntor.resolvido) return null;
    emitir({ type: 'disjuntor', motivo: uso.disjuntor.motivo, unidade: uso.disjuntor.unidade, valores: uso.disjuntor.valores, opcoes: ['aumentar-limite', 'trocar-perfil', 'pular'] });
    const err = new Error(mensagemDisjuntor(uso.disjuntor.motivo, uso.disjuntor.unidade, uso.disjuntor.valores));
    err.code = 'DISJUNTOR_DISPARADO';
    err.detalhes = uso.disjuntor;
    return err;
  }

  function antes(sess, etapa, params) {
    const uso = usoDe(sess);
    const pendente = bloqueioPendente(sess);
    if (pendente) throw pendente;
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
  // Soma os tokens da chamada (por etapa e por dia, em cada modelo) em uso.consumo. Vale também para
  // modelo sem preço (custoUsd nulo): os tokens aparecem no relatório, só o valor fica indisponível.
  function registrarConsumo(sess, etapa, modelo, usage, buscasWeb) {
    const consumo = garantirConsumo(usoDe(sess));
    const dia = hojeLocal(agora());
    const entrada = Number(usage.prompt_tokens) || 0;
    const emCache = require('./observabilidade').tokensEmCache(usage);
    const saida = Number(usage.completion_tokens) || 0;
    for (const grupo of [consumo.porEtapa[etapa] ||= {}, consumo.porDia[dia] ||= {}]) {
      const c = grupo[modelo] ||= { chamadas: 0, tokensEntrada: 0, tokensEntradaEmCache: 0, tokensSaida: 0, buscasWeb: 0 };
      c.chamadas += 1;
      c.tokensEntrada += entrada;
      c.tokensEntradaEmCache += emCache;
      c.tokensSaida += saida;
      c.buscasWeb += buscasWeb;
    }
  }

  function depois(sess, etapa, reserva, { modelo, custoUsd, usage, tarifaUsd = 0, buscasWeb = 0, erro = false } = {}) {
    if (reserva?.token) liberar(reserva.token);
    const ok = typeof custoUsd === 'number' && custoUsd >= 0 && !Number.isNaN(custoUsd);
    const temConsumo = !!modelo && !!usage && typeof usage === 'object';
    if (temConsumo) registrarConsumo(sess, etapa, modelo, usage, Number(buscasWeb) || 0);
    if (!ok && temConsumo) gravarUso(sess);
    if (ok) {
      const tetos = tetosDe(sess);
      if (tetos.dia !== null) somarDiario(custoUsd);
      contabilizar(sess, etapa, { modelo, custoUsd, usage, base: reserva?.base || 0, tarifaUsd });
      verificarAlertas(sess, etapa);
      gravarUso(sess);
    }
    if (!erro) errosSeguidos.delete(`${chaveProjeto(sess)}:${etapa}`);
  }

  // Erro repetido: o mesmo código N vezes em sequência na mesma etapa. Devolve o erro do
  // disjuntor (para o chamador lançar) ou null.
  function registrarErro(sess, etapa, err) {
    if (!err || err.code === 'ORCAMENTO_EXCEDIDO' || err.code === 'DISJUNTOR_DISPARADO' || err.name === 'APIUserAbortError') return null;
    const codigo = String(err.status ?? err.code ?? err.name ?? 'erro');
    const chave = `${chaveProjeto(sess)}:${etapa}`;
    const atual = errosSeguidos.get(chave);
    const n = atual && atual.codigo === codigo ? atual.n + 1 : 1;
    errosSeguidos.set(chave, { codigo, n });
    const { errosSeguidos: limite } = limitesDisjuntor(sess);
    if (n >= limite) {
      errosSeguidos.delete(chave);
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

  // Limite de ciclos de melhoria do perfil ativo (mais os que o usuário liberou). Devolve o erro ou null.
  // Só vale com algum teto configurado ou com um perfil escolhido de propósito (CUSTO_PERFIL ou a tela):
  // sem isso o comportamento anterior (ciclos ilimitados) é mantido.
  function gatilhoLimiteCiclos(sess, ciclos) {
    const explicito = !!usoDe(sess).perfil || !!(env.CUSTO_PERFIL || '').trim();
    if (!explicito && !temTeto(tetosDe(sess))) return null;
    const max = (Number(perfil(sess).ciclosMelhoriaMax) || 0) + limitesDisjuntor(sess).ciclosExtra;
    if (!(max > 0) || ciclos < max) return null;
    return disparar(sess, 'limite_ciclos', { unidade: 'ciclo de melhoria', valores: { ciclos, max } });
  }

  const limiteContinuacoes = (sess, base) => base + limitesDisjuntor(sess).continuacoesExtra;
  const unidadePulada = (sess, chave) => !!usoDe(sess).puladas?.[chave];
  const limparPulada = (sess, chave) => { const p = usoDe(sess).puladas; if (p && p[chave]) { delete p[chave]; gravarUso(sess); } };
  const rotuloUnidade = () => unidadeAls.getStore()?.rotulo || null;

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
      perfil: {
        id: p.id, rotulo: p.rotulo, parametros: { ...p, id: undefined, rotulo: undefined },
        modeloPesquisa: p.modeloPesquisa || modelos.modelosPorPapel().pesquisa
      },
      perfis: cfg.ordem.map(id => ({ id, rotulo: cfg.perfis[id]?.rotulo || id })),
      degradacaoAutomatica: String(env.CUSTO_DEGRADACAO_AUTOMATICA || '').toLowerCase() !== 'false',
      pausa: uso.pausa,
      disjuntor: uso.disjuntor && !uso.disjuntor.resolvido ? uso.disjuntor : null,
      limites: limitesDisjuntor(sess),
      calibracao: uso.calibracao,
      tarifaBuscaWebConfigurada: Number(precos.buscaWebPorChamadaUsd) > 0,
      modelos: Object.fromEntries(modelos.PAPEIS.map(papel => [papel, modeloDoPapel(sess, papel)])),
      modelosOrigem: Object.fromEntries(modelos.PAPEIS.map(papel => [papel, escolhaDoPapel(sess, papel) ? 'usuario' : 'perfil'])),
      modelosEscolhidos: Object.fromEntries(modelos.PAPEIS.filter(papel => escolhaDoPapel(sess, papel)).map(papel => [papel, uso.modelosEscolhidos[papel]])),
      modelosDisponiveis: Object.fromEntries(modelos.PAPEIS.map(papel => [papel, modelosPermitidos(papel, precos)])),
      avisosModelos: validarModelos()
    };
  }

  // Insumos do relatório de consumo (GET /api/consumo): contadores brutos e gasto registrado por modelo.
  function consumoDe(sess) {
    const uso = usoDe(sess);
    return { consumo: garantirConsumo(uso), registrado: { modelos: uso.modelos } };
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
    const mudou = { tetos: false, perfil: false, modelos: false };
    const avisos = [];

    // Validação da escolha de modelos antes de qualquer alteração (nada muda se algo for inválido).
    if (corpo.modelos !== undefined) {
      if (typeof corpo.modelos !== 'object' || corpo.modelos === null || Array.isArray(corpo.modelos)) return { erro: 'modelos deve ser um objeto papel → modelo.' };
      for (const [papel, m] of Object.entries(corpo.modelos)) {
        if (!modelos.PAPEIS.includes(papel)) return { erro: `Papel de modelo desconhecido: ${papel}.` };
        if (m !== null && !modelosPermitidos(papel).includes(m)) return { erro: `O modelo "${m}" não é permitido para o papel ${papel}.` };
      }
    }

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
    if (corpo.modelos !== undefined) {
      if (!uso.modelosEscolhidos || typeof uso.modelosEscolhidos !== 'object') uso.modelosEscolhidos = {};
      for (const [papel, m] of Object.entries(corpo.modelos)) {
        if ((uso.modelosEscolhidos[papel] || null) === m) continue;
        if (m === null) delete uso.modelosEscolhidos[papel]; else uso.modelosEscolhidos[papel] = m;
        mudou.modelos = true;
      }
      if (mudou.modelos && (Number(sess.custoProjetoUsd) || 0) > 0) {
        avisos.push('Este projeto já gerou conteúdo com outro modelo: o texto anterior não será refeito e a calibração da estimativa pode misturar modelos.');
      }
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
        else if (d.motivo === 'limite_ciclos') {
          const base = Number(perfil(sess).ciclosMelhoriaMax) || 0;
          uso.limites.ciclosExtra = v !== null ? l.ciclosExtra + Math.floor(v) : Math.max(l.ciclosExtra + 1, (Number(d.valores?.ciclos) || 0) + 1 - base);
        }
      } else if (corpo.decisao === 'pular') {
        if (d.unidade) uso.puladas[d.unidade] = true;
      }
      uso.disjuntor = null;
      logger.info(`[disjuntor] decisão do usuário: ${corpo.decisao}`);
    }
    if (mudou.tetos || mudou.perfil || mudou.modelos) uso.pausa = null;
    gravarUso(sess);
    return avisos.length ? { ok: true, avisos } : { ok: true };
  }

  return {
    // estado e persistência
    usoDe, carregarUso, gravarUso, estado, saldoRestante, ajustar, consumoDe,
    ativo: (sess) => temTeto(tetosDe(sess)),
    // fluxo de cada chamada
    antes, depois, registrarErro, emUnidade, verificarUnidade,
    // perfis e papéis
    perfil, aplicarDegradacao, decidirJuizForte, limiteContinuacoes, unidadePulada, limparPulada, rotuloUnidade,
    modeloPara(sess, nome, original) {
      const papel = modelos.papelDaChamada(nome);
      if (!papel) return original;
      const escolhido = escolhaDoPapel(sess, papel);
      if (escolhido) return escolhido;
      return modelos.resolverModelo(papel, { modeloRedacao: perfil(sess).modeloRedacao, original });
    },
    modeloDoPapel, modelosPermitidos,
    papelDe: (nome) => modelos.papelDaChamada(nome),
    // disjuntor
    gatilhoContinuacoes, gatilhoSemGanho, gatilhoLimiteCiclos, bloqueioPendente, limitesDisjuntor, disparar,
    disjuntorPendente: (sess) => !!(usoDe(sess).disjuntor && !usoDe(sess).disjuntor.resolvido),
    // internos expostos para testes
    fatorCalibracao: (sess, etapa) => fatorDe(usoDe(sess), etapa),
    _tetosDe: tetosDe, _reservas: reservas
  };
}

module.exports = { criarGovernanca, validarModelos, modelosPermitidos, usoVazio, lerPerfisConfig, EPSILON_GANHO_PADRAO };
