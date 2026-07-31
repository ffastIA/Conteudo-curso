## MODIFIED Requirements

### Requirement: Configuração de avatar, voz e narração do HeyGen, uma vez por curso
O sistema SHALL permitir que o usuário escolha, uma única vez por curso, o avatar, a voz e os controles avançados de narração (`expressiveness`, `motion_prompt`) do HeyGen que serão usados em todos os vídeos gerados naquele curso. As opções de avatar SHALL ser obtidas em tempo real do workspace HeyGen do usuário (não geradas por IA), via `GET /v3/avatars/looks`. As opções de voz SHALL ser obtidas da mesma forma via `GET /v3/voices`, filtradas por `language: "Portuguese"` por padrão (único valor de português exposto pela API do HeyGen — sem distinção entre Brasil e Portugal), salvo quando o cliente especificar explicitamente outro idioma. Quando a variável de ambiente `HEYGEN_AVATAR_IDS` estiver configurada (lista de IDs separados por vírgula), o sistema SHALL restringir as opções de avatar apresentadas apenas aos itens cujo `id` conste nessa lista; quando `HEYGEN_VOICE_IDS` estiver configurada (mesmo formato), o sistema SHALL restringir as opções de voz apenas aos itens cujo `voice_id` conste nessa lista. Quando a variável correspondente estiver ausente ou vazia, nenhum filtro é aplicado e todas as opções do workspace são apresentadas (comportamento atual). A escolha SHALL ser persistida em `sess.heygenConfig` e em `projeto.json`.

#### Scenario: Listar avatares e vozes do workspace
- **WHEN** o usuário abre a tela de configuração da Etapa 10 pela primeira vez num curso
- **THEN** o sistema busca `GET /v3/avatars/looks` e `GET /v3/voices` no HeyGen e apresenta as opções encontradas para seleção

#### Scenario: Vozes filtradas por português por padrão
- **WHEN** o cliente chama `GET /api/heygen/vozes` sem especificar `?language=` na query
- **THEN** o sistema filtra o resultado por `language: "Portuguese"` junto ao HeyGen, retornando apenas vozes em português

#### Scenario: Workspace sem avatares ou vozes cadastrados
- **WHEN** o workspace HeyGen do usuário não tem nenhum avatar ou nenhuma voz em português cadastrados
- **THEN** o sistema exibe a lista vazia sem erro e comunica que é preciso criar avatar/voz diretamente no HeyGen antes de continuar

#### Scenario: Confirmar configuração
- **WHEN** o usuário seleciona um avatar e uma voz (e, opcionalmente, `expressiveness` e/ou `motion_prompt`) e confirma
- **THEN** o sistema grava `sess.heygenConfig = { avatarId, avatarName, voiceId, voiceName, expressiveness, motionPrompt }`, persiste em `projeto.json` e libera o restante do fluxo da Etapa 10

#### Scenario: Reutilizar configuração já definida
- **WHEN** o usuário já confirmou `heygenConfig` neste curso (nesta sessão ou restaurado de um projeto salvo) e abre a Etapa 10 novamente
- **THEN** o sistema pula direto para a seleção de aula, sem reabrir a tela de configuração

#### Scenario: Lista de avatares restrita por HEYGEN_AVATAR_IDS
- **WHEN** `HEYGEN_AVATAR_IDS` está configurada no `.env` com uma lista de IDs (ex.: `av_1,av_3`) e o workspace HeyGen tem mais avatares além desses
- **THEN** `GET /api/heygen/avatares` retorna apenas os avatares cujo `id` está na lista, mantendo nome, thumbnail e tipo de cada um

#### Scenario: Lista de vozes restrita por HEYGEN_VOICE_IDS
- **WHEN** `HEYGEN_VOICE_IDS` está configurada no `.env` com uma lista de IDs e o workspace HeyGen tem mais vozes além dessas
- **THEN** `GET /api/heygen/vozes` retorna apenas as vozes cujo `voice_id` está na lista, mantendo nome e idioma de cada uma

#### Scenario: HEYGEN_AVATAR_IDS/HEYGEN_VOICE_IDS ausentes ou vazias
- **WHEN** `HEYGEN_AVATAR_IDS` e/ou `HEYGEN_VOICE_IDS` não estão definidas no `.env` (ou estão vazias)
- **THEN** o sistema não aplica nenhum filtro e retorna todos os avatares/vozes do workspace, como no comportamento atual
