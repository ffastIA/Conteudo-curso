## ADDED Requirements

### Requirement: Trocar avatar/voz do curso a qualquer momento
O sistema SHALL permitir que o usuário reabra a tela de seleção de avatar/voz do HeyGen a qualquer momento na Etapa 10, mesmo depois de já ter confirmado uma configuração (`heygenConfig`) para o curso, através de um botão "Trocar avatar/voz" visível junto ao seletor de aulas. Ao reabrir, o sistema SHALL buscar novamente as listas de avatares e vozes (respeitando o filtro de `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS`, quando configurado) e SHALL pré-selecionar o avatar e a voz atualmente configurados quando ainda presentes na lista retornada. Confirmar a nova escolha SHALL sobrescrever `sess.heygenConfig` e a persistência em `projeto.json`, sem afetar roteiros ou vídeos de aulas já gerados com a configuração anterior. O sistema SHALL oferecer uma opção de cancelar a troca sem alterar a configuração salva.

#### Scenario: Reabrir a seleção com a configuração atual pré-marcada
- **WHEN** o usuário clica em "Trocar avatar/voz" com `heygenConfig` já definido para o curso
- **THEN** o sistema busca `GET /api/heygen/avatares` e `GET /api/heygen/vozes` novamente e exibe a tela de seleção com o avatar e a voz atualmente configurados já marcados (quando presentes na lista)

#### Scenario: Confirmar uma nova escolha substitui a anterior
- **WHEN** o usuário seleciona um avatar e/ou voz diferentes e confirma
- **THEN** o sistema grava a nova escolha em `sess.heygenConfig` e em `projeto.json`, substituindo a anterior, e volta para o seletor de aulas

#### Scenario: Cancelar a troca preserva a configuração anterior
- **WHEN** o usuário abre a tela via "Trocar avatar/voz" e clica em "Cancelar" sem confirmar
- **THEN** o sistema fecha a tela de seleção sem alterar `sess.heygenConfig` nem `projeto.json`, voltando ao estado anterior (seletor de aulas)

#### Scenario: Avatar ou voz configurados não constam mais na lista filtrada
- **WHEN** o usuário reabre a seleção e o `avatarId`/`voiceId` atualmente configurado não está mais entre os itens retornados (removido do workspace ou do filtro `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS`)
- **THEN** o sistema exibe a lista normalmente, sem nenhum item pré-marcado automaticamente a partir da configuração anterior, exigindo que o usuário escolha explicitamente antes de confirmar

#### Scenario: Trocar avatar/voz não reprocessa aulas já concluídas
- **WHEN** o usuário troca o avatar/voz do curso após já ter gerado vídeos para uma ou mais aulas com a configuração anterior
- **THEN** os vídeos e roteiros já gerados permanecem inalterados; apenas as próximas gerações de roteiro/vídeo usam a nova configuração
