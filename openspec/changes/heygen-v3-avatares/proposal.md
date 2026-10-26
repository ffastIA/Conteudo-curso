## Why

A listagem de avatares da Etapa 10 ainda usa os endpoints v2 do HeyGen (`avatar_group.list` e `avatar_group/{id}/avatars`) como fallback, e esses endpoints saem do ar em 2026-10-31. A rota v3 que o código tenta primeiro (`/v3/avatar_groups`) não existe: devolve 404, então hoje a listagem sempre cai na v2. O restante da integração (vozes, vídeos, saldo) já usa a v3.

## What Changes

- `listarAvataresHeygen` passa a usar só `GET /v3/avatars/looks?ownership=private`, paginado (`limit`, `token`, `has_more`, `next_token`), que devolve direto os looks do próprio usuário com `id`, `name`, `avatar_type` e `preview_image_url`. Uma chamada paginada no lugar de uma por grupo.
- Os endpoints v2 e o fallback são removidos. O campo `legado` some da resposta de `GET /api/heygen/avatares` e o aviso de endpoint legado some da interface.
- Se a listagem falhar, a entrada manual do `avatarId` continua liberando a geração.
- O filtro `HEYGEN_AVATAR_IDS` e o formato devolvido (`id`, `name`, `avatar_type`, `preview_image_url`) não mudam.

## Non-goals

- Não migrar a geração de vídeo para o pipeline Video Agent (`/v3/video-agents`): o app já cria vídeos pela v3 (`/v3/videos`).
- Não criar avatares pela API.

## Impact

- `server.js` (`listarAvataresHeygen`, rota `/api/heygen/avatares`), `public/app.js` e `public/index.html` (aviso legado).
- Testes de integração da listagem de avatares; documentação (`PROJECT.md`, docs).
- Capability alterada: `heygen-avatar-listing`.
