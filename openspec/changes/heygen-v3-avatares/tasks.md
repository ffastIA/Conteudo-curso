## 1. Implementação

- [x] 1.1 `listarAvataresHeygen`: usar `paginarHeygen('/v3/avatars/looks', { ownership: 'private', limit: '50' })`, mapear para `{ id, name, avatar_type, preview_image_url }`, omitir looks com `status` diferente de `completed`, aplicar `HEYGEN_AVATAR_IDS`; remover `listarAvataresHeygenV3`, `listarAvataresHeygenV2` e `extrairListaHeygenV3`
- [x] 1.2 Rota `GET /api/heygen/avatares` devolve só `{ avatares }`
- [x] 1.3 Interface: remover o aviso de endpoint legado (`heygenAvisoLegado`) e o uso de `dataAvatares.legado`

## 2. Documentação

- [x] 2.1 Atualizar `PROJECT.md`/docs onde citam a v2 ou o fallback

## 3. Testes (última etapa)

- [x] 3.1 Reescrever `heygen-avatares-v3-fallback.test.js` (v3 única, paginação, status, erro 500, nenhuma chamada v2) e adaptar os mocks de `heygen-avatares-vozes-filtro-env`, `video-avatar` e `observabilidade`
- [x] 3.2 Verificação real com a chave do `.env` (leitura) e `npm test`, cobertura e `openspec validate --all`
