#!/usr/bin/env node
'use strict';

// Verificação MANUAL da API de busca web (change verificacao-pesquisa-e-prazos).
// Fora da suíte Jest e da CI: usa a chave real da OpenAI (OPENAI_API_KEY) e faz
// no máximo 1 chamada por variante. Uso:
//   node scripts/smoke-pesquisa.js                 # variantes padrão
//   SMOKE_MODEL_CHAT=gpt-4o SMOKE_MODEL_SEARCH=gpt-4o-search-preview \
//   SMOKE_MODEL_RESPONSES=gpt-4o node scripts/smoke-pesquisa.js
// Saída: tabela no console + docs/decisoes/pesquisa-api.json.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Mesmo carregamento de env do server.js (.env ou .env.encrypted + .env.key).
(function carregarEnv() {
  const envPath = path.join(ROOT, '.env');
  const encPath = path.join(ROOT, '.env.encrypted');
  const keyPath = path.join(ROOT, '.env.key');
  if (!fs.existsSync(envPath) && fs.existsSync(encPath) && fs.existsSync(keyPath)) {
    const { decryptEnv } = require('./env-crypto');
    const dotenv = require('dotenv');
    dotenv.populate(process.env, dotenv.parse(decryptEnv(encPath, keyPath)), { override: false });
  }
  require('dotenv').config({ path: envPath });
})();

const OpenAI = require('openai');

const CONSULTA = 'Quais são as principais ferramentas e referências atuais para ensinar Node.js a iniciantes? Cite as fontes.';
const MODELO_CHAT = process.env.SMOKE_MODEL_CHAT || 'gpt-4o';
const MODELO_SEARCH = process.env.SMOKE_MODEL_SEARCH || 'gpt-4o-search-preview';
const MODELO_RESPONSES = process.env.SMOKE_MODEL_RESPONSES || 'gpt-4o';
const TIMEOUT_MS = 90_000;

function dominio(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Classifica a resposta: `web` (≥1 url_citation), `sem_web` (2xx sem citações),
// `rejeitada` (erro 4xx — parâmetro/modelo não suportado) ou `erro`.
function classificar({ urls, erro }) {
  if (erro) return erro.status >= 400 && erro.status < 500 ? 'rejeitada' : 'erro';
  return urls.length ? 'web' : 'sem_web';
}

async function medir(nome, fn) {
  const inicio = Date.now();
  const r = { variante: nome, status: null, citacoes: 0, fontes: 0, dominios: 0, latenciaMs: 0, resultado: '', detalhe: '' };
  try {
    const urls = await fn();
    r.status = 200;
    r.citacoes = urls.length;
    r.fontes = new Set(urls).size;
    r.dominios = new Set(urls.map(dominio).filter(Boolean)).size;
    r.resultado = classificar({ urls });
  } catch (err) {
    r.status = err.status ?? null;
    r.resultado = classificar({ erro: { status: err.status || 0 } });
    r.detalhe = String(err.message || err).slice(0, 300);
  }
  r.latenciaMs = Date.now() - inicio;
  return r;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY ausente (.env ou .env.encrypted + .env.key).');
    process.exit(1);
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const opts = { signal: AbortSignal.timeout(TIMEOUT_MS) };

  const chatCitacoes = (completion) =>
    (completion.choices[0]?.message?.annotations || [])
      .filter(a => a.type === 'url_citation' && a.url_citation?.url)
      .map(a => a.url_citation.url);

  const resultados = [];
  resultados.push(await medir(`chat.completions ${MODELO_CHAT} + web_search_options`, async () =>
    chatCitacoes(await openai.chat.completions.create({
      model: MODELO_CHAT,
      web_search_options: { search_context_size: 'medium' },
      max_tokens: 800,
      messages: [{ role: 'user', content: CONSULTA }]
    }, opts))));

  resultados.push(await medir(`chat.completions ${MODELO_SEARCH} + web_search_options`, async () =>
    chatCitacoes(await openai.chat.completions.create({
      model: MODELO_SEARCH,
      web_search_options: { search_context_size: 'medium' },
      max_tokens: 800,
      messages: [{ role: 'user', content: CONSULTA }]
    }, opts))));

  resultados.push(await medir(`responses ${MODELO_RESPONSES} + web_search`, async () => {
    const resp = await openai.responses.create({
      model: MODELO_RESPONSES,
      tools: [{ type: 'web_search' }],
      max_output_tokens: 1500,
      input: CONSULTA
    }, opts);
    const urls = [];
    for (const item of resp.output || []) {
      if (item.type !== 'message') continue;
      for (const c of item.content || []) {
        for (const a of c.annotations || []) {
          if (a.type === 'url_citation' && a.url) urls.push(a.url);
        }
      }
    }
    return urls;
  }));

  console.table(resultados.map(({ detalhe, ...r }) => r));
  for (const r of resultados.filter(x => x.detalhe)) console.log(`- ${r.variante}: ${r.detalhe}`);

  const saidaDir = path.join(ROOT, 'docs', 'decisoes');
  fs.mkdirSync(saidaDir, { recursive: true });
  const arquivo = path.join(saidaDir, 'pesquisa-api.json');
  fs.writeFileSync(arquivo, JSON.stringify({ geradoEm: new Date().toISOString(), consulta: CONSULTA, resultados }, null, 2), 'utf-8');
  console.log(`\nResultado gravado em ${path.relative(ROOT, arquivo)}.`);
  console.log('Registre a decisão em docs/decisoes/pesquisa-api.md (variante escolhida e OPENAI_RESEARCH_MODEL padrão).');
}

main().catch(err => { console.error(err); process.exit(1); });
