## Why

Hoje o avatar e a voz do HeyGen são escolhidos uma única vez por curso e não há, na interface, nenhuma forma de reabrir essa seleção depois de confirmada — o botão "Vídeo com Avatar" pula direto para o seletor de aulas sempre que `heygenConfig` já existe (`public/app.js:1079`). Se o usuário quiser usar outro avatar/voz (ex.: escolheu errado, quer testar outra opção, ou passou a ter uma lista diferente após configurar `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` no `.env`), a única forma hoje é editar `projeto.json` manualmente para apagar `heygenConfig`. Este change adiciona um botão "Trocar avatar/voz" na Etapa 10 para reabrir a seleção a qualquer momento.

## What Changes

- Novo botão "Trocar avatar/voz" visível na Etapa 10 sempre que já existe uma configuração confirmada (`heygenConfig`), ao lado/próximo do seletor de aulas.
- Ao clicar, reabre a tela de escolha de avatar/voz (mesmos `GET /api/heygen/avatares` e `GET /api/heygen/vozes`, já respeitando o filtro `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS`), com o avatar e a voz atualmente configurados pré-selecionados (em vez de sempre cair no primeiro item da lista).
- Novo botão "Cancelar" na tela de seleção, visível apenas quando reaberta via "Trocar avatar/voz" (não no primeiro uso do curso, quando não há para onde voltar), que fecha a tela sem alterar a configuração salva.
- Confirmar a nova escolha reutiliza o `POST /api/heygen/config` já existente (que já sobrescreve `sess.heygenConfig` e persiste em `projeto.json` sem nenhuma restrição de "uma vez só" — não precisa de mudança de backend).
- Nenhuma mudança em vídeos já gerados: trocar avatar/voz afeta apenas as próximas gerações (roteiro/vídeo), nunca reprocessa aulas já concluídas.

## Capabilities

### New Capabilities
(nenhuma)

### Modified Capabilities
- `video-avatar-generation`: adiciona um novo requisito permitindo que o usuário reabra e altere a configuração de avatar/voz do curso a qualquer momento na Etapa 10, em vez de ela ser fixa após a primeira confirmação.

## Impact

- **Código afetado**: `public/app.js` (`carregarHeygenConfig`, `carregarSeletorAulasVideoAvatar`, novo handler do botão "Trocar avatar/voz" e "Cancelar"), `public/index.html` (novo botão e, possivelmente, marcação do estado atual configurado).
- **Backend**: nenhuma rota nova nem alterada — `POST /api/heygen/config` já suporta ser chamada novamente.
- **Sem novas dependências npm.**
- **Sem mudança de contrato de API.**

## Non-goals

- Não reprocessa nem regenera vídeos/roteiros de aulas já concluídas com o avatar/voz anterior.
- Não adiciona histórico de configurações trocadas (só a configuração atual é mantida, como hoje).
- Não altera o comportamento do filtro `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` em si (já implementado em change anterior) — apenas passa a reutilizá-lo também ao reabrir a seleção.
