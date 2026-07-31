## MODIFIED Requirements

### Requirement: Configuração de avatar, voz e narração do HeyGen, uma vez por curso
O sistema SHALL permitir que o usuário escolha, uma única vez por curso, o avatar, a voz e os controles avançados de narração (`expressiveness`, `motion_prompt`) do HeyGen que serão usados em todos os vídeos gerados naquele curso. As opções de avatar SHALL ser obtidas em tempo real dos grupos de avatar próprios do usuário (não geradas por IA, e não incluindo o catálogo público de avatares do HeyGen), via `GET /v2/avatar_group.list?include_public=false` seguido de `GET /v2/avatar_group/{group_id}/avatars` para cada grupo. As opções de voz SHALL ser obtidas via `GET /v3/voices`, paginado completamente (seguindo `has_more`/`next_token` até esgotar o catálogo, não apenas a primeira página), e SHALL incluir tanto vozes públicas quanto vozes privadas/clonadas do usuário quando o cliente não especificar um `type` explícito. Vozes públicas SHALL ser filtradas por `language: "Portuguese"` por padrão (único valor de português exposto pela API do HeyGen — sem distinção entre Brasil e Portugal), salvo quando o cliente especificar explicitamente outro idioma; vozes privadas/clonadas NÃO SHALL ser filtradas por idioma (elas tipicamente não têm idioma marcado na API do HeyGen, e o filtro de idioma do HeyGen as excluiria mesmo sendo vozes legítimas do usuário). A escolha SHALL ser persistida em `sess.heygenConfig` e em `projeto.json`.

#### Scenario: Listar avatares e vozes do workspace
- **WHEN** o usuário abre a tela de configuração da Etapa 10 pela primeira vez num curso
- **THEN** o sistema busca os grupos de avatar próprios do usuário (e os looks de cada grupo) e as vozes via `GET /v3/voices` (paginando completamente) no HeyGen, e apresenta as opções encontradas para seleção

#### Scenario: Avatares próprios do usuário, não o catálogo público do HeyGen
- **WHEN** o sistema busca as opções de avatar para a Etapa 10
- **THEN** o sistema retorna apenas avatares dos grupos próprios do usuário (`GET /v2/avatar_group.list?include_public=false`), nunca avatares públicos/stock do catálogo geral do HeyGen

#### Scenario: Vozes além da primeira página do HeyGen
- **WHEN** o workspace HeyGen do usuário tem mais vozes do que cabem em uma página (`has_more: true` na resposta)
- **THEN** o sistema segue `next_token` e continua buscando até a última página, incluindo essas vozes na lista apresentada

#### Scenario: Vozes públicas filtradas por português por padrão
- **WHEN** o cliente chama `GET /api/heygen/vozes` sem especificar `?language=` nem `?type=` na query
- **THEN** o sistema filtra as vozes públicas por `language: "Portuguese"` junto ao HeyGen, mas busca todas as vozes privadas do usuário sem esse filtro de idioma

#### Scenario: Vozes privadas/clonadas incluídas por padrão
- **WHEN** o cliente chama `GET /api/heygen/vozes` sem especificar `?type=` na query
- **THEN** o sistema busca tanto `type=public` quanto `type=private` no HeyGen e retorna as vozes de ambos combinadas

#### Scenario: Tipo de voz especificado explicitamente não é combinado
- **WHEN** o cliente chama `GET /api/heygen/vozes?type=public` (ou `?type=private`) explicitamente
- **THEN** o sistema busca apenas o tipo especificado, sem combinar com o outro tipo

#### Scenario: Workspace sem avatares ou vozes cadastrados
- **WHEN** o workspace HeyGen do usuário não tem nenhum avatar ou nenhuma voz (pública em português ou privada) cadastrados
- **THEN** o sistema exibe a lista vazia sem erro e comunica que é preciso criar avatar/voz diretamente no HeyGen antes de continuar

#### Scenario: Confirmar configuração
- **WHEN** o usuário seleciona um avatar e uma voz (e, opcionalmente, `expressiveness` e/ou `motion_prompt`) e confirma
- **THEN** o sistema grava `sess.heygenConfig = { avatarId, avatarName, voiceId, voiceName, expressiveness, motionPrompt }`, persiste em `projeto.json` e libera o restante do fluxo da Etapa 10

#### Scenario: Reutilizar configuração já definida
- **WHEN** o usuário já confirmou `heygenConfig` neste curso (nesta sessão ou restaurado de um projeto salvo) e abre a Etapa 10 novamente
- **THEN** o sistema pula direto para a seleção de aula, sem reabrir a tela de configuração
