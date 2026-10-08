'use strict';
// Utilitário de criptografia do .env para deploy em múltiplas máquinas.
// Usa apenas módulos nativos do Node.js — zero dependências externas.
//
// Uso:
//   node scripts/env-crypto.js keygen   → gera .env.key com passphrase aleatória
//   node scripts/env-crypto.js encrypt  → .env → .env.encrypted
//   node scripts/env-crypto.js decrypt  → .env.encrypted → stdout

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const KEY_PATH = path.join(ROOT, '.env.key');
const ENC_PATH = path.join(ROOT, '.env.encrypted');

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

// ── Derivação de chave ───────────────────────────────────────────────────────

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
}

// ── Detecção de .env.key rastreado pelo git ──────────────────────────────────

function warnIfKeyTracked() {
  try {
    const tracked = execSync('git ls-files .env.key', { cwd: ROOT }).toString().trim();
    if (tracked) {
      process.stderr.write('⚠️  ATENÇÃO: .env.key está sendo rastreado pelo git — adicione-o ao .gitignore\n');
    }
  } catch {
    // git não disponível ou não é repositório — ignorar silenciosamente
  }
}

// ── Função reutilizável de descriptografia (usada pelo server.js) ────────────

function decryptEnv(encryptedPath, keyPath) {
  const passphrase = fs.readFileSync(keyPath, 'utf-8').trim();
  const envelope = JSON.parse(fs.readFileSync(encryptedPath, 'utf-8'));
  if (envelope.v !== 1) throw new Error(`Versão desconhecida do envelope: ${envelope.v}`);

  const salt = Buffer.from(envelope.salt, 'base64');
  const iv   = Buffer.from(envelope.iv,   'base64');
  const tag  = Buffer.from(envelope.tag,  'base64');
  const data = Buffer.from(envelope.data, 'base64');

  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8');
}

// ── Subcomandos ──────────────────────────────────────────────────────────────

function cmdKeygen() {
  warnIfKeyTracked();
  const passphrase = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(KEY_PATH, passphrase + '\n', 'utf-8');
  process.stdout.write(`✅ Passphrase gerada e gravada em .env.key\n`);
  process.stdout.write(`   Compartilhe este arquivo via canal seguro (1Password, WhatsApp, etc.)\n`);
  process.stdout.write(`   NUNCA commite .env.key no git.\n`);
}

function cmdEncrypt() {
  if (!fs.existsSync(ENV_PATH)) {
    process.stderr.write(`Erro: .env não encontrado em ${ENV_PATH}\n`);
    process.exit(1);
  }
  if (!fs.existsSync(KEY_PATH)) {
    process.stderr.write(`Erro: .env.key não encontrado — execute primeiro: node scripts/env-crypto.js keygen\n`);
    process.exit(1);
  }

  warnIfKeyTracked();

  const passphrase = fs.readFileSync(KEY_PATH, 'utf-8').trim();
  const plaintext  = fs.readFileSync(ENV_PATH, 'utf-8');
  const salt = crypto.randomBytes(32);
  const iv   = crypto.randomBytes(12);
  const key  = deriveKey(passphrase, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = {
    v:    1,
    salt: salt.toString('base64'),
    iv:   iv.toString('base64'),
    tag:  tag.toString('base64'),
    data: encrypted.toString('base64')
  };

  fs.writeFileSync(ENC_PATH, JSON.stringify(envelope, null, 2) + '\n', 'utf-8');
  process.stdout.write(`✅ .env.encrypted gerado — pode ser commitado no git com segurança.\n`);
}

function cmdDecrypt() {
  if (!fs.existsSync(ENC_PATH)) {
    process.stderr.write(`Erro: .env.encrypted não encontrado em ${ENC_PATH}\n`);
    process.exit(1);
  }
  if (!fs.existsSync(KEY_PATH)) {
    process.stderr.write(`Erro: .env.key não encontrado — solicite ao responsável via canal seguro.\n`);
    process.exit(1);
  }

  try {
    const plaintext = decryptEnv(ENC_PATH, KEY_PATH);
    process.stdout.write(plaintext);
  } catch (err) {
    process.stderr.write(`Erro ao descriptografar: ${err.message}\n`);
    process.stderr.write(`Verifique se .env.key contém a passphrase correta.\n`);
    process.exit(1);
  }
}

// ── Dispatch (somente quando executado diretamente, não via require) ─────────

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'encrypt')      cmdEncrypt();
  else if (cmd === 'decrypt') cmdDecrypt();
  else if (cmd === 'keygen')  cmdKeygen();
  else {
    process.stderr.write(
      'Uso: node scripts/env-crypto.js <subcomando>\n' +
      '  keygen   — gera passphrase aleatória em .env.key\n' +
      '  encrypt  — criptografa .env → .env.encrypted\n' +
      '  decrypt  — descriptografa .env.encrypted → stdout\n'
    );
    process.exit(1);
  }
}

module.exports = { decryptEnv };
