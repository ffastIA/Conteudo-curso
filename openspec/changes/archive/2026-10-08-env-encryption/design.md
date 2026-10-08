## Context

O projeto usa `dotenv` para carregar variáveis de ambiente de um `.env` local. O arquivo está no `.gitignore` (gap G01 aponta que pode ter sido versionado acidentalmente). Para distribuir o sistema a múltiplas máquinas locais, o operador precisa copiar o `.env` manualmente — processo propenso a erros e vazamentos. A solução deve funcionar com o toolchain existente (Node.js puro, sem dependências novas).

**Estado atual:**
- `.env` é carregado por `require('dotenv').config()` no topo de `server.js`
- Não há nenhum mecanismo de criptografia ou distribuição segura
- `package.json` tem `scripts` mas nenhum relacionado a segredos

## Goals / Non-Goals

**Goals:**
- Permitir commitar `.env.encrypted` com segurança
- Distribuição: `git pull` + copiar `.env.key` (uma vez) = máquina pronta
- Auto-descriptografia transparente no startup — operador não precisa rodar nada manualmente
- Zero dependências npm novas

**Non-Goals:**
- Rotação de chaves, múltiplos ambientes, integração com Vault/KMS
- Criptografia por valor individual (overkill para uso local)

## Decisions

### D1 — Algoritmo: AES-256-GCM com PBKDF2

AES-256-GCM é autenticado (detecta adulteração), amplamente suportado pelo `node:crypto` e sem dependências. PBKDF2 deriva a chave de 256 bits da passphrase com salt aleatório (100.000 iterações, SHA-256). Salt e IV são armazenados junto ao ciphertext no `.env.encrypted`.

**Alternativa considerada:** ChaCha20-Poly1305 — igualmente seguro mas menos familiar para o operador humano que precisar auditar.

### D2 — Formato do `.env.encrypted`: JSON com campos base64

```json
{
  "v": 1,
  "salt": "<32 bytes, base64>",
  "iv":   "<12 bytes, base64>",
  "tag":  "<16 bytes, base64>",
  "data": "<ciphertext, base64>"
}
```

Campo `v` (versão) permite migração futura sem quebrar arquivos antigos. Legível por humanos para auditoria básica.

**Alternativa considerada:** formato binário — mais compacto mas dificulta auditoria e diff no git.

### D3 — Chave mestra: arquivo `.env.key` com passphrase em texto puro

O arquivo `.env.key` contém uma linha com a passphrase. Simples de criar (`node scripts/env-crypto.js keygen` ou editar manualmente) e de compartilhar via canal seguro (pasta compartilhada, gerenciador de senhas, etc.). O arquivo vai em `.gitignore`.

**Alternativa considerada:** variável de ambiente `ENV_PASSPHRASE` — mais seguro em CI/CD mas mais complexo para uso local com múltiplas máquinas.

### D4 — Auto-descriptografia no startup: antes do `dotenv.config()`

Em `server.js`, antes de `require('dotenv').config()`, verificar:
1. Se `.env` existe → pular (comportamento atual preservado)
2. Se `.env.encrypted` + `.env.key` existem → descriptografar para `.env` em memória e injetar em `process.env` via `dotenv.populate()`
3. Se nenhum dos dois → iniciar normalmente (variáveis ausentes causarão erro downstream, como hoje)

Usar `dotenv.populate(process.env, parsed)` em vez de gravar `.env` em disco — evita criar o arquivo descriptografado no servidor (que poderia ser versionado acidentalmente).

**Alternativa considerada:** gravar `.env` em disco e chamar `dotenv.config()` normalmente — mais simples mas deixa o arquivo descriptografado no disco.

### D5 — Script `scripts/env-crypto.js`: CLI com subcomandos

```
node scripts/env-crypto.js encrypt   # .env → .env.encrypted (lê .env.key)
node scripts/env-crypto.js decrypt   # .env.encrypted → imprime na stdout
node scripts/env-crypto.js keygen    # gera passphrase aleatória segura e grava .env.key
```

O subcomando `decrypt` imprime na stdout (não grava em disco) para minimizar superfície de exposição. Se o operador quiser gravar, redireciona: `node scripts/env-crypto.js decrypt > .env`.

## Risks / Trade-offs

- **[Risco] Passphrase fraca escolhida pelo operador** → Mitigação: `keygen` gera 32 bytes aleatórios em base64 por padrão; documentar no `.env.example`
- **[Risco] `.env.key` commitado acidentalmente** → Mitigação: adicionado ao `.gitignore`; `encrypt` exibe aviso se detectar `.env.key` rastreado
- **[Trade-off] `.env` não é gravado em disco no startup** → `dotenv.populate()` injeta direto em `process.env`; aplicações que leem `fs.readFileSync('.env')` diretamente (como o próprio `env-crypto.js`) não serão afetadas, pois são scripts CLI separados
- **[Trade-off] PBKDF2 com 100.000 iterações adiciona ~200ms no startup** → Aceitável para uso local; pode ser ajustado via constante `PBKDF2_ITERATIONS`
