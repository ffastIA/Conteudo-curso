## Why

O app não tem autenticação (Gap G02) e hoje escuta em todas as interfaces (`app.listen(PORT, ...)`, `server.js:4332`), com rotas que abrem seletor de pasta e leem pastas arbitrárias (`/api/escolher-pasta`, `/api/carregar-projeto`), `/api/dev/seed` sempre ativo, cookie sem `SameSite`, `multer` sem limites e sessões sem expiração (achados A6/B7). Resolve parcialmente o **Gap G02** sem criar autenticação (non-goal permanente).

## What Changes

- `app.listen(PORT, HOST)` com `HOST` default `127.0.0.1` (variável `HOST` para Docker/LAN).
- Cookie `sessionId` com `SameSite=Lax`.
- `/api/dev/seed` só existe com `ENABLE_DEV_SEED=true`.
- Checagem de `Origin`/`Host` nas rotas que alteram estado ou consomem crédito de API.
- `/api/escolher-pasta` restrito a loopback.
- `/api/carregar-projeto` e `pastaProjeto` aceitam apenas pasta vazia ou com `scr/projeto.json`; caminho aceito é logado.
- `multer` com limite de tamanho e tipo; expiração de sessões inativas (12 h) com limpeza periódica.
- Decisão registrada sobre manter `.env.encrypted` no git.

## Capabilities

### New Capabilities
- `local-network-boundary`: fronteira de rede e sessão do app local.

### Modified Capabilities
*(nenhuma)*

## Impact

- **`server.js`**: `listen`, cookie (~209), `/api/dev/seed` (~4076), `multer` (~50), middleware de Origin, limpeza de sessões, rotas de pasta
- **`.env.example`**, README e artefatos Docker (se existirem): `HOST=0.0.0.0` em container
- **`PROJECT.md`**: decisão sobre `.env.encrypted`

## Non-goals

- Não implementar autenticação, multi-tenancy ou TLS (non-goals permanentes).
- Não remover `.env.encrypted` nesta change — apenas registrar a decisão.
