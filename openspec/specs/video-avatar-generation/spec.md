## Purpose

Gerar, para cada aula de um curso, um vídeo `.mp4` de um avatar digital
narrando um roteiro de fala calibrado pela duração (em segundos) escolhida
pelo usuário, via API do HeyGen (v3, fluxo "Avatar Video"), como uma etapa
opcional (Etapa 10) que não bloqueia nem é bloqueada pelas demais etapas do
pipeline, exceto exigir a Etapa 5 (Conteúdo) concluída.
## Requirements
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

### Requirement: Duração-alvo do vídeo em segundos, validada como número inteiro
O sistema SHALL exigir que o usuário informe, por aula, uma duração-alvo de vídeo em segundos, aceitando apenas números inteiros positivos. O valor informado SHALL ser o valor sticky padrão (pré-preenchido) na próxima vez que essa aula (ou qualquer aula, seguindo o padrão sticky já usado na Etapa 8) for aberta.

#### Scenario: Entrada válida
- **WHEN** o usuário digita um número inteiro (ex.: 15, 30, 120) no campo de duração
- **THEN** o sistema aceita o valor e permite prosseguir para a geração do roteiro

#### Scenario: Entrada inválida rejeitada
- **WHEN** o usuário tenta enviar um valor não inteiro, negativo, zero ou não numérico como duração
- **THEN** o sistema rejeita a submissão (validação client-side impedindo caracteres não numéricos e validação server-side com HTTP 400) sem gerar nenhum roteiro

#### Scenario: Valor sticky entre aulas
- **WHEN** o usuário gera um roteiro com sucesso usando uma duração de N segundos
- **THEN** a próxima aula aberta na Etapa 10 vem com N segundos pré-preenchido como sugestão, podendo ser alterado

### Requirement: Geração de roteiro de fala calibrado pela duração informada
O sistema SHALL gerar, via OpenAI, um texto de fala corrida (sem marcações de cena/câmera) a partir do conteúdo já produzido da aula (Etapa 5) e da duração-alvo em segundos, usando uma heurística de ritmo de fala para estimar o tamanho do texto (aproximadamente 2,5 palavras por segundo). Quanto maior a duração informada, mais detalhado o conteúdo do texto gerado.

#### Scenario: Roteiro curto
- **WHEN** o usuário define uma duração de 15 segundos para uma aula
- **THEN** o sistema gera um texto de fala objetivo, com extensão compatível com ~37 palavras (±15%)

#### Scenario: Roteiro longo e mais detalhado
- **WHEN** o usuário define uma duração de 120 segundos para a mesma aula
- **THEN** o sistema gera um texto de fala mais desenvolvido, com mais exemplos/explicações, compatível com ~300 palavras (±15%)

#### Scenario: Aula sem conteúdo gerado ainda
- **WHEN** o usuário tenta abrir a Etapa 10 para um curso cuja Etapa 5 (conteúdo por aula) não foi concluída
- **THEN** o sistema rejeita a solicitação e informa que a Etapa 5 precisa ser concluída antes

### Requirement: Roteiro de avatar persistido em .txt e .docx, revisável por humano
Cada roteiro de avatar gerado SHALL ser salvo como `roteiroAvatar{NN}.txt` (para reprocessamento) e `roteiroAvatar{NN}.docx` (para revisão humana) na pasta do projeto, seguindo o mesmo padrão de persistência dupla usado pelas demais etapas de texto do pipeline. O sistema SHALL permitir que o usuário baixe esse `.docx`, edite localmente e reenvie a versão revisada, que substitui o texto que será usado na geração do vídeo.

#### Scenario: Geração inicial do roteiro
- **WHEN** o roteiro de fala é gerado com sucesso para a aula N
- **THEN** o sistema grava `roteiroAvatar{NN}.txt` e `roteiroAvatar{NN}.docx` na pasta do projeto e registra a origem como `fonte: 'ia'` em `projeto.stages`

#### Scenario: Reenvio de versão editada
- **WHEN** o usuário edita `roteiroAvatar{NN}.docx` localmente e o reenvia pelo fluxo de importação do sistema
- **THEN** o sistema reconhece o padrão de nome `roteiroAvatar\d{2}`, extrai o texto, sobrescreve `roteiroAvatar{NN}.txt` e registra a origem como `fonte: 'usuario'`

### Requirement: Envio do roteiro confirmado ao HeyGen para geração do vídeo
O sistema SHALL permitir, após o roteiro de uma aula estar confirmado (versão gerada pela IA ou reenviada pelo usuário), que o usuário dispare a geração do vídeo, enviando o texto final e a configuração de avatar/voz/controles avançados do curso para `POST /v3/videos` do HeyGen, e SHALL aguardar a conclusão fazendo polling em `GET /v3/videos/{video_id}`.

#### Scenario: Disparo da geração de vídeo
- **WHEN** o usuário confirma o roteiro da aula N e aciona a geração do vídeo
- **THEN** o sistema envia `POST /v3/videos` com `avatar_id`, `voice_id`, `script` (texto do roteiro confirmado) e, quando configurados, `expressiveness`/`motion_prompt` do curso

#### Scenario: Espera pela conclusão
- **WHEN** o vídeo está em processamento no HeyGen (`status: waiting` ou `processing`)
- **THEN** o sistema informa progresso ao usuário via SSE e continua o polling até `completed`, `failed`, ou até estourar o tempo limite configurado

#### Scenario: Falha ou timeout na geração
- **WHEN** o HeyGen retorna `status: failed` ou o tempo limite de polling é atingido
- **THEN** o sistema emite um erro claro ao usuário e não registra nenhum vídeo em `videosAvatarGerados`/`projeto.stages`

### Requirement: Download do vídeo pronto para a subpasta videos/ do projeto
Quando o HeyGen concluir a geração (`status: completed`), o sistema SHALL baixar o vídeo e salvá-lo em `videos/aula{NN}_video.mp4` dentro da pasta do projeto (`courseRootDir`), criando a subpasta `videos/` se ela ainda não existir.

#### Scenario: Subpasta videos/ ainda não existe
- **WHEN** o primeiro vídeo de um projeto é gerado com sucesso e a pasta `videos/` ainda não existe dentro da pasta do projeto
- **THEN** o sistema cria a subpasta `videos/` antes de gravar o arquivo `.mp4`

#### Scenario: Vídeo gravado e registrado
- **WHEN** o download do `.mp4` termina com sucesso
- **THEN** o sistema registra o vídeo em `sess.videosAvatarGerados` e em `projeto.stages`, e a interface exibe o nome do arquivo gerado ao usuário

### Requirement: Seleção manual de aula, sem avanço automático
A Etapa 10 SHALL exigir que o usuário selecione manualmente a aula a trabalhar a cada rodada do fluxo (definir duração → gerar roteiro → revisar → enviar ao HeyGen → obter vídeo), sem avançar sozinha para a aula seguinte ao final do processo — diferente das Etapas 8 e 9, que avançam automaticamente para a próxima aula após cada geração.

#### Scenario: Conclusão de uma aula não avança automaticamente
- **WHEN** o vídeo de uma aula é baixado com sucesso
- **THEN** o sistema mantém o seletor de aula disponível para escolha manual, sem abrir automaticamente a próxima aula

#### Scenario: Trocar de aula a qualquer momento
- **WHEN** o usuário seleciona uma aula diferente no seletor de aulas da Etapa 10
- **THEN** o sistema carrega os parâmetros/roteiro/vídeo já existentes para aquela aula (se houver) ou inicia um novo ciclo para ela

### Requirement: Restauração do estado da Etapa 10 ao recarregar um projeto
O sistema SHALL restaurar, ao carregar um projeto salvo via `POST /api/carregar-projeto`, os campos `heygenConfig`, `roteirosAvatarGerados`, `duracaoAvatarDefault` e `videosAvatarGerados` a partir de `projeto.json`, evitando que o usuário precise reconfigurar avatar/voz ou refazer roteiros e vídeos já gerados.

#### Scenario: Reabrir projeto com configuração e vídeos já existentes
- **WHEN** o usuário carrega um projeto que já tinha `heygenConfig` definido e vídeos gerados para algumas aulas
- **THEN** a Etapa 10 é restaurada mostrando a configuração já definida e a lista de vídeos já gerados, sem exigir nova configuração

### Requirement: Erro claro quando HEYGEN_API_KEY não está configurada
O sistema SHALL verificar, antes de qualquer chamada de rede à API do HeyGen, se a variável de ambiente `HEYGEN_API_KEY` está definida e não vazia, e SHALL retornar um erro citando explicitamente o nome da variável e apontando para `.env.example` quando ela estiver ausente — em vez de deixar a chamada prosseguir e falhar com um erro genérico de autenticação da API do HeyGen.

#### Scenario: HEYGEN_API_KEY ausente ao listar avatares ou vozes
- **WHEN** o usuário aciona `GET /api/heygen/avatares` ou `GET /api/heygen/vozes` com `HEYGEN_API_KEY` ausente ou vazia no `.env`
- **THEN** o sistema responde com um erro citando `HEYGEN_API_KEY` e `.env.example`, sem chegar a chamar a API do HeyGen

#### Scenario: HEYGEN_API_KEY ausente ao gerar o vídeo
- **WHEN** o usuário aciona `GET /api/video-avatar/gerar` com `HEYGEN_API_KEY` ausente ou vazia no `.env`
- **THEN** o evento SSE `error` cita `HEYGEN_API_KEY` e `.env.example`, e nenhum arquivo `.mp4` é gerado

#### Scenario: HEYGEN_API_KEY presente segue o fluxo normal
- **WHEN** `HEYGEN_API_KEY` está definida e não vazia
- **THEN** o sistema chama a API do HeyGen normalmente, sem nenhuma mudança de comportamento em relação ao existente

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

