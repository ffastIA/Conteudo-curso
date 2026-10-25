'use strict';

// Modelos da OpenAI usados pelas skills, configuráveis por ambiente (change
// docx-markdown-completo). Os padrões são os modelos atuais; as funções leem
// process.env na hora da chamada (depois do dotenv, e permitindo ajuste em testes).
//   OPENAI_RESEARCH_MODEL — pesquisa web (Responses API + web_search)
//   OPENAI_CONTENT_MODEL  — conteúdo das aulas (roteiro, seções, expansão)
//   OPENAI_ECONOMY_MODEL  — demais etapas (ementa, planos, avaliação, PPC…)
// Papéis da governança de custo (change governanca-de-custo), todos opcionais:
//   OPENAI_SUMMARY_MODEL  — resumos, roteiros e planos (padrão: economia)
//   OPENAI_EVAL_MODEL     — avaliação de primeira passada (padrão: economia)
//   OPENAI_JUDGE_MODEL    — juiz final das versões e o redator do perfil Premium (padrão: redação)

const MODEL_RESEARCH = 'gpt-4o';
const MODEL_ECONOMY = 'gpt-4o-mini';
const MODEL_CONTENT = MODEL_ECONOMY;

const doAmbiente = (nome, padrao) => (process.env[nome] || '').trim() || padrao;

const modeloPesquisa = () => doAmbiente('OPENAI_RESEARCH_MODEL', MODEL_RESEARCH);
const modeloEconomia = () => doAmbiente('OPENAI_ECONOMY_MODEL', MODEL_ECONOMY);
// O conteúdo herda o modelo de economia configurado quando OPENAI_CONTENT_MODEL não existe.
const modeloConteudo = () => doAmbiente('OPENAI_CONTENT_MODEL', modeloEconomia());

const modeloResumos = () => doAmbiente('OPENAI_SUMMARY_MODEL', modeloEconomia());
const modeloAvaliacao = () => doAmbiente('OPENAI_EVAL_MODEL', modeloEconomia());
const modeloJuiz = () => doAmbiente('OPENAI_JUDGE_MODEL', modeloConteudo());

const PAPEIS = ['pesquisa', 'resumos', 'redacao', 'avaliacao', 'juiz'];

// Modelo de cada papel, hoje (lê o ambiente na hora da chamada).
const modelosPorPapel = () => ({
  pesquisa: modeloPesquisa(),
  resumos: modeloResumos(),
  redacao: modeloConteudo(),
  avaliacao: modeloAvaliacao(),
  juiz: modeloJuiz()
});

// Papel de uma chamada ao LLM a partir do nome da generation (etapa.acao).
// Nome desconhecido ou genérico (openai.chat) → null: o modelo da skill vale.
function papelDaChamada(nome) {
  const n = String(nome || '');
  if (n === 'pesquisa.web') return 'pesquisa';
  if (/^score.juiz-final/.test(n)) return 'juiz';
  if (/^(conteudo|aplicar-melhorias)./.test(n)) return 'redacao';
  if (/^(revisao|qualidade|score)./.test(n)) return 'avaliacao';
  if (/^openai./.test(n) || !n) return null;
  return 'resumos';
}

// Modelo efetivo de uma chamada: a variável do papel (se definida) vence; para a
// redação vale o perfil de custo (economia | conteudo | juiz); senão, o da skill.
function resolverModelo(papel, { modeloRedacao = 'conteudo', original } = {}) {
  const definido = (nome) => (process.env[nome] || '').trim();
  if (papel === 'resumos' && definido('OPENAI_SUMMARY_MODEL')) return modeloResumos();
  if (papel === 'avaliacao' && definido('OPENAI_EVAL_MODEL')) return modeloAvaliacao();
  if (papel === 'juiz' && definido('OPENAI_JUDGE_MODEL')) return modeloJuiz();
  if (papel === 'redacao') {
    if (modeloRedacao === 'economia') return modeloEconomia();
    if (modeloRedacao === 'juiz') return modeloJuiz();
  }
  return original;
}

module.exports = {
  MODEL_RESEARCH, MODEL_ECONOMY, MODEL_CONTENT, PAPEIS,
  modeloPesquisa, modeloEconomia, modeloConteudo, modeloResumos, modeloAvaliacao, modeloJuiz,
  modelosPorPapel, papelDaChamada, resolverModelo
};
