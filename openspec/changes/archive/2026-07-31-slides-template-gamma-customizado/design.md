## Context

A Etapa 8 (`server.js`, `GET /api/slides/gerar`) hoje monta um único
payload para `POST /generations` da API do Gamma (v1.0), combinando:
`inputText` (conteúdo da aula), `textMode: "condense"`, `numCards`
(quantidade escolhida), `textOptions` (`amount`, `audience`, `tone`,
`language`), `imageOptions.style` (estilo visual escolhido + título da
aula), `cardOptions.dimensions: "16x9"`, `additionalInstructions`
(observação da aula) e `exportAs: "pptx"`.

A API do Gamma expõe um segundo endpoint, `POST /generations/from-template`,
que recebe `gammaId` (ID de uma apresentação Gamma já existente) + `prompt`
(texto único com o conteúdo/instruções) e preserva a estrutura/layout do
template por padrão. Esse endpoint **não** aceita `numCards`, `textMode`,
`cardOptions` nem `textOptions` — só `gammaId`, `prompt`, `title`,
`themeId`, `folderIds`, `exportAs`, `imageOptions.{model,style}` e
`sharingOptions.*`. A API também expõe `GET /v1.0/gammas/{gammaId}`, que
retorna metadados de qualquer gamma acessível pela conta (incluindo
`title`), independente de ter sido criada via API ou não — é isso que
permite resolver nome a partir do ID.

O usuário tem múltiplos templates prontos no Gamma e quer escolher, por
curso, qual usar — pediu explicitamente para seguir a mesma lógica já
existente no projeto para `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` (Etapa
10): uma lista de IDs permitidos via `.env` (CSV), resolvida para nomes
legíveis, apresentada como menu de seleção antes da geração.

## Goals / Non-Goals

**Goals:**
- Permitir configurar, via `.env`, uma lista de templates Gamma
  disponíveis (`GAMMA_TEMPLATE_IDS`), com nomes resolvidos pela própria
  API do Gamma — sem hardcode de nomes no código.
- Deixar o usuário escolher, por curso, qual template usar (ou nenhum),
  reaplicando essa escolha a todas as aulas do curso.
- Manter 100% de compatibilidade retroativa: sem `GAMMA_TEMPLATE_IDS`
  configurada, nada muda no comportamento nem na UI atuais.
- Não introduzir dependência npm nova.

**Non-Goals:**
- Descobrir/listar automaticamente todos os templates da conta Gamma sem
  configuração prévia — a API do Gamma não expõe um endpoint de listagem
  geral de gammas do workspace (só consulta por ID já conhecido), então a
  lista de IDs continua vindo do `.env`, como no HeyGen.
- Template por aula dentro do mesmo curso — a seleção é por curso.
- UI de administração para editar a lista de `GAMMA_TEMPLATE_IDS`.

## Decisions

### Decisão 1 — Padrão HeyGen adaptado: CSV + resolução de nome + picker, não um único ID fixo
`GAMMA_TEMPLATE_IDS` é uma lista CSV parseada com o `parseCsvEnv` já
existente (`server.js:53`), reaproveitado sem duplicação — mesma função
usada por `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` (`server.js:60-61`).

**Diferença importante em relação ao padrão HeyGen:** `listarAvataresHeygen`/
`listarVozesHeygen` (`server.js:1066-1137`) buscam **todos** os itens da
conta HeyGen e depois filtram pelo CSV, porque a API do HeyGen expõe
endpoints de listagem completa. A API do Gamma **não** tem um endpoint
equivalente para listar todas as apresentações da conta — só
`GET /gammas/{gammaId}`, que exige o ID conhecido. Por isso
`listarTemplatesGamma()` faz o caminho inverso: para cada ID já presente em
`GAMMA_TEMPLATE_IDS`, chama `GET /gammas/{id}` individualmente e usa o
`title` retornado. O resultado observável para o usuário (uma lista
`{id, title}` restrita aos IDs configurados) é o mesmo; o mecanismo interno
é necessariamente diferente.

**Alternativa considerada:** manter `GAMMA_TEMPLATE_ID` singular (proposta
original desta change). Substituída porque o usuário confirmou que precisa
escolher entre múltiplos templates por curso, não um único fixo.

### Decisão 2 — ID inacessível/inválido é omitido da lista, não quebra o endpoint
Se `GET /gammas/{id}` falhar para um dos IDs configurados (removido,
arquivado, sem acesso), `listarTemplatesGamma()` SHALL logar um aviso
(`console.warn`, mesmo padrão de tolerância a erro já usado no projeto) e
omitir esse ID do resultado, em vez de falhar toda a chamada
`GET /api/slides/templates`. Evita que um ID desatualizado no `.env`
derrube a Etapa 8 inteira para o usuário.

### Decisão 3 — Seleção fica em `sess.slidesTemplate`, mesmo padrão de `sess.heygenConfig`
`POST /api/slides/template` grava `sess.slidesTemplate = { id, title }`,
validando que `id` está entre os `GAMMA_TEMPLATE_IDS` configurados (400
caso contrário — mesmo padrão de validação de `POST /api/heygen/config`).
Persistido via `saveProject` (perto de `server.js:918-924`, junto de
`estiloVisual`/`heygenConfig`) e restaurado ao carregar o projeto (perto de
`server.js:2725-2731`). `GET /api/slides/gerar` usa
`POST /generations/from-template` sempre que `sess.slidesTemplate` estiver
definido nesta sessão — a condição de ativação do modo template deixou de
ser "env var presente" e passou a ser "usuário selecionou um template
nesta sessão", já que agora pode haver mais de uma opção.

### Decisão 4 — Seleção de template é obrigatória quando `GAMMA_TEMPLATE_IDS` está configurada
Espelhando o fluxo de avatar/voz do HeyGen (onde a seleção é obrigatória
antes de gerar vídeo, `server.js:1911`/`2022`), quando
`GAMMA_TEMPLATE_IDS` tiver ao menos um ID válido, `GET /api/slides/parametros`
SHALL exigir `sess.slidesTemplate` definido (400 pedindo para escolher um
template, mesmo padrão do guard existente de `estiloVisual`,
`server.js:1630`) antes de montar os parâmetros de qualquer aula.

### Decisão 5 (Open Question resolvida por padrão, sinalizada para revisão) — Seleção de estilo visual continua exigida mesmo com template escolhido
A seleção de estilo visual (`sess.estiloVisual`, requisito existente
"Menu de estilos visuais coerente com o perfil do curso") **continua sendo
exigida** mesmo quando um template Gamma foi selecionado — nenhuma mudança
nesse gate. Na prática, quando há um template selecionado, seu
`housePrompt` deixa de ser usado no `imageOptions.style` (que passa a
referenciar só o tema da aula, ver requisito de imagens), mas o usuário
ainda passa pela tela de escolha de estilo. Optou-se por não remover essa
exigência para manter o escopo desta mudança pequeno (nenhuma alteração no
fluxo de `estiloVisual` em si) — ver "Open Questions" abaixo.

### Decisão 6 — Prompt combinado substitui os campos estruturados ausentes (mantida da versão anterior deste design)
Como `from-template` não tem `textOptions`/`additionalInstructions`
dedicados, o `prompt` enviado é montado concatenando: (1) a instrução fixa
de preservação de layout/logo fornecida pelo usuário, (2) público-
alvo/nível/tom, (3) o conteúdo da aula, (4) a observação complementar da
aula, quando preenchida. A quantidade de slides escolhida (1-5) também vira
instrução textual dentro do prompt, já que `numCards` não existe nesse
endpoint — o menu de escolha de quantidade na UI não muda.

## Risks / Trade-offs

- **[Risco] `GET /gammas/{id}` uma chamada por ID configurado, a cada
  abertura da Etapa 8** → Mitigação: `GAMMA_TEMPLATE_IDS` tende a ter
  poucos itens (uma mão cheia de templates); sem cache adicional
  necessário para esse volume — se crescer, dá para aplicar o mesmo padrão
  de cache em memória já usado para o template de roteiro
  (`_roteiroTemplateCache`, `server.js:252`).
- **[Risco] Prompt livre não garante contagem exata de cards** → Mitigação:
  igual à versão anterior deste design — instrução explícita de
  quantidade + revisão humana por aula antes de avançar.
- **[Risco] `gammaId` selecionado pode perder acesso depois de já
  selecionado na sessão** → Mitigação: erro da API do Gamma nesse caso cai
  no tratamento de erro genérico já existente em `GET /api/slides/gerar`
  (`server.js:1729-1735`), emitindo evento SSE `error` sem quebrar o
  servidor.
- **[Trade-off] Tela extra de seleção mesmo para quem só tem um template
  configurado** → Aceito: mesmo com um único ID em `GAMMA_TEMPLATE_IDS`, o
  fluxo passa pela tela de seleção (não seleciona automaticamente) —
  consistente com o padrão HeyGen, que também exige clique de confirmação
  mesmo com um único avatar/voz disponível.

## Migration Plan

- Mudança aditiva e opt-in via `.env` — sem `GAMMA_TEMPLATE_IDS` definida,
  nenhum comportamento ou tela muda.
- Ativação: adicionar `GAMMA_TEMPLATE_IDS=g_vp0mr1stb6e8vch,...` ao `.env`
  local do usuário (não commitado, mesmo padrão de `HEYGEN_AVATAR_IDS`).

## Open Questions

- Confirmar com o usuário se a seleção de estilo visual (`estiloVisual`)
  deveria deixar de ser obrigatória quando um template Gamma já foi
  selecionado (Decisão 5) — assumido "continua obrigatória" para manter o
  escopo mínimo; fácil de revisar depois se o usuário preferir que a
  escolha de template substitua a de estilo visual.
