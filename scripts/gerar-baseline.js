#!/usr/bin/env node
'use strict';

// Gera a LINHA DE BASE de um curso de referência (plano Implementacoes231016,
// change verificacao-pesquisa-e-prazos): roda o pipeline real — metodologia,
// ementa, pesquisa, plano de ensino, plano de aula, pesquisa por módulo,
// conteúdo e revisão — e salva as métricas em docs/baseline/<curso>/. USA A
// CHAVE REAL da OpenAI (dezenas de chamadas) — rode manualmente.
//
//   node scripts/gerar-baseline.js            # curso padrão (CapCut infantil, 3 aulas)
//   node scripts/gerar-baseline.js --aulas 2  # menos aulas (mais barato)
//
// Métricas (metricas.json): tamanho das aulas, nº de fontes, aulas truncadas e
// nota média da revisão — o que o plano usa para comparar cada fase.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const argAulas = process.argv.indexOf('--aulas');
const NUM_AULAS = argAulas > 0 ? Math.max(1, parseInt(process.argv[argAulas + 1], 10) || 3) : 3;

const CURSO = {
  id: 'capcut',
  config: {
    nome: 'Edição de vídeo com CapCut para crianças',
    publico: 'Crianças de 8 a 12 anos',
    carga: String(NUM_AULAS),
    duracao: '60',
    nivel: 'basico',
    objetivos: 'Aprender a editar vídeos simples no CapCut: cortar clipes, adicionar texto, música e efeitos, e exportar o vídeo final.',
    modalidade: 'online',
    proporcaoTeoricoPratico: '30% teórico / 70% prático',
    preRequisitos: 'Saber usar tablet ou computador com supervisão de um adulto.'
  }
};

// Referência "antes" (medida na análise do plano): aulas de 3,8 a 6,8 KB, sem
// pesquisa verificada e sem controle de truncamento.
const REFERENCIA_ANTES = { fonte: 'PDF Implementacoes231016 (análise de 23/10/2026)', tamanhoAulaKB: { min: 3.8, max: 6.8 }, observacao: 'a Etapa 2 usava web_search_options (rejeitado pela API); aulas truncadas gravadas como prontas' };

let cookie = '';
let base = '';

async function http(caminho, opcoes = {}) {
  const resp = await fetch(base + caminho, { ...opcoes, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opcoes.headers || {}) } });
  const set = resp.headers.getSetCookie?.() || [];
  if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
  return resp;
}

async function post(caminho, corpo) {
  const r = await http(caminho, { method: 'POST', body: corpo ? JSON.stringify(corpo) : undefined });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${caminho} respondeu ${r.status}: ${dados.error || ''}`);
  return dados;
}

// Consome um endpoint SSE até o fim; devolve { eventos, erro }.
async function sse(caminho, rotulo) {
  const inicio = Date.now();
  console.log(`\n▶ ${rotulo}`);
  const r = await http(caminho);
  const texto = await r.text();
  const eventos = texto.split('\n\n').filter(b => b.startsWith('data:'))
    .map(b => { try { return JSON.parse(b.replace(/^data:\s*/, '')); } catch { return null; } }).filter(Boolean);
  for (const e of eventos) {
    if (e.type === 'progress' && !/^Concluído$/.test(e.message)) console.log(`   · ${e.message}`);
    if (e.type === 'warning') console.log(`   ⚠ ${e.text}`);
  }
  const erro = eventos.find(e => e.type === 'error');
  console.log(erro ? `   ✖ ${erro.message}` : `   ✔ concluído em ${Math.round((Date.now() - inicio) / 1000)} s`);
  return { eventos, erro };
}

const lerJson = (arquivo, padrao = null) => { try { return JSON.parse(fs.readFileSync(arquivo, 'utf-8')); } catch { return padrao; } };
const dominio = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

function coletarMetricas(pasta) {
  const scr = path.join(pasta, 'scr');
  const projeto = lerJson(path.join(scr, 'projeto.json'), {});
  const estados = projeto.estadoAulas || {};
  const aulas = [];
  for (let n = 1; n <= NUM_AULAS; n++) {
    const num = String(n).padStart(2, '0');
    const arquivo = path.join(scr, `aula${num}_conteudo.txt`);
    const texto = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf-8') : '';
    const e = estados[num] || {};
    aulas.push({
      numero: n, titulo: projeto.aulas?.[n - 1]?.titulo || null,
      palavras: texto.trim() ? texto.trim().split(/\s+/).length : 0,
      kb: Math.round((Buffer.byteLength(texto) / 1024) * 10) / 10,
      estado: e.estado || (texto ? 'completa' : 'ausente'), modo: e.modo || null,
      finishReason: e.finishReason || null, continuacoes: e.continuacoes ?? null,
      citacoes: e.citacoes ? { fontesDistintas: e.citacoes.distintas, idsInvalidos: e.citacoes.idsInvalidos?.length || 0, dadosSemCitacao: e.citacoes.numerosSemCitacao } : null,
      gravadaComoOficial: !!texto
    });
  }
  const pesquisa = lerJson(path.join(scr, 'pesquisa.json'), null);
  const modulos = lerJson(path.join(scr, 'pesquisa_modulos.json'), null);
  const urls = new Map();
  for (const f of [...(pesquisa?.fontes || []), ...(modulos?.fontes || [])]) urls.set(f.url, f);
  const dominios = new Set([...urls.keys()].map(dominio).filter(Boolean));
  const notas = lerJson(path.join(scr, 'notas_aulas.json'), []);
  const validas = notas.map(n => n.nota).filter(n => typeof n === 'number');
  const log = lerJson(path.join(scr, 'geracao_log.json'), []);
  const usd = log.reduce((s, l) => s + (typeof l.custoUsd === 'number' ? l.custoUsd : 0), 0);
  const tokens = lerJson(path.join(scr, 'token_usage.json'), {})?.total?.total ?? null;
  const media = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

  let commit = null;
  try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch { /* sem git */ }

  return {
    geradoEm: new Date().toISOString(), commit,
    curso: CURSO.config,
    modelos: { pesquisa: process.env.OPENAI_RESEARCH_MODEL || 'gpt-4o', conteudo: process.env.OPENAI_CONTENT_MODEL || 'gpt-4o-mini' },
    etapas: {
      pesquisa: pesquisa ? { status: pesquisa.status, fontes: pesquisa.fontes?.length || 0, consultas: pesquisa.consultas?.length || 0 } : null,
      pesquisaModulos: modulos ? { completo: !!modulos.completo, pulada: !!modulos.pulada, modulos: modulos.modulos?.length || 0, fontes: modulos.fontes?.length || 0 } : null
    },
    aulas,
    resumo: {
      aulas: aulas.length,
      palavrasMedia: media(aulas.map(a => a.palavras)),
      kbMedio: media(aulas.map(a => a.kb)),
      aulasTruncadas: aulas.filter(a => a.finishReason === 'length' || a.estado === 'incompleta').length,
      aulasIncompletas: aulas.filter(a => a.estado === 'incompleta').length,
      aulasCurtas: aulas.filter(a => a.estado === 'curta').length,
      fontesDistintas: urls.size,
      dominiosDistintos: dominios.size,
      notaMediaRevisao: media(validas)
    },
    notasPorAula: notas.map(n => ({ numero: n.numero, nota: n.nota, criterios: n.criterios || null })),
    custo: { tokensTotais: tokens, usdEstimado: Math.round(usd * 10000) / 10000 },
    referenciaAntes: REFERENCIA_ANTES
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    try { require('../server'); } catch { /* o próprio server carrega .env/.env.encrypted */ }
  }
  const app = require('../server');
  if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY ausente (.env ou .env.encrypted + .env.key).'); process.exit(1); }
  const servidor = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${servidor.address().port}`;
  const pasta = process.env.BASELINE_PASTA || path.join(os.tmpdir(), `baseline-${CURSO.id}`);
  fs.rmSync(pasta, { recursive: true, force: true });
  console.log(`Linha de base: "${CURSO.config.nome}" — ${NUM_AULAS} aula(s) — pasta de trabalho: ${pasta}`);

  const falhar = (etapa, erro) => { throw new Error(`${etapa}: ${erro.message}`); };
  try {
    await post('/api/config', { ...CURSO.config, pastaProjeto: pasta });
    await post('/api/bncc/pular');
    console.log('\n▶ Metodologia e ementa');
    await http('/api/metodologia').then(r => r.json());
    await post('/api/metodologia/confirmar');

    let r = await sse('/api/search', 'Etapa 2 — pesquisa web');
    if (r.erro) falhar('pesquisa web', r.erro);
    r = await sse('/api/plano-ensino', 'Etapa 3 — plano de ensino');
    if (r.erro) falhar('plano de ensino', r.erro);
    r = await sse('/api/plano-aula', 'Etapa 4 — plano de aula');
    if (r.erro) falhar('plano de aula', r.erro);

    r = await sse('/api/pesquisa-modulos', 'Pesquisa por módulo');
    if (r.erro) {
      console.log('   ↻ nova tentativa (os módulos já pesquisados são reaproveitados)');
      r = await sse('/api/pesquisa-modulos', 'Pesquisa por módulo (2ª tentativa)');
      if (r.erro) falhar('pesquisa por módulo', r.erro);
    }
    r = await sse('/api/conteudo', 'Etapa 5 — conteúdo das aulas');
    if (r.erro) falhar('conteúdo', r.erro);
    r = await sse('/api/revisao-qualidade', 'Etapa 6 — revisão de qualidade');
    if (r.erro) console.log('   (a revisão falhou — a nota média ficará vazia)');
  } finally {
    servidor.close();
  }

  const metricas = coletarMetricas(pasta);
  const destino = path.join(ROOT, 'docs', 'baseline', CURSO.id);
  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(path.join(destino, 'metricas.json'), JSON.stringify(metricas, null, 2), 'utf-8');
  // Artefatos leves para comparar depois (sem .docx).
  const scr = path.join(pasta, 'scr');
  for (const f of fs.existsSync(scr) ? fs.readdirSync(scr) : []) {
    if (/^(aula\d+_conteudo\.txt|pesquisa(_modulos)?\.json|notas_aulas\.json|revisao_log\.json|geracao_log\.json|projeto\.json)$/.test(f)) {
      fs.copyFileSync(path.join(scr, f), path.join(destino, f));
    }
  }
  console.log(`\nMétricas gravadas em ${path.relative(ROOT, path.join(destino, 'metricas.json'))}`);
  console.log(JSON.stringify(metricas.resumo, null, 2));
  console.log(JSON.stringify(metricas.custo));
  process.exit(0);
}

if (require.main === module) main().catch(err => { console.error('\nFalha:', err.message); process.exit(1); });

module.exports = { CURSO, coletarMetricas };
