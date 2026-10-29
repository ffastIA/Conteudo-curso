'use strict';

// Estimativa prévia de custo, trava de orçamento e disjuntor (change
// custo-e-logs). Usa a mesma tabela de preços e a mesma função de custo da
// observabilidade (config/precos-modelos.json), então o painel e o app mostram
// os mesmos números. É estimativa: sempre uma faixa, rotulada como tal.

const { calcularCusto, carregarPrecos } = require('./observabilidade');

// Perfis por unidade (módulo ou aula), calibrados com a linha de base real
// (docs/baseline/capcut/geracao_log.json, curso de 3 aulas, geração por seções):
//   pesquisa por módulo: 1 chamada, ~19 mil tokens de entrada e ~1,7 mil de saída
//   conteúdo por aula:   ~8 chamadas, ~108 mil de entrada e ~4,1 mil de saída
//   revisão por aula:    ~18 mil de entrada e ~0,9 mil de saída
// A faixa vai de 0,7× a 1,6× do valor calibrado.
const PERFIS = {
  'pesquisa-modulos': { unidade: 'módulo', entrada: 19_000, saida: 1_700, modelo: 'pesquisa' },
  conteudo: { unidade: 'aula', entrada: 108_000, saida: 4_100, modelo: 'economia' },
  revisao: { unidade: 'aula', entrada: 18_000, saida: 900, modelo: 'economia' }
};
const FAIXA_MIN = 0.7;
const FAIXA_MAX = 1.6;

// Aproximação por caracteres (≈ 4 por token em português).
const estimarTokens = (texto) => Math.ceil(String(texto || '').length / 4);

function estimarEtapa(etapa, { unidades, modelos, precos = carregarPrecos(), fator = 1 }) {
  const perfil = PERFIS[etapa];
  if (!perfil) return null;
  const n = Math.max(0, Math.floor(unidades) || 0);
  const modelo = modelos[perfil.modelo];
  const entrada = perfil.entrada * n;
  const saida = perfil.saida * n;
  const base = calcularCusto({ prompt_tokens: entrada, completion_tokens: saida }, modelo, precos);
  const k = Number.isFinite(fator) && fator > 0 ? fator : 1; // calibração com o uso real (orcamento.js)
  return {
    etapa,
    unidade: perfil.unidade,
    unidades: n,
    modelo,
    tokens: {
      entrada, saida, total: entrada + saida,
      minimo: Math.round((entrada + saida) * FAIXA_MIN),
      maximo: Math.round((entrada + saida) * FAIXA_MAX)
    },
    custoUsd: base === null ? null : {
      minimo: Number((base * k * FAIXA_MIN).toFixed(4)),
      esperado: Number((base * k).toFixed(4)),
      maximo: Number((base * k * FAIXA_MAX).toFixed(4))
    },
    fatorCalibracao: k,
    estimativa: true
  };
}

// Custo estimado de UMA chamada (para a trava de orçamento): entrada medida
// pelo tamanho do prompt e saída esperada = metade do teto de tokens pedido.
function estimarCustoChamada(params, precos = carregarPrecos()) {
  const texto = params?.messages ? JSON.stringify(params.messages)
    : `${params?.instructions || ''}${typeof params?.input === 'string' ? params.input : JSON.stringify(params?.input || '')}`;
  const teto = params?.max_tokens ?? params?.max_output_tokens ?? 2000;
  const custo = calcularCusto(
    { prompt_tokens: estimarTokens(texto), completion_tokens: Math.round(teto / 2) },
    params?.model, precos);
  return custo ?? 0;
}

// Teto do projeto: ORCAMENTO_MAX_USD (ORCAMENTO_USD segue valendo como sinônimo).
const lerOrcamento = (env = process.env) => {
  for (const nome of ['ORCAMENTO_MAX_USD', 'ORCAMENTO_USD']) {
    const n = Number(env[nome]);
    if (env[nome] !== undefined && env[nome] !== '' && Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

// Cobrança por chamada da ferramenta de busca web (config/precos-modelos.json). Padrão 0.
const tarifaBuscaWeb = (precos = carregarPrecos()) => {
  const n = Number(precos.buscaWebPorChamadaUsd);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Bloco fixo de tokens de entrada que a OpenAI cobra por chamada de busca nos modelos mini
// (config/precos-modelos.json: buscaWebBlocoTokensMini). Só soma quando
// buscaWebBlocoTokensMiniSomar é true — ativado depois de confirmar, com uma chamada real,
// que o usage da resposta não o inclui. Modelos que não são mini (gpt-4o) nunca somam.
const custoBlocoBuscaMini = (modelo, buscas, precos = carregarPrecos()) => {
  if (precos.buscaWebBlocoTokensMiniSomar !== true || !/mini/i.test(String(modelo || ''))) return 0;
  const bloco = Number(precos.buscaWebBlocoTokensMini);
  const custoBloco = calcularCusto({ prompt_tokens: Number.isFinite(bloco) && bloco > 0 ? bloco : 0, completion_tokens: 0 }, modelo, precos);
  return (custoBloco || 0) * Math.max(0, buscas || 0);
};

// Valor em US$ de um conjunto de contadores brutos de UM modelo (change consumo-de-tokens-com-valor):
// tokens × tarifa da tabela de preços (mesma fórmula da cobrança interna) e, à parte, a busca web
// (chamadas × tarifa por chamada, mais o bloco fixo dos modelos mini quando ligado).
// Modelo sem preço → null.
function valorDoConsumo(c = {}, modelo, precos = carregarPrecos()) {
  const tokensUsd = calcularCusto({
    prompt_tokens: c.tokensEntrada || 0,
    completion_tokens: c.tokensSaida || 0,
    cached_tokens: c.tokensEntradaEmCache || 0
  }, modelo, precos);
  if (tokensUsd === null) return null;
  const buscas = c.buscasWeb || 0;
  const buscaUsd = buscas * tarifaBuscaWeb(precos) + custoBlocoBuscaMini(modelo, buscas, precos);
  return { tokensUsd, buscaUsd, totalUsd: tokensUsd + buscaUsd };
}

const CAMPOS_CONSUMO = ['chamadas', 'tokensEntrada', 'tokensEntradaEmCache', 'tokensSaida', 'buscasWeb'];
const arred6 = (n) => Number(Number(n).toFixed(6));

// Tarifa (US$ por 1 milhão de tokens) que casa com o modelo, pela mesma regra de prefixo mais longo.
function tarifaDoModelo(modelo, precos) {
  const tabela = precos.porMilhaoDeTokens || {};
  const chave = Object.keys(tabela)
    .filter(k => String(modelo).toLowerCase().startsWith(k.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
  if (!chave) return null;
  const { entrada = 0, saida = 0, entradaEmCache = entrada } = tabela[chave];
  return { entrada, entradaEmCache, saida };
}

// Agrega { modelo: contadores } em totais e valor; modelo sem preço entra nos tokens, não no valor.
function agregarModelos(mapa, precos) {
  const somas = Object.fromEntries(CAMPOS_CONSUMO.map(k => [k, 0]));
  let valorUsd = 0;
  const semPreco = [];
  for (const [modelo, c] of Object.entries(mapa || {})) {
    for (const k of CAMPOS_CONSUMO) somas[k] += c?.[k] || 0;
    const v = valorDoConsumo(c, modelo, precos);
    if (v === null) semPreco.push(modelo); else valorUsd += v.totalUsd;
  }
  return {
    chamadas: somas.chamadas,
    tokens: { entrada: somas.tokensEntrada, entradaEmCache: somas.tokensEntradaEmCache, saida: somas.tokensSaida },
    buscasWeb: somas.buscasWeb,
    valorUsd: arred6(valorUsd),
    semPreco
  };
}

// Relatório de consumo do projeto (GET /api/consumo): por modelo, por etapa e por dia, com o valor
// calculado pela tabela de preços atual e a conciliação com o gasto registrado pelo orçamento.
function relatorioDeConsumo({ consumo, registrado } = {}, precos = carregarPrecos()) {
  const porEtapaBruto = consumo?.porEtapa || {};
  const porDiaBruto = consumo?.porDia || {};
  const porModeloBruto = {};
  for (const mapa of Object.values(porEtapaBruto)) {
    for (const [modelo, c] of Object.entries(mapa || {})) {
      const t = porModeloBruto[modelo] ||= Object.fromEntries(CAMPOS_CONSUMO.map(k => [k, 0]));
      for (const k of CAMPOS_CONSUMO) t[k] += c?.[k] || 0;
    }
  }

  const buscaWeb = { chamadas: 0, tarifaPorChamadaUsd: tarifaBuscaWeb(precos), valorUsd: 0 };
  let tokensUsd = 0;
  const semPreco = [];
  const modelos = Object.entries(porModeloBruto).map(([modelo, c]) => {
    const v = valorDoConsumo(c, modelo, precos);
    if (v === null) semPreco.push(modelo);
    else { tokensUsd += v.tokensUsd; buscaWeb.chamadas += c.buscasWeb; buscaWeb.valorUsd += v.buscaUsd; }
    return {
      modelo,
      chamadas: c.chamadas,
      tokens: { entrada: c.tokensEntrada, entradaEmCache: c.tokensEntradaEmCache, saida: c.tokensSaida },
      buscasWeb: c.buscasWeb,
      tarifa: tarifaDoModelo(modelo, precos),
      valorUsd: v === null ? null : arred6(v.tokensUsd)
    };
  });
  buscaWeb.valorUsd = arred6(buscaWeb.valorUsd);
  const totalUsd = arred6(tokensUsd + buscaWeb.valorUsd);

  const quebra = (bruto) => Object.fromEntries(Object.entries(bruto).map(([chave, mapa]) => {
    const { semPreco: _ignorado, ...resto } = agregarModelos(mapa, precos);
    return [chave, resto];
  }));

  // Conciliação com o gasto que o orçamento registrou na hora de cada chamada.
  const regModelos = Object.values(registrado?.modelos || {});
  const registradoUsd = arred6(regModelos.reduce((s, m) => s + (m?.usd || 0), 0));
  const chamadasRegistradas = regModelos.reduce((s, m) => s + (m?.chamadas || 0), 0);
  const chamadasDetalhadas = modelos.reduce((s, m) => s + m.chamadas, 0);
  const parcial = chamadasRegistradas > chamadasDetalhadas;
  const diferencaUsd = arred6(totalUsd - registradoUsd);
  const divergente = !parcial && Math.abs(diferencaUsd) > Math.max(0.0001, registradoUsd * 0.01);

  return {
    moeda: precos.moeda || 'USD',
    vigenciaPrecos: precos.vigencia || null,
    modelos,
    buscaWeb,
    porEtapa: quebra(porEtapaBruto),
    porDia: quebra(porDiaBruto),
    totalUsd,
    registradoUsd,
    diferencaUsd,
    divergente,
    parcial,
    naoDetalhadoUsd: parcial ? arred6(Math.max(0, registradoUsd - totalUsd)) : 0,
    semPreco
  };
}

// Erro com mensagem clara (custo e teto) quando a próxima chamada estoura o orçamento.
function verificarOrcamento({ acumulado = 0, estimativa = 0, env = process.env }) {
  const teto = lerOrcamento(env);
  if (teto === null) return null;
  if (acumulado + estimativa <= teto) return null;
  const err = new Error(
    `Orçamento do projeto atingido: custo acumulado US$ ${acumulado.toFixed(4)} + próxima chamada ~US$ ${estimativa.toFixed(4)} ` +
    `ultrapassa o teto de US$ ${teto.toFixed(2)} (ORCAMENTO_USD). Aumente o teto ou revise o escopo.`);
  err.code = 'ORCAMENTO_EXCEDIDO';
  return err;
}

// Disjuntor: após `limite` falhas consecutivas, recusa novas chamadas por
// `esperaMs`, evitando gastar orçamento repetindo uma falha. Um sucesso zera.
function criarDisjuntor({ limite = 5, esperaMs = 60_000, agora = () => Date.now() } = {}) {
  let falhas = 0;
  let abertoAte = 0;
  return {
    verificar() {
      if (agora() < abertoAte) {
        const err = new Error(`Disjuntor aberto após ${limite} falhas consecutivas da API — aguarde ${Math.ceil((abertoAte - agora()) / 1000)}s e tente de novo.`);
        err.code = 'DISJUNTOR_ABERTO';
        return err;
      }
      return null;
    },
    sucesso() { falhas = 0; abertoAte = 0; },
    falha() {
      falhas += 1;
      if (falhas >= limite) { abertoAte = agora() + esperaMs; falhas = 0; }
    },
    estado: () => ({ falhas, aberto: agora() < abertoAte })
  };
}

module.exports = { estimarEtapa, estimarCustoChamada, estimarTokens, verificarOrcamento, lerOrcamento, tarifaBuscaWeb, custoBlocoBuscaMini, valorDoConsumo, relatorioDeConsumo, criarDisjuntor, PERFIS };
