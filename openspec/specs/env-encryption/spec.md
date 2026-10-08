# env-encryption Specification

## Purpose
TBD - created by archiving change env-encryption. Update Purpose after archive.
## Requirements
### Requirement: Script de criptografia do .env
O sistema SHALL fornecer um script CLI `scripts/env-crypto.js` com três subcomandos: `encrypt`, `decrypt` e `keygen`, usando exclusivamente módulos nativos do Node.js (`node:crypto`, `node:fs`, `node:path`, `node:readline`).

#### Scenario: Encrypt bem-sucedido
- **WHEN** o operador executa `node scripts/env-crypto.js encrypt` com `.env` e `.env.key` presentes
- **THEN** o arquivo `.env.encrypted` é criado (ou sobrescrito) com formato JSON `{ v, salt, iv, tag, data }` em base64, usando AES-256-GCM com chave derivada via PBKDF2 (100.000 iterações, SHA-256)

#### Scenario: Decrypt para stdout
- **WHEN** o operador executa `node scripts/env-crypto.js decrypt` com `.env.encrypted` e `.env.key` presentes
- **THEN** o conteúdo original do `.env` é impresso na stdout sem gravar nada em disco

#### Scenario: Keygen gera passphrase segura
- **WHEN** o operador executa `node scripts/env-crypto.js keygen`
- **THEN** uma passphrase de 32 bytes aleatórios em base64url é gravada em `.env.key` e o operador é avisado para compartilhá-la via canal seguro

#### Scenario: Arquivos ausentes produzem erro claro
- **WHEN** o operador executa `encrypt` sem `.env` ou `decrypt` sem `.env.encrypted`
- **THEN** o script imprime mensagem de erro descritiva na stderr e encerra com código de saída 1

#### Scenario: Aviso se .env.key estiver rastreado pelo git
- **WHEN** `encrypt` ou `keygen` detecta que `.env.key` é rastreado pelo git (via `git ls-files`)
- **THEN** imprime aviso `⚠️ ATENÇÃO: .env.key está sendo rastreado pelo git — adicione-o ao .gitignore` antes de prosseguir

---

### Requirement: Scripts npm para operar criptografia
O `package.json` SHALL expor `env:encrypt` e `env:decrypt` como atalhos para os subcomandos do script.

#### Scenario: npm run env:encrypt
- **WHEN** o operador executa `npm run env:encrypt`
- **THEN** equivale a `node scripts/env-crypto.js encrypt`

#### Scenario: npm run env:decrypt
- **WHEN** o operador executa `npm run env:decrypt`
- **THEN** equivale a `node scripts/env-crypto.js decrypt`

---

### Requirement: Auto-descriptografia no startup do servidor
Se `.env` não existir mas `.env.encrypted` e `.env.key` existirem, o servidor SHALL descriptografar o conteúdo e injetar as variáveis em `process.env` via `dotenv.populate()` antes de qualquer outro código que dependa das variáveis de ambiente.

#### Scenario: Startup com .env ausente e .env.encrypted presente
- **WHEN** o servidor inicia, `.env` não existe, `.env.encrypted` e `.env.key` existem
- **THEN** as variáveis do `.env.encrypted` são carregadas em `process.env` e o servidor inicia normalmente sem gravar `.env` em disco

#### Scenario: Startup com .env presente
- **WHEN** o servidor inicia e `.env` existe
- **THEN** o comportamento é idêntico ao atual: `dotenv.config()` carrega o `.env` normalmente, sem tentar descriptografar

#### Scenario: Startup sem nenhum dos dois
- **WHEN** o servidor inicia sem `.env` e sem `.env.encrypted`
- **THEN** o servidor inicia normalmente (variáveis ausentes causam erro nas chamadas downstream, como hoje); nenhum crash adicional é introduzido pela lógica de descriptografia

#### Scenario: Passphrase incorreta no startup
- **WHEN** `.env.key` contém uma passphrase diferente da usada para criptografar
- **THEN** o servidor imprime `[env] Falha ao descriptografar .env.encrypted — verifique .env.key` e encerra com código 1

---

### Requirement: Atualização do .gitignore
O `.gitignore` SHALL incluir `.env.key` para evitar commit acidental da passphrase mestra.

#### Scenario: .env.key ignorado pelo git
- **WHEN** o operador executa `git add .env.key`
- **THEN** o git ignora o arquivo e não o rastreia

---

### Requirement: Documentação do fluxo de deploy no .env.example
O `.env.example` SHALL conter uma seção explicando o fluxo de setup em nova máquina usando o sistema de criptografia.

#### Scenario: Operador consulta .env.example em máquina nova
- **WHEN** o operador lê `.env.example` ao configurar uma nova máquina
- **THEN** encontra as instruções: (1) receber `.env.key` via canal seguro, (2) gravar em `.env.key`, (3) `node server.js` descriptografa automaticamente no startup

