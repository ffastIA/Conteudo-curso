## 1. Script scripts/env-crypto.js

- [x] 1.1 Criar `scripts/env-crypto.js` com a estrutura de subcomandos: verificar `process.argv[2]` e despachar para `cmdEncrypt()`, `cmdDecrypt()` ou `cmdKeygen()`; imprimir uso se subcomando inválido
- [x] 1.2 Implementar helper `deriveKey(passphrase, salt)`: PBKDF2 com 100.000 iterações, SHA-256, saída de 32 bytes; constante `PBKDF2_ITERATIONS = 100_000` no topo
- [x] 1.3 Implementar `cmdEncrypt()`: ler `.env` e `.env.key`; gerar salt (32 bytes) e IV (12 bytes) aleatórios; derivar chave; criptografar com AES-256-GCM; gravar `.env.encrypted` com JSON `{ v: 1, salt, iv, tag, data }` em base64; exibir aviso se `.env.key` estiver rastreado pelo git (`execSync('git ls-files .env.key').toString().trim()`)
- [x] 1.4 Implementar `cmdDecrypt()`: ler `.env.encrypted` e `.env.key`; derivar chave; descriptografar com AES-256-GCM; imprimir conteúdo original na stdout
- [x] 1.5 Implementar `cmdKeygen()`: gerar 32 bytes aleatórios em base64url; gravar em `.env.key`; imprimir instrução de compartilhamento; exibir aviso se `.env.key` estiver rastreado pelo git
- [x] 1.6 Adicionar tratamento de erros em todos os subcomandos: arquivos ausentes, passphrase incorreta (erro de GCM) e erros de I/O devem imprimir mensagem clara na stderr e encerrar com `process.exit(1)`

## 2. Scripts npm (package.json)

- [x] 2.1 Adicionar em `package.json` os scripts `"env:encrypt": "node scripts/env-crypto.js encrypt"` e `"env:decrypt": "node scripts/env-crypto.js decrypt"` na seção `scripts`

## 3. Auto-descriptografia no startup (server.js)

- [x] 3.1 No início de `server.js`, antes de qualquer `require` que dependa de variáveis de ambiente (logo após os `require` de módulos nativos e antes dos `require` de OpenAI/dotenv), adicionar bloco condicional: se `.env` não existe mas `.env.encrypted` e `.env.key` existem, descriptografar em memória e injetar via `dotenv.populate(process.env, parsed, { override: false })`
- [x] 3.2 O bloco de auto-descriptografia deve usar a mesma lógica de `cmdDecrypt()` (extraída como função reutilizável `decryptEnv(encryptedPath, keyPath)` que retorna o texto do `.env` ou lança erro)
- [x] 3.3 Se a descriptografia falhar (passphrase incorreta, arquivo corrompido), imprimir `[env] Falha ao descriptografar .env.encrypted — verifique .env.key` e encerrar com `process.exit(1)`

## 4. Atualização do .gitignore

- [x] 4.1 Adicionar `.env.key` ao `.gitignore` (na seção "Variáveis de ambiente")

## 5. Atualização do .env.example

- [x] 5.1 Adicionar ao `.env.example` uma seção `# === Deploy em múltiplas máquinas ===` com as instruções do fluxo: (1) máquina principal: `npm run env:encrypt` após preencher `.env`; commitar `.env.encrypted`; (2) nova máquina: receber `.env.key` via canal seguro; `git pull`; `node server.js` descriptografa automaticamente

## 6. Verificação

- [x] 6.1 Executar `node --check scripts/env-crypto.js` e `node --check server.js` — ambos devem passar sem erros de sintaxe
- [x] 6.2 Testar ciclo completo: `npm run env:encrypt` → renomear `.env` → `node server.js` → servidor iniciou com `[env] Variáveis carregadas de .env.encrypted`
- [x] 6.3 Testar passphrase errada: passphrase incorreta → `node server.js` encerrou com `[env] Falha ao descriptografar .env.encrypted — verifique .env.key`
- [x] 6.4 Executar `npm test` — 317 testes passando
