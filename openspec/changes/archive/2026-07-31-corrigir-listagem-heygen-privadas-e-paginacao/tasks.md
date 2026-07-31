## 1. server.js — helper de paginação (vozes)

- [x] 1.1 Adicionar `paginarHeygen(path, baseParams, { maxPaginas = 100 } = {})` perto de `listarAvataresHeygen`/`listarVozesHeygen` (server.js, ~linha 1023), seguindo `has_more`/`next_token` até esgotar ou atingir `maxPaginas`, usando `limit=100` por página. Usado só por `listarVozesHeygen` (ver item 2 abaixo sobre avatares).

## 2. server.js — avatares

- [x] 2.1 ~~Reescrever `listarAvataresHeygen()` para usar `paginarHeygen('/v3/avatars/looks', ...)`~~ — **descartado**: testado contra a API real, `/v3/avatars/looks` mistura o catálogo público inteiro do HeyGen (milhares de itens) com os avatares do usuário, sem parâmetro de filtro por dono; paginar até o fim levou mais de 1 minuto sem terminar em 750+ itens (ver design.md).
- [x] 2.2 Reescrever `listarAvataresHeygen()` para usar `GET /v2/avatar_group.list?include_public=false` (grupos próprios do usuário) seguido de `GET /v2/avatar_group/{group_id}/avatars` por grupo (em paralelo, `Promise.all`), mapeando cada look para `{ id, name, avatar_type, preview_image_url }` (`avatar_type` derivado de `group_type` do grupo) e aplicando o filtro por `HEYGEN_AVATAR_IDS` sobre o array achatado.

## 3. server.js — vozes

- [x] 3.1 Reescrever `listarVozesHeygen({ type, language, gender })` (server.js:1046-1065): quando `type` for informado, usar `paginarHeygen('/v3/voices', { limit: '100', type, language, gender })` (comportamento atual, agora paginado).
- [x] 3.2 Quando `type` não for informado, buscar em paralelo `paginarHeygen('/v3/voices', { limit: '100', type: 'public', language, gender })` e `paginarHeygen('/v3/voices', { limit: '100', type: 'private', gender })` (sem `language` nesta última) e concatenar os resultados (privadas primeiro), antes de aplicar o filtro por `HEYGEN_VOICE_IDS`.

## 4. Testes

- [x] 4.1 Em `tests/integration/video-avatar.test.js`, ajustar `installHeygenListFetchMock` (e os testes que dependem dela) para simular `GET /v2/avatar_group.list` + `GET /v2/avatar_group/{id}/avatars` (avatares) e paginação (`has_more`/`next_token`) para `/v3/voices`, confirmando que o sistema segue vozes até a última página e monta avatares a partir dos grupos/looks mockados.
- [x] 4.2 Adicionar teste cobrindo que `GET /api/heygen/vozes` sem `?type=` combina vozes `public` e `private` do mock (duas chamadas distintas simuladas) num único array de resposta.
- [x] 4.3 Adicionar teste cobrindo que a busca de vozes privadas não envia `language` na query enviada ao HeyGen, enquanto a busca de públicas envia (mesmo mock, checando as URLs chamadas).
- [x] 4.4 Adicionar teste cobrindo que `GET /api/heygen/vozes?type=public` (explícito) não dispara a chamada de `type=private`.
- [x] 4.5 Ajustar `tests/integration/heygen-avatares-vozes-filtro-env.test.js` (mock de avatares e de vozes) para o novo formato de chamadas (grupos/looks para avatares; roteamento por `type=` para vozes).
- [x] 4.6 Rodar `npm test` e confirmar que toda a suíte permanece verde.

## 5. Verificação contra a API real do HeyGen

- [x] 5.1 Rodar `node server.js` com `HEYGEN_API_KEY`/`HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` reais do `.env` e confirmar via `curl` que `GET /api/heygen/avatares` e `GET /api/heygen/vozes` retornam os IDs configurados (avatar "Professor Idê" e voz "Victor Pinho") em poucos segundos, não minutos.
