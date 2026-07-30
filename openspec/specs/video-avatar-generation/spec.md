## Purpose

Gerar, para cada aula de um curso, um vídeo `.mp4` de um avatar digital
narrando um roteiro de fala calibrado pela duração (em segundos) escolhida
pelo usuário, via API do HeyGen (v3, fluxo "Avatar Video"), como uma etapa
opcional (Etapa 10) que não bloqueia nem é bloqueada pelas demais etapas do
pipeline, exceto exigir a Etapa 5 (Conteúdo) concluída.

## Requirements

### Requirement: Configuração de avatar, voz e narração do HeyGen, uma vez por curso
O sistema SHALL permitir que o usuário escolha, uma única vez por curso, o avatar, a voz e os controles avançados de narração (`expressiveness`, `motion_prompt`) do HeyGen que serão usados em todos os vídeos gerados naquele curso. As opções SHALL ser obtidas em tempo real do workspace HeyGen do usuário (não geradas por IA), via `GET /v3/avatars/looks` e `GET /v3/voices`. A escolha SHALL ser persistida em `sess.heygenConfig` e em `projeto.json`.

#### Scenario: Listar avatares e vozes do workspace
- **WHEN** o usuário abre a tela de configuração da Etapa 10 pela primeira vez num curso
- **THEN** o sistema busca `GET /v3/avatars/looks` e `GET /v3/voices` no HeyGen e apresenta as opções encontradas para seleção

#### Scenario: Workspace sem avatares ou vozes cadastrados
- **WHEN** o workspace HeyGen do usuário não tem nenhum avatar ou nenhuma voz cadastrados
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
