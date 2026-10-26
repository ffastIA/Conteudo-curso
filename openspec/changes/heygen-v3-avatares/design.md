## Decisões

**D1. Um endpoint, sem fallback.** `GET /v3/avatars/looks?ownership=private&limit=50` já filtra pelo dono, então não é preciso listar grupos e depois os avatares de cada grupo. Verificado com a chave real em 2026-10-25: responde 200 com `id`, `name`, `avatar_type` (`studio_avatar`, `digital_twin`, `photo_avatar`), `group_id`, `preview_image_url`, `status`. Manter a v2 como fallback só prolongaria código morto: ela sai do ar em 2026-10-31.

**D2. Reaproveitar `paginarHeygen`.** O helper já segue `has_more`/`next_token` e é o mesmo usado nas vozes.

**D3. Só looks prontos.** O campo `status` (`processing`, `pending_consent`, `failed`, `completed`) vem só em avatares privados. Looks que não estão `completed` não servem para gerar vídeo e ficam fora da lista; looks sem `status` são mantidos.

**D4. Contrato da rota.** `GET /api/heygen/avatares` devolve `{ avatares }`. O campo `legado` é removido, pois não há mais endpoint legado.

**D5. Falha.** Qualquer erro HTTP vira `500` com a mensagem; a interface já oferece o `avatarId` manual.
