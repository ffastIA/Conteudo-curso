## 1. HTML — novos elementos

- [x] 1.1 Em `public/index.html`, dentro do card `videoAvatarAulaCard` (perto de `<h2>Selecione a aula</h2>`, linha ~630), adicionar o botão `btnTrocarHeygenConfig` ("🔁 Trocar avatar/voz"), estilo secundário.
- [x] 1.2 Em `public/index.html`, dentro de `heygenConfigContainer` (linha ~618-620), adicionar o botão `btnCancelarHeygenConfig` ("Cancelar") ao lado de `btnConfirmarHeygenConfig`, inicialmente oculto (`style="display:none"`).

## 2. app.js — reabrir e pré-selecionar

- [x] 2.1 Em `carregarHeygenConfig()` (`public/app.js:1086-1132`), ao montar os rádios de avatar e de voz, marcar como `checked` o item cujo `id`/`voice_id` bate com `state.heygenConfig?.avatarId`/`voiceId` (quando existir e estiver presente na lista); manter o fallback atual (`i === 0`) quando não houver `state.heygenConfig` ou o item não estiver mais na lista.
- [x] 2.2 Adicionar handler de clique em `btnTrocarHeygenConfig`: esconder `videoAvatarAulaCard` e `videoAvatarParametrosCard` (se visíveis), mostrar `btnCancelarHeygenConfig`, e chamar `carregarHeygenConfig()`.
- [x] 2.3 Adicionar handler de clique em `btnCancelarHeygenConfig`: esconder `heygenConfigContainer` e `btnCancelarHeygenConfig`, reexibir `videoAvatarAulaCard` (e `videoAvatarParametrosCard`, se a aula corrente já estava aberta), sem nenhuma chamada de rede.
- [x] 2.4 No handler de `btnConfirmarHeygenConfig` (`public/app.js:1134-1164`), após o `POST /api/heygen/config` ter sucesso, esconder também `btnCancelarHeygenConfig` (troca concluída) antes de chamar `carregarSeletorAulasVideoAvatar()`.

## 3. Verificação manual

- [x] 3.1 Verificado via browser automation (servidor real + fetch dos endpoints HeyGen stubado para não depender de rede externa): com `heygenConfig` já definido, "Trocar avatar/voz" some com o seletor de aula, reabre `heygenConfigContainer` com avatar/voz atuais pré-marcados, e "Cancelar" restaura o estado anterior sem alterar `state.heygenConfig`.
- [x] 3.2 Verificado no mesmo teste: confirmar uma nova escolha (avatar/voz diferentes) atualiza `state.heygenConfig` corretamente e esconde o botão "Cancelar"/o container. (Persistência em `projeto.json` não teve o `POST /api/heygen/config` exercitado contra um curso real nesta verificação — o endpoint em si não foi alterado por este change e já é coberto por `tests/integration/video-avatar.test.js`.)
- [x] 3.3 `npm test`: 293/293 testes passando (24 suites) — corrigido de quebra um problema pré-existente no baseline de `video-avatar.test.js` (não pinava `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS`, vazando o `.env` real do change anterior).
