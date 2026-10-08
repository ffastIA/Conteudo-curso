## Why

O sistema precisa ser distribuído para múltiplas máquinas locais sem expor as chaves de API (OpenAI, Gamma, HeyGen) em texto puro — atualmente o `.env` ou é copiado manualmente (risco de vazamento) ou cada máquina recria as chaves do zero. Esta change resolve o **Gap G01** (.env possivelmente versionado) e viabiliza distribuição controlada via git.

## What Changes

- Novo script `scripts/env-crypto.js` com comandos `encrypt` e `decrypt` usando `node:crypto` (AES-256-GCM + PBKDF2) — zero dependências novas
- Novo arquivo `.env.key` (não commitado): contém a passphrase mestra compartilhada via canal seguro entre as máquinas
- Novo arquivo `.env.encrypted` (commitável): versão criptografada do `.env`, segura para versionamento e distribuição
- Dois novos scripts npm: `env:encrypt` e `env:decrypt`
- Auto-descriptografia no startup do servidor (`server.js`): se `.env` ausente mas `.env.encrypted` + `.env.key` presentes, descriptografa automaticamente antes de carregar variáveis
- Atualização do `.gitignore`: adiciona `.env.key`; remove `.env` da exclusão caso o operador queira versioná-lo criptografado via `.env.encrypted`
- Atualização do `.env.example`: documenta o fluxo de distribuição entre máquinas

## Capabilities

### New Capabilities

- `env-encryption`: criptografia/descriptografia do `.env` com AES-256-GCM e auto-descriptografia no startup

### Modified Capabilities

*(nenhuma — nenhuma spec existente cobre gerenciamento de segredos)*

## Impact

- **`scripts/env-crypto.js`**: novo arquivo (~80 linhas), usa apenas `node:crypto`, `fs`, `path` e `readline` (todos nativos)
- **`server.js`**: 10–15 linhas no início do arquivo para auto-descriptografia condicional antes do `require('dotenv').config()`
- **`package.json`**: dois novos scripts `env:encrypt` e `env:decrypt`
- **`.gitignore`**: adiciona `.env.key`
- **`.env.example`**: adiciona seção de instruções de deploy multi-máquina
- Sem novas dependências npm
- Sem mudanças em endpoints, data models ou lógica de negócio

## Non-goals

- Não implementar rotação automática de chaves
- Não suportar múltiplos ambientes (dev/staging/prod) — apenas um `.env` por máquina
- Não integrar com gerenciadores de segredos externos (Vault, AWS Secrets Manager, etc.)
- Não criptografar valores individualmente — o `.env` inteiro é tratado como um blob
- Não remover a necessidade de compartilhar a passphrase por canal seguro — a criptografia protege o arquivo em repouso, não substitui o canal
