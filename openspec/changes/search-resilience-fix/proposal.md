## Why

A Etapa 2 (Pesquisa Web) apresenta falha silenciosa em cascata: o modelo `gpt-4o-search-preview` foi depreciado, o fallback para `gpt-4o-mini` não tinha timeout próprio (travava quando a rede estava completamente fora), havia um bug de string no prompt do fallback, e o frontend não orientava o usuário após o erro. Resolve parcialmente o **Gap G05**.

## What Changes

- Substituir `MODEL_RESEARCH = 'gpt-4o-search-preview'` por `'gpt-4o'`
- Adicionar `SEARCH_FALLBACK_TIMEOUT_MS = 30_000` e passar `combineSignals` ao fallback
- Corrigir bug de string na `pesquisaFallbackSkill`: literal `' +\n    '` no prompt
- Exibir mensagem de orientação no log panel após falha total na Etapa 2

## Capabilities

### New Capabilities
*(nenhuma)*

### Modified Capabilities
- `web-search-resilience`: modelo correto, timeout no fallback, prompt corrigido, UX pós-erro

## Impact

- **`skills.js`**: `MODEL_RESEARCH` e bug de string em `pesquisaFallbackSkill`
- **`server.js`**: constante `SEARCH_FALLBACK_TIMEOUT_MS`, timeout no fallback
- **`public/app.js`**: mensagem de orientação no `onError` da Etapa 2

## Non-goals

- Não implementar retry genérico para outras etapas
- Não cachear resultados de pesquisa
- Não tornar timeouts configuráveis via UI ou `.env`
- Não tratar `AuthenticationError` como fallback
