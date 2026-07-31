## Why

Hoje a Etapa 8 (Slides) descreve a identidade visual do curso só em texto
livre (`imageOptions.style`, baseado no `housePrompt` do estilo escolhido),
deixando a IA do Gamma decidir layout, posição de elementos e composição a
cada geração — sem garantia de consistência entre aulas. A API do Gamma
oferece um endpoint dedicado, `POST /generations/from-template`, que parte
de uma apresentação Gamma já existente (`gammaId`) e preserva sua
estrutura/layout por padrão, alterando só o que o prompt pedir
explicitamente — permitindo fixar elementos de marca (ex.: logo em posição
fixa) de forma determinística. O usuário tem mais de um template pronto no
Gamma e quer poder escolher, curso a curso, qual usar — em vez de um único
template fixo — seguindo o mesmo padrão já validado no projeto para
`HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` (Etapa 10): uma lista de IDs
permitidos via `.env`, resolvida para nomes legíveis pela API externa, e
apresentada como um menu de seleção.

## What Changes

- Nova variável de ambiente opcional `GAMMA_TEMPLATE_IDS` (CSV, mesmo
  formato/parsing de `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` — reutiliza
  `parseCsvEnv`, `server.js:53`), listando os `gammaId` dos templates
  disponíveis para seleção. Vazio/ausente = funcionalidade de template
  desativada (comportamento 100% igual ao atual).
- Novo endpoint `GET /api/slides/templates`: quando a Etapa 8 é aberta e
  `GAMMA_TEMPLATE_IDS` está configurada, resolve cada ID para o nome do
  template consultando `GET /v1.0/gammas/{gammaId}` da API do Gamma
  (campo `title` da resposta) e retorna a lista `{ id, title }` para
  exibição.
- Novo endpoint `POST /api/slides/template`: grava a escolha do usuário
  (`sess.slidesTemplate = { id, title }`), persistida em `projeto.json` e
  restaurada ao recarregar o projeto — mesmo padrão de `sess.heygenConfig`
  (`server.js:1599-1613`, `2731`).
- Nova seção na UI da Etapa 8 (`public/index.html`/`public/app.js`), com
  lista de rádio dos templates disponíveis (nome + confirmação), exibida
  somente quando `GET /api/slides/templates` retorna ao menos um item —
  mesmo padrão visual/funcional de `#heygenAvataresList`/
  `#heygenVozesList` (Etapa 10).
- Quando o usuário seleciona um template para o curso, `GET
  /api/slides/gerar` passa a chamar `POST /generations/from-template`
  (em vez de `POST /generations`) para todas as aulas do curso, enviando
  `gammaId` = ID selecionado e um `prompt` combinado (instrução fixa de
  preservação de layout/logo + conteúdo da aula + observação
  complementar), já que esse endpoint não tem campos estruturados
  equivalentes a `additionalInstructions`/`textOptions`/`numCards`.
- Quando `GAMMA_TEMPLATE_IDS` não estiver configurada (ou o curso não
  tiver um template selecionado), o comportamento permanece exatamente o
  atual (`POST /generations` com `imageOptions.style`).

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `slides-generation`: adiciona seleção de template Gamma customizado por
  curso (lista via `GAMMA_TEMPLATE_IDS`, nomes resolvidos pela API do
  Gamma, seleção via nova UI) e o modo de geração a partir desse template
  (`POST /generations/from-template`) como alternativa ao modo atual por
  estilo livre (`POST /generations`), mantendo este último como
  comportamento padrão/fallback quando nenhum template estiver
  configurado ou selecionado.

## Impact

- **Código:** `server.js` — nova função `listarTemplatesGamma()` (análoga
  a `listarAvataresHeygen`/`listarVozesHeygen`, `server.js:1066-1137`),
  novas rotas `GET /api/slides/templates` e `POST /api/slides/template`
  (análogas a `/api/heygen/avatares`/`/api/heygen/config`), guard em
  `GET /api/slides/parametros` (perto de `server.js:1630`) exigindo
  template selecionado quando `GAMMA_TEMPLATE_IDS` está configurada,
  payload de `GET /api/slides/gerar` (`server.js:1685-1704`) e a função
  auxiliar `criarGeracaoGamma` (`server.js:1706`), persistência/restauração
  em `saveProject`/carregar-projeto (perto de `server.js:918-924`,
  `2725-2731`).
- **Config:** `.env.example` — nova entrada `GAMMA_TEMPLATE_IDS` (opcional,
  comentada, formato `g_xxxxxxxxxxxx,g_yyyyyyyyyyyy`), mesmo padrão de
  `HEYGEN_AVATAR_IDS`.
- **API externa:** nenhuma dependência npm nova; usa a mesma API pública do
  Gamma (`public-api.gamma.app/v1.0`) já integrada — endpoints adicionais
  `GET /gammas/{gammaId}` (resolver nome) e `POST /generations/from-template`
  (gerar com template).
- **Frontend:** `public/app.js`/`public/index.html` — nova seção de
  seleção de template na Etapa 8, seguindo o padrão visual das listas de
  avatar/voz do HeyGen (Etapa 10).
- **Testes:** `npm test` deve cobrir resolução de nomes via
  `GET /api/slides/templates`, persistência da seleção, e o branch de
  payload em `GET /api/slides/gerar` (com e sem template selecionado).

## Non-goals

- Importação de templates a partir de fontes externas (PDF, PPTX, Canva,
  URL arbitrária) — cada template precisa já existir como uma apresentação
  dentro da conta Gamma do usuário e estar listado em `GAMMA_TEMPLATE_IDS`.
- Gerenciar/editar a lista de templates disponíveis pela própria interface
  do sistema — a lista de IDs permitidos continua sendo definida só via
  `.env` (mesmo padrão de `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS`), sem tela
  de administração.
- Suporte a mais de um template simultâneo dentro do mesmo curso (ex.: um
  template por aula) — a seleção é única por curso e vale para todas as
  aulas geradas nesse ciclo.
- Resolver a decisão adiada de múltiplas contas/chaves Gamma — esta
  mudança assume uma única `GAMMA_API_KEY` (já existente), só a lista de
  templates dentro dessa conta é configurável.
