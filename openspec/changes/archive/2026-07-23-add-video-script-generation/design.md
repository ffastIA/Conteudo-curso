## Context

O pipeline hoje (Etapas 0-8) sempre gera conteúdo direto, sem pausa para revisão
humana antes da chamada à IA — o único ponto de "edição" existente é o fluxo
totalmente separado de importar um `.docx` editado externamente no Word
(`POST /api/importar` → `POST /api/importar/confirmar`). A Etapa 9 (Roteiros)
precisa de um novo padrão de interação: montar um prompt localmente (sem IA),
mostrá-lo editável, e só chamar a IA depois de uma aprovação explícita do usuário —
repetido uma vez por aula, avançando automaticamente após cada geração.

A etapa mais próxima estruturalmente é a Etapa 8 (Slides): opcional, independente,
com uma escolha prévia feita uma única vez por curso (lá, estilo visual; aqui, número
de blocos) e um loop de geração por aula que persiste um arquivo por aula — mesma
relação 1:1 entre aula e arquivo gerado que Roteiros deve seguir.

**Cardinalidade — ponto crítico**: o número de roteiros gerados é **sempre igual ao
número de aulas do curso** (`sess.aulas.length`), nunca um número fixo. Um curso com
5 aulas gera exatamente 5 arquivos (`roteiro01.docx` … `roteiro05.docx`); um curso
com 6 aulas gera exatamente 6; e assim por diante — a mesma relação 1:1 já usada em
`aula{NN}_conteudo` (Etapa 5) e `aula{NN}_slides` (Etapa 8). Cada aula recebe **um
único roteiro**, com o número de blocos definido pelo usuário (1-6) aplicado
igualmente a todas as aulas — não há uma contagem fixa de roteiros por curso nem
múltiplos roteiros por aula.

## Goals / Non-Goals

**Goals:**
- Gerar exatamente **um roteiro por aula do curso** — total de arquivos = número de
  aulas em `sess.aulas`, determinado dinamicamente a cada curso, nunca hardcoded.
- Montar automaticamente, por aula, o prompt de roteiro a partir de
  `PromptRoteiro.docx` + dados já existentes em `sess.aulas`/`sess.config`.
- Permitir revisão/edição do prompt pelo usuário antes de qualquer chamada à IA.
- Gerar o roteiro via IA em streaming (SSE) e persistir `roteiro{NN}.docx`/`.txt`
  (um par por aula).
- Avançar automaticamente para a próxima aula após cada geração aprovada, até
  esgotar todas as aulas do curso (última aula = `sess.aulas.length - 1`).
- Reaproveitar ao máximo padrões e helpers já existentes (`persistStage`,
  `pedagCtxBlock`, `streamSSE`, `clientAbort`, `sseHeaders`/`send`).

**Non-Goals:**
- Não gera vídeo, áudio ou imagem — apenas o texto do roteiro em blocos.
- Não gera mais de um roteiro por aula, nem um número fixo de roteiros
  independente da quantidade real de aulas do curso.
- Não adiciona um campo estruturado de "idade"/faixa etária ao `CourseConfig` —
  reaproveita `sess.config.publico` (decisão já tomada em
  `openspec/changes/archive/2026-06-29-add-age-group-review/`).
- Não permite escolher número de blocos por aula individualmente (só uma vez, por
  curso inteiro, reaplicado a todas as aulas).
- Não altera `PromptRoteiro.docx` nem adiciona um editor de template no produto —
  o arquivo é lido como está, com substituição tolerante ao espaço espúrio do
  placeholder de TEMA.
- Não resolve nenhum dos Gaps G01-G07 do PROJECT.md (sessão in-memory, ausência de
  autenticação, etc.) — a nova etapa herda as mesmas limitações já aceitas no resto
  do sistema.

## Decisions

### 1. Cardinalidade 1:1 entre aula e roteiro, dirigida por `sess.aulas.length`
Nenhum endpoint recebe ou assume uma contagem de aulas fixa. `GET /api/roteiro/prompt`
valida `index` contra `sess.aulas.length` em tempo real; `GET /api/roteiro/gerar`
calcula `proximoIndex = index + 1 < sess.aulas.length ? index + 1 : null`, o que
naturalmente produz N chamadas para N aulas — 5 aulas geram 5 roteiros, 6 aulas
geram 6, sem nenhuma constante de contagem no código. Isso replica exatamente o
mesmo mecanismo já usado no loop `for (let i = 0; i < aulas.length; i++)` de
`GET /api/slides`/`GET /api/conteudo`, apenas dirigido pelo cliente (uma chamada por
vez) em vez de um loop server-side único.

### 2. Três operações locais (JSON simples) + uma operação de IA (SSE)
A montagem do prompt (extrair tema+objetivos, ler o template, substituir
placeholders) não chama a IA — é só manipulação de string. Forçar essa etapa a ser
SSE só para "seguir a regra" adicionaria complexidade sem benefício (não há nada
para transmitir incrementalmente). Já existe precedente no projeto para endpoints
JSON simples mesmo em fluxos que envolvem preparação de dados para uma etapa
seguinte (`POST /api/estilos-visuais/selecionar`, `POST /api/config`). A regra "SSE
obrigatório" do CLAUDE.md se aplica à operação assíncrona de fato longa/incremental
— a chamada à IA em `GET /api/roteiro/gerar` — que continua streaming via SSE, sem
exceção.

**Alternativa considerada**: uma única rota SSE cobrindo prompt+edição+geração,
pausando o stream no meio para esperar o usuário editar. Rejeitada — SSE é
unidirecional (servidor→cliente); o servidor não tem como receber a edição do
usuário no meio de um stream aberto sem uma conexão HTTP adicional, o que
recriaria, com mais complexidade, o mesmo desenho de duas fases proposto aqui.

### 3. Padrão de duas fases para aprovação: `POST /api/roteiro/aprovar` → `GET /api/roteiro/gerar` (SSE)
Réplica direta do padrão já existente `POST /api/aplicar-melhorias` (prepara) →
`GET /api/aplicar-melhorias/confirmar` (SSE, executa). O texto aprovado fica
temporariamente em `sess.roteiroPendente` (um único slot, contendo `index` +
`texto` de UMA aula por vez), e `GET /api/roteiro/gerar` não recebe parâmetros —
lê da sessão. Mantém o EventSource nativo simples (sem necessidade de passar texto
longo por query string, que teria limite de tamanho de URL).

**Alternativa considerada**: passar o prompt editado como query param na própria
chamada SSE (`GET /api/roteiro/gerar?texto=...`). Rejeitada — prompts de roteiro
facilmente passam de 1-2 mil caracteres, arriscando estourar limites de URL em
alguns proxies/navegadores, além de poluir logs de acesso com o conteúdo completo.

### 4. Escolha de blocos uma vez por curso, painel inline (não modal)
Decisão já validada com o usuário. O valor escolhido (1-6) é fixo para o curso
inteiro e reaplicado a cada uma das N aulas — não é reperguntado a cada roteiro.
Segue o padrão visual já usado para o estilo visual da Etapa 8
(`#estiloVisualContainer`) em vez do modal overlay usado para importação
(`#modalImportar`) — mantém consistência com a etapa mais parecida estruturalmente.

### 5. Fonte de "tema" e "objetivos": `sess.aulas[i]`, não regex sobre o texto livre do plano de aula
`sess.aulas[i].titulo` já vem sem o prefixo "Aula N:" e `sess.aulas[i].objetivos` já
é um campo estruturado (populado por `planLessons()` na Etapa 4). Não existe um
heading fixo "Objetivos Específicos" no texto livre gerado pela IA para o plano de
aula (vocabulário varia por chamada) — usar `extractLessonBlock`/regex sobre esse
texto para achar objetivos seria frágil. Usar o campo estruturado já existente é
mais confiável, não exige nenhum parsing novo, e naturalmente cobre todas as N
aulas do array sem precisar de contagem separada.

### 6. Persistência dupla via `persistStage`, mesmo padrão de `aula{NN}_conteudo`
`roteiro{NN}` grava `.txt` (memória) + `.docx` (entregável) via `persistStage`,
cumprindo a regra do CLAUDE.md, um par de arquivos por aula processada. Diferente
de Slides (`persistPptxStage`, sem `.txt`), porque roteiro é texto (markdown
convertível por `buildDocx`, igual às demais etapas), não um binário estruturado
como `.pptx`.

### 7. Gate mínimo: Etapa 4 concluída (não Etapa 5)
Roteiro só depende de `sess.aulas` (título + objetivos), disponível desde a Etapa 4
(Plano de Aula) — diferente de Slides, que depende de `sess.conteudoPorAula` da
Etapa 5. Exigir a Etapa 5 seria uma dependência artificial. É também de
`sess.aulas.length` que vem a cardinalidade dinâmica descrita na Decisão 1.

## Risks / Trade-offs

- **[Risco] Condição de corrida entre abas**: `sess.roteiroPendente` é um único slot
  por sessão (cookie `sid`); duas abas do mesmo navegador aprovando roteiros de aulas
  diferentes ao mesmo tempo pisam uma na outra. → **Mitigação**: limitação
  pré-existente do modelo de sessão do projeto (mesmo risco já existe em qualquer
  outro estado de sessão single-slot, ex. `sess.estiloVisual`); não é regressão
  introduzida por esta mudança e não bloqueia a implementação — registrar como
  conhecido, sem tratamento especial nesta etapa.
- **[Risco] `PromptRoteiro.docx` ausente/corrompido**: se o arquivo for movido ou
  danificado, a feature quebra. → **Mitigação**: leitura lazy (não no boot do
  servidor) com cache em memória — falha isolada no primeiro `GET /api/roteiro/prompt`
  com erro 500 claro, sem derrubar o processo.
- **[Risco] Placeholder `%%TEMA%%` com espaço espúrio no template real**
  (`[%% TEMA%%]`) pode divergir silenciosamente se o arquivo for reeditado no futuro
  com uma variação de espaçamento ainda não coberta. → **Mitigação**: regex
  tolerante a espaço (`/%%\s*TEMA\s*%%/g`) aplicada uniformemente aos três
  placeholders, cobrindo variações razoáveis sem exigir correção do `.docx`.
- **[Trade-off] Geração aula-a-aula em vez de loop server-side único**: ao contrário
  de Slides/Conteúdo (todas as aulas em um único loop SSE), Roteiros faz uma
  requisição HTTP por aula (uma aprovação + um stream SSE por vez), ainda que o
  total de requisições seja sempre igual a `sess.aulas.length`. Isso é inerente à
  exigência de revisão humana por aula — não é possível manter um loop
  server-side único enquanto se espera input do usuário no meio.

## Migration Plan

Feature aditiva, sem alteração de schema existente nem de comportamento de etapas
já em produção. Nenhum dado migrado; `sess.roteiroBlocos`/`sess.roteirosGerados`
começam `null`/vazios para sessões e projetos existentes. Deploy é apenas subir o
código novo — não há passo de rollback especial além de reverter o deploy.

## Open Questions

- Nenhuma pendente. As duas ambiguidades identificadas durante o planejamento
  (frequência da escolha de blocos; avanço automático vs. manual entre aulas) já
  foram resolvidas com o usuário e estão refletidas nas Decisions acima. A
  cardinalidade 1 roteiro : 1 aula (dinâmica, igual a `sess.aulas.length`, nunca um
  número fixo) também já está confirmada e refletida na Decisão 1.
