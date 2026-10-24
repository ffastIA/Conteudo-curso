## Context

`MODEL_RESEARCH='gpt-4o'` com `web_search_options` (`skills.js:6,176`) pode devolver 400; como `isRetriable` trata `BadRequestError` como não-repetível, a Etapa 2 só mostraria erro. O mock da OpenAI nunca simula isso. `listarAvataresHeygen` (`server.js:1149`) usa `avatar_group.list` e `avatar_group/{id}/avatars` (v2) com sunset em 2026-10-31; o comentário do código registra `/v3/avatar_groups` ainda em 404.

## Goals / Non-Goals

**Goals:** evidência real sobre a API de busca; Etapa 10 funcionando após 2026-10-31; baseline comparável.
**Non-Goals:** implementar a nova pesquisa; mudar o fluxo da Etapa 10 além da listagem.

## Decisions

- **D1**: o smoke test usa o SDK `openai` já instalado e lê `.env`; imprime tabela e grava JSON em `docs/decisoes/`.
- **D2**: HeyGen — tentar `/v3/avatar_groups` primeiro; em 404 cair no v2; se ambos falharem, a UI oferece entrada manual de `avatarId` (nunca bloqueia a Etapa 10).
- **D3**: baseline salva em `docs/baseline/<curso>/` (cópia de `scr/` e `metricas.json`).

## Risks / Trade-offs

- Smoke test consome créditos reais → no máximo 1 chamada por variante.
- Resposta v3 pode ter formato diferente → normalizar em um adaptador único coberto por teste com `fetch` mockado.
