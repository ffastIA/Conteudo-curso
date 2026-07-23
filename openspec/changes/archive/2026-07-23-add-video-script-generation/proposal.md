## Why

O pipeline atual termina em Slides (Etapa 8). Professores que produzem vídeo-aula com
avatar digital hoje montam manualmente, aula a aula, um prompt de roteiro em blocos a
partir do tema e dos objetivos de cada aula — um trabalho repetitivo que o sistema já
tem todos os dados para automatizar (`sess.aulas`, público-alvo do curso). Falta uma
etapa que monte esse prompt automaticamente a partir de um template fixo
(`PromptRoteiro.docx`), permita revisão humana antes do envio à IA (diferente de
todas as etapas atuais, que geram direto sem pausa para edição), e gere um arquivo de
roteiro por aula.

## What Changes

- Novo botão "Roteiros" na página principal, iniciando uma nova Etapa 9 opcional e
  independente, com pré-requisito mínimo de a Etapa 4 (Plano de Aula) estar concluída
  (fonte de `sess.aulas` com título + objetivos por aula).
- Escolha do número de blocos do roteiro (inteiro de 1 a 6, via seletor) **uma única
  vez por curso**, reaplicada a todas as aulas — mesmo padrão já usado para o estilo
  visual dos Slides (Etapa 8).
- Para cada aula, o sistema monta um prompt a partir do template `PromptRoteiro.docx`
  (raiz do repo), substituindo `%%TEMA%%` (tema da aula + objetivos específicos
  concatenados), `%%IDADE%%` (público-alvo do curso) e `%%BLOCOS%%` (escolha do
  usuário) — sem chamar a IA nesse passo.
- O prompt montado é exibido em uma caixa de texto **editável**, para o usuário
  conferir/ajustar antes de aprovar — primeiro ponto de revisão humana pré-geração do
  projeto (todas as etapas existentes até hoje geram direto, sem pausa para edição).
- Ao aprovar ("Gerar"), a IA é chamada com o prompt final (streaming via SSE) e o
  resultado é salvo como `roteiro{NN}.docx` (+ `.txt` em `/scr`, persistência dupla
  padrão do projeto), `NN` = número da aula em 2 dígitos.
- Após salvar o roteiro da aula N, o sistema avança **automaticamente** para montar e
  exibir o prompt da aula N+1, sem exigir clique adicional, até a última aula do curso.

## Capabilities

### New Capabilities
- `video-script-generation`: nova Etapa 9 opcional que monta, por aula, um prompt de
  roteiro de vídeo com avatar a partir de um template fixo e dos dados da aula,
  permite revisão/edição humana do prompt antes da geração, e persiste um arquivo
  `.docx` (+ `.txt`) de roteiro por aula via chamada à IA em streaming.

### Modified Capabilities
(nenhuma — a nova etapa não altera o comportamento de nenhuma capability existente;
lê `sess.aulas`/`sess.config` sem modificá-los, e não interfere com Slides/Qualidade/PPC)

## Impact

- **Novo código**: 4 endpoints em `server.js` (`POST /api/roteiro/blocos`,
  `GET /api/roteiro/prompt`, `POST /api/roteiro/aprovar`, `GET /api/roteiro/gerar`
  SSE), nova skill `roteiroSkill` em `skills.js`, nova seção `step9` em
  `public/index.html` + bloco correspondente em `public/app.js`.
- **Arquivo de template**: `PromptRoteiro.docx` (raiz do repo) passa a ser lido em
  runtime (via `mammoth`, já uma dependência existente) — nenhuma dependência nova.
- **Sessão/projeto**: novos campos `sess.roteiroBlocos` e `sess.roteirosGerados`,
  persistidos em `projeto.json` no mesmo padrão de `estiloVisual`.
- **Sem impacto** em `sess.ementa`, `pesquisa`, `planoEnsino`, `planoAula`,
  `conteudo`, `revisaoQualidade`, `relatorioQualidade`, nem nos fluxos de Slides,
  Qualidade ou PPC.
- **Non-goals**: não substitui nem altera o template `PromptRoteiro.docx` em si; não
  adiciona campo estruturado de "idade" ao `CourseConfig` (reaproveita
  `sess.config.publico`, mesma decisão já registrada em
  `openspec/changes/archive/2026-06-29-add-age-group-review/`); não gera vídeo nem
  áudio, apenas o texto do roteiro em blocos (a produção do vídeo em si é externa ao
  sistema); não permite escolher número de blocos por aula individualmente, apenas
  uma vez por curso; não resolve nenhum dos Gaps G01-G07 priorizados no PROJECT.md.
