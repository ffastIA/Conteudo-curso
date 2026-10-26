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

module.exports = { estimarEtapa, estimarCustoChamada, estimarTokens, verificarOrcamento, lerOrcamento, tarifaBuscaWeb, custoBlocoBuscaMini, criarDisjuntor, PERFIS };
