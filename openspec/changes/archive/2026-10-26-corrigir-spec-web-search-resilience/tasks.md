## 1. Spec

- [x] 1.1 Conferir cada requisito de `web-search-resilience` contra `server.js` (`SEARCH_TIMEOUT_MS`, `SEARCH_RETRY_TIMEOUT_MS`, `PESQUISA_MAX_RETENTATIVAS`, `executarPesquisaWeb`, rota `/api/search`) e `public/app.js` (`executarPesquisa`)
- [x] 1.2 Modificar os requisitos de timeout, retry e orientação ao usuário; remover o fallback automático; acrescentar "Falha persistente não grava pesquisa"

## 2. Verificação

- [x] 2.1 `openspec validate --all` e `npm test` verdes
