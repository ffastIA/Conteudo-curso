#!/usr/bin/env node
'use strict';

// Publica a linha de base (docs/baseline/<curso>/metricas.json, ver change
// verificacao-pesquisa-e-prazos) como dataset do Langfuse, para reexecutar e
// comparar cada fase do plano. Uso:
//   node scripts/langfuse-dataset.js --dry-run     # só mostra o que seria enviado
//   node scripts/langfuse-dataset.js               # envia (LANGFUSE_* no .env)
// Endpoints: POST /api/public/datasets e POST /api/public/dataset-items.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BASELINE_DIR = path.join(ROOT, 'docs', 'baseline');
const NOME_DATASET = 'baseline-gerador-de-conteudo';

// Um item por curso de referência: entrada = curso, saída esperada = métricas.
function montarItens(baselineDir = BASELINE_DIR) {
  if (!fs.existsSync(baselineDir)) return [];
  return fs.readdirSync(baselineDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .flatMap(d => {
      const arquivo = path.join(baselineDir, d.name, 'metricas.json');
      if (!fs.existsSync(arquivo)) return [];
      const metricas = JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
      return [{
        id: `baseline-${d.name}`,
        datasetName: NOME_DATASET,
        input: { curso: d.name },
        expectedOutput: metricas,
        metadata: { origem: 'docs/baseline', geradoEm: new Date().toISOString() }
      }];
    });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const itens = montarItens();
  if (!itens.length) {
    console.error('Nenhuma linha de base encontrada em docs/baseline/<curso>/metricas.json — gere os 2 cursos de referência primeiro.');
    process.exit(1);
  }
  if (dryRun) {
    console.log(JSON.stringify({ dataset: NOME_DATASET, itens }, null, 2));
    return;
  }

  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const { LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY } = process.env;
  if (!LANGFUSE_HOST || !LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
    console.error('Defina LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY e LANGFUSE_SECRET_KEY no .env.');
    process.exit(1);
  }
  const base = LANGFUSE_HOST.replace(/\/+$/, '');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Basic ' + Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64')
  };
  const post = async (rota, corpo) => {
    const resp = await fetch(`${base}${rota}`, { method: 'POST', headers, body: JSON.stringify(corpo), signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) throw new Error(`${rota} respondeu ${resp.status}: ${await resp.text().catch(() => '')}`);
  };

  await post('/api/public/datasets', { name: NOME_DATASET, description: 'Linha de base dos cursos de referência do plano Implementacoes231016' });
  for (const item of itens) await post('/api/public/dataset-items', item);
  console.log(`Dataset "${NOME_DATASET}" atualizado com ${itens.length} item(ns).`);
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { montarItens, NOME_DATASET };
