## Why

O pipeline hoje termina na Etapa 9 (roteiro de vídeo em blocos), cuja proposta
original registra como non-goal explícito "não gera vídeo nem áudio, apenas
o texto do roteiro — a produção do vídeo em si é externa ao sistema". Não
existe nenhuma integração com serviços de vídeo/avatar nem qualquer noção de
duração-alvo de fala em nenhuma camada do sistema (skill, template, sessão).
Queremos fechar o pipeline gerando o vídeo do avatar narrando o conteúdo de
cada aula via API do HeyGen, eliminando a etapa de produção externa manual e
mantendo o padrão de revisão humana já usado nas demais etapas (gerar →
baixar .docx → revisar → reenviar → confirmar).

## What Changes

- Nova skill `roteiroAvatarSkill` (skills.js): gera texto de fala corrida
  (diferente do formato em blocos da Etapa 9) a partir do conteúdo já gerado
  da aula (Etapa 5) e de uma duração-alvo em segundos informada pelo usuário,
  usando a heurística ~2,5 palavras/segundo (≈150 palavras/minuto) com
  tolerância de ±15%.
- Configuração HeyGen definida uma única vez por curso (mesmo padrão do
  `estiloVisual` da Etapa 8): seleção de avatar (`GET /v3/avatars/looks`),
  voz (`GET /v3/voices`) e controles avançados opcionais (`expressiveness`,
  `motion_prompt`), persistidos em `sess.heygenConfig`.
- Fluxo por aula, sem avanço automático entre aulas (diferente de
  Slides/Roteiro, que avançam sozinhas via `proximoIndex`): o usuário
  escolhe manualmente a aula a cada rodada, define a duração em segundos
  (só inteiros), gera o roteiro de fala, revisa/reenvia o `.docx` (reaproveita
  a infraestrutura genérica de import já existente, estendendo `detectStage`
  para o padrão `roteiroAvatar\d{2}`), confirma, e então dispara a geração
  do vídeo via HeyGen.
- Geração de vídeo: `POST /v3/videos` (avatar_id, voice_id, script,
  engine `avatar_iv`, aspect_ratio `16:9`, resolution `1080p`,
  `expressiveness`/`motion_prompt` quando configurados), polling em
  `GET /v3/videos/{id}` (mesmo padrão create→poll→download já usado para o
  Gamma), download do `.mp4` para `videos/aula{NN}_video.mp4` dentro da
  pasta do projeto (subpasta criada sob demanda).
- Novos campos em sessão/`projeto.json`: `heygenConfig`,
  `roteiroAvatarPendente`, `roteirosAvatarGerados`, `duracaoAvatarDefault`,
  `videosAvatarGerados` — restaurados em `POST /api/carregar-projeto`, mesmo
  padrão de `estiloVisual`/`roteiroBlocos`.
- Novas variáveis de ambiente: `HEYGEN_API_KEY`, `HEYGEN_API_BASE` (default
  `https://api.heygen.com`), `HEYGEN_POLL_INTERVAL_MS`,
  `HEYGEN_POLL_TIMEOUT_MS` — mesmo padrão das `GAMMA_*`.
- Decisão de versão de API: construir sobre a **API v3** do HeyGen (não
  v1/v2, que segundo a documentação oficial de migração seguem operantes
  apenas até 2026-10-31), sem SDK — fetch nativo + header `x-api-key`, mesmo
  estilo já usado para a integração com o Gamma.

## Capabilities

### New Capabilities
- `video-avatar-generation`: geração de vídeo com avatar (HeyGen) a partir
  de um roteiro de fala calibrado por duração em segundos, com revisão
  humana do roteiro antes do envio e download do `.mp4` pronto para a pasta
  do projeto.

### Modified Capabilities
(nenhuma — a capability `slides-generation` e a capability de roteiro em
blocos da Etapa 9 não têm requirements alterados; esta é uma etapa nova e
independente, decisão já validada com o usuário.)

## Impact

- **Código**: `server.js` (helpers de integração HeyGen, ~9 endpoints novos,
  extensão de `detectStage`, extensão de `saveProject` e da restauração em
  `POST /api/carregar-projeto`), `skills.js` (nova skill
  `roteiroAvatarSkill`), `public/index.html` e `public/app.js` (nova Etapa
  10 de UI).
- **Config**: `.env.example` ganha `HEYGEN_API_KEY`, `HEYGEN_API_BASE`,
  `HEYGEN_POLL_INTERVAL_MS`, `HEYGEN_POLL_TIMEOUT_MS`.
- **Sistema de arquivos**: nova subpasta `videos/` dentro da pasta de cada
  projeto (`courseRootDir`), criada sob demanda.
- **API externa**: nova dependência de serviço de terceiros (HeyGen v3),
  sem novo pacote npm — reutiliza `fetch` nativo, mesmo padrão do Gamma.
- **Não resolve nenhum Gap ID priorizado existente (G01–G07)** — é uma
  capability nova, não uma correção de gap conhecido.
- **Non-goals**: não criar/editar/clonar avatares ou vozes via API (só
  consome o que já existe no workspace HeyGen); não expor avatar/voz/
  expressividade/motion_prompt por aula (é uma escolha por curso); não
  implementar aprovação "in-app" do vídeo (revisão continua sendo o humano
  abrir o `.mp4` na pasta, mesmo padrão do `.pptx`/`.docx`); não usar
  `callback_url`/webhook nesta primeira versão (polling simples, mesmo
  padrão do Gamma); não dar suporte a múltiplas contas/workspaces do HeyGen
  nesta fase.
