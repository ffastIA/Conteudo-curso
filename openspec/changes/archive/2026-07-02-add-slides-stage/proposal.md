## Why

Depois de gerar o conteúdo textual completo de cada aula (Etapa 5), o professor ainda precisa montar manualmente os slides de apoio para a aula presencial/EaD — um trabalho repetitivo que a IA já tem toda a informação necessária para fazer automaticamente, dado que o conteúdo de cada aula já foi gerado e está estruturado. Uma Etapa 8 opcional que converte o conteúdo já existente em apresentações `.pptx` prontas fecha esse gap sem adicionar nenhuma dependência às etapas já existentes.

## What Changes

- Nova Etapa 8 ("Slides"), opcional e independente: não bloqueia nem é bloqueada pelas Etapas 6/7, só executa quando o usuário clica em "Gerar Slides".
- Novo endpoint SSE `GET /api/slides`, que itera sobre `sess.conteudoPorAula` e, para cada aula, usa uma nova skill (`slidesSkill`, JSON estruturado) para extrair 6 a 10 tópicos/slides do conteúdo já gerado daquela aula, evitando misturar módulos/disciplinas distintos no mesmo slide.
- Um arquivo `.pptx` por aula (`aula{NN}_slides.pptx`), salvo diretamente em `courseRootDir(sess)` — nunca via download do navegador, seguindo o mesmo padrão já estabelecido para todas as demais etapas nesta sessão de trabalho.
- Slides sem notas do apresentador, conteúdo autoexplicativo, fonte compatível com Canva, tamanho legível a até 5 metros de projeção, rodapé com identificação da aula + tema + data + timestamp de geração.
- Nova dependência npm: `pptxgenjs` (geração programática de `.pptx`).

## Capabilities

### New Capabilities

- `slides-generation`: geração automática de apresentações PowerPoint a partir do conteúdo já gerado das aulas — análise por IA, estruturação em slides, e persistência de um `.pptx` por aula na pasta do projeto.

### Modified Capabilities

Nenhuma — esta é uma etapa aditiva que não altera o comportamento de nenhuma etapa existente (0-7).

## Impact

- `package.json`: nova dependência `pptxgenjs`.
- `skills.js`: nova skill `slidesSkill` (JSON estruturado, `MODEL_ECONOMY`).
- `server.js`: nova função `buildPptx(config, aula, slidePlan, geradoEm)` (análoga a `buildDocx`, mas consumindo uma estrutura de slides já pronta em vez de texto corrido); nova função `persistPptxStage(sess, baseName, aula, slidePlan)` (análoga a `persistStage`, mas sem gravar `.txt` companheiro em `/scr`, já que slides não são lidos de volta como "memória" por nenhuma etapa posterior); novo endpoint `GET /api/slides` (SSE), com gating idêntico ao de `/api/qualidade`/`/api/ppc`.
- `public/index.html`: nova pill "8 · Slides" na navegação; nova seção `#step8` com card de ação (botão desabilitado até a Etapa 5 estar concluída) e card de resultado (cards de arquivos gerados, sem área de texto renderizado).
- `public/app.js`: novo handler para o botão "Gerar Slides", com tratamento específico do evento `done` (lista de arquivos, não `fullText`) reaproveitando o padrão visual de cards já usado para carregar projeto por pasta.
- Nenhuma mudança em nenhum endpoint/skill/UI existente.

## Non-goals

- Não gera imagens, ícones ou elementos gráficos dentro dos slides — apenas texto estruturado (título + bullets) com formatação e paleta consistentes.
- Não inclui notas do apresentador.
- Não implementa um ciclo de exportar/editar/reimportar para slides (diferente de ementa/pesquisa/plano de ensino) — o `.pptx` gerado já é o artefato final; edições posteriores acontecem fora do sistema (ex.: no PowerPoint ou no Canva, após importar o arquivo).
- Não gera um único arquivo consolidado para o curso inteiro — a unidade de geração e persistência é sempre uma aula (`.pptx` por aula), decisão confirmada explicitamente com o usuário.
- Não adiciona opção de escolher fonte/tema/paleta pelo usuário nesta primeira versão — usa um padrão visual fixo definido no design.
