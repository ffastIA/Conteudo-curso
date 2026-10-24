'use strict';

// Modelos da OpenAI usados pelas skills, configuráveis por ambiente (change
// docx-markdown-completo). Os padrões são os modelos atuais; as funções leem
// process.env na hora da chamada (depois do dotenv, e permitindo ajuste em testes).
//   OPENAI_RESEARCH_MODEL — pesquisa web (Responses API + web_search)
//   OPENAI_CONTENT_MODEL  — conteúdo das aulas (roteiro, seções, expansão)
//   OPENAI_ECONOMY_MODEL  — demais etapas (ementa, planos, avaliação, PPC…)

const MODEL_RESEARCH = 'gpt-4o';
const MODEL_ECONOMY = 'gpt-4o-mini';
const MODEL_CONTENT = MODEL_ECONOMY;

const doAmbiente = (nome, padrao) => (process.env[nome] || '').trim() || padrao;

const modeloPesquisa = () => doAmbiente('OPENAI_RESEARCH_MODEL', MODEL_RESEARCH);
const modeloEconomia = () => doAmbiente('OPENAI_ECONOMY_MODEL', MODEL_ECONOMY);
// O conteúdo herda o modelo de economia configurado quando OPENAI_CONTENT_MODEL não existe.
const modeloConteudo = () => doAmbiente('OPENAI_CONTENT_MODEL', modeloEconomia());

module.exports = { MODEL_RESEARCH, MODEL_ECONOMY, MODEL_CONTENT, modeloPesquisa, modeloEconomia, modeloConteudo };
