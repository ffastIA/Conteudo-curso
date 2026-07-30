## Purpose

Gerar, para cada aula de um curso, um arquivo `.pptx` de slides a partir do
conteúdo já produzido na Etapa 5, como uma etapa opcional (Etapa 8) que não
bloqueia nem é bloqueada pelas demais etapas do pipeline.
## Requirements
### Requirement: Geração de slides a partir do conteúdo já existente
O sistema SHALL oferecer uma Etapa 8 opcional que, para cada aula em
`sess.conteudoPorAula`, envia o conteúdo já gerado à API do Gamma (v1.0,
`POST /generations`, `textMode: "condense"`, `format: "presentation"`) para
estruturá-lo em uma quantidade de slides escolhida pelo usuário (1 a 5, ver
requisito "Quantidade de slides por aula escolhida pelo usuário"), com texto
em formato de tópicos (`textOptions.amount: "brief"`), não parágrafos
corridos. O sistema SHALL NOT misturar tópicos de módulos ou disciplinas
distintos no mesmo slide — cada slide gerado permanece coeso em torno de um
único assunto, decisão que passa a ser do Gamma em vez de uma regra explícita
de prompt.

#### Scenario: Estruturação do conteúdo de uma aula em tópicos
- **WHEN** o sistema envia o conteúdo de uma aula ao Gamma com `textMode: "condense"` e `textOptions.amount: "brief"`
- **THEN** o `.pptx` resultante tem o conteúdo organizado em tópicos curtos por slide, não em texto corrido

#### Scenario: Tema de cada slide relacionado ao tema da aula
- **WHEN** o sistema gera os slides de uma aula específica (ex.: uma aula sobre Inteligência Artificial)
- **THEN** o `inputText` enviado ao Gamma é o conteúdo da própria aula e o `imageOptions.style` inclui o título da aula, de forma que o tema visual e textual dos slides gerados reflita o assunto daquela aula especificamente, não um tema genérico do curso

---

### Requirement: Um arquivo .pptx por aula, salvo na pasta do projeto
O sistema SHALL gerar um arquivo `.pptx` por aula (`aula{NN}_slides.pptx`),
salvo diretamente em `courseRootDir(sess)`, nunca via download do navegador.
O arquivo SHALL ser obtido baixando o `exportUrl` retornado pela API do Gamma
após a geração daquela aula ser concluída (`status: "completed"`), em vez de
montado localmente.

#### Scenario: Persistência do arquivo de uma aula
- **WHEN** a geração de uma aula é concluída com sucesso pelo Gamma (`status: "completed"`, `exportAs: "pptx"`)
- **THEN** o sistema baixa o `exportUrl` e grava o conteúdo em `aula{NN}_slides.pptx` dentro de `courseRootDir(sess)`, onde `NN` é o número da aula em 2 dígitos

#### Scenario: Rastreamento de origem no projeto
- **WHEN** um arquivo de slides é gerado com sucesso
- **THEN** `projeto.json.stages` registra uma entrada `aula{NN}_slides` com `fonte: "ia"` e o timestamp de geração — mesmo formato já usado por qualquer outra etapa

#### Scenario: Link de download nunca exposto ao cliente
- **WHEN** o sistema baixa o `.pptx` a partir do `exportUrl` retornado pelo Gamma
- **THEN** esse link não é enviado em nenhuma resposta ao cliente nem registrado em log — o download acontece inteiramente no servidor

---

### Requirement: Etapa opcional e independente
A Etapa 8 SHALL ser opcional e SHALL NOT bloquear nem ser bloqueada por
nenhuma outra etapa, exceto exigir que a Etapa 5 (Conteúdo) já tenha sido
concluída (fonte de dados necessária) e que um estilo visual já tenha sido
selecionado. A interface SHALL exibir o botão "Gerar Slides" desabilitado até
que a Etapa 5 esteja concluída, seguindo o mesmo padrão já usado pelas Etapas
7 (Qualidade/PPC) e 9 (Roteiros).

#### Scenario: Botão desabilitado antes da Etapa 5
- **WHEN** o usuário ainda não concluiu a Etapa 5 (Conteúdo)
- **THEN** o botão "Gerar Slides" na Etapa 8 permanece desabilitado

#### Scenario: Geração de slides não afeta outras etapas
- **WHEN** o usuário gera os slides de um curso
- **THEN** nenhum dado de `sess.ementa`, `sess.pesquisa`, `sess.planoEnsino`, `sess.planoAula`, `sess.conteudo`, `sess.revisaoQualidade`, `sess.relatorioQualidade` ou `sess.roteirosGerados` é alterado

#### Scenario: Montagem de parâmetros sem conteúdo disponível é rejeitada
- **WHEN** o usuário tenta montar os parâmetros de uma aula (`GET /api/slides/parametros`) antes de a Etapa 5 ter sido concluída
- **THEN** o sistema retorna status 400 com uma mensagem indicando que a Etapa 5 precisa ser concluída primeiro

#### Scenario: Geração sem estilo visual selecionado é rejeitada
- **WHEN** o usuário tenta montar os parâmetros de uma aula sem ter selecionado um estilo visual nesta sessão
- **THEN** o sistema retorna status 400 pedindo para escolher um estilo antes de continuar

### Requirement: Menu de estilos visuais coerente com o perfil do curso
Antes de gerar slides com imagem, o sistema SHALL oferecer um menu de 3 a 5 opções de estilo visual, geradas com base no perfil do curso (nome, público-alvo, nível, modalidade, objetivos), via `GET /api/estilos-visuais`. As opções SHALL se basear em arquétipos de estilo nomeados e reconhecíveis (ex.: lúdico/cartoon, dinâmico/moderno, estilo Pixar/3D animado, minimalista/geométrico, corporativo/sóbrio, aquarela/artesanal, ou combinações coerentes entre eles), adaptados pela IA ao público-alvo e à tipologia do curso — não descrições de estilo genéricas sem referência reconhecível. Cada opção SHALL incluir um título curto, uma descrição em português explicando a coerência com o curso, e um prompt de estilo em inglês para o gerador de imagens. O usuário SHALL escolher uma opção via `POST /api/estilos-visuais/selecionar` antes que a geração de imagens possa iniciar.

#### Scenario: Menu gerado a partir do perfil do curso
- **WHEN** o cliente chama `GET /api/estilos-visuais` com a configuração do curso já definida (Etapa 1)
- **THEN** o sistema retorna de 3 a 5 opções de estilo, cada uma com título, descrição em português e um prompt de estilo em inglês

#### Scenario: Opções ancoradas em arquétipos reconhecíveis
- **WHEN** o sistema gera o menu de estilos para um curso qualquer
- **THEN** cada opção do menu corresponde a um arquétipo de estilo nomeado e reconhecível (ou uma combinação coerente entre arquétipos), adaptado ao público-alvo e à tipologia do curso — não uma categoria inventada sem referência conhecida

#### Scenario: Escolha do usuário é obrigatória antes da geração
- **WHEN** o cliente chama `GET /api/slides/parametros` sem um estilo visual previamente selecionado nesta sessão
- **THEN** o servidor retorna HTTP 400 com uma mensagem pedindo para escolher um estilo antes de gerar os slides

#### Scenario: Escolha do usuário é persistida
- **WHEN** o cliente chama `POST /api/estilos-visuais/selecionar` com uma opção válida (contendo `housePrompt`)
- **THEN** o sistema grava a escolha na sessão (`sess.estiloVisual`) e no `projeto.json` do curso
- **THEN** chamadas subsequentes a `GET /api/slides/parametros`/`GET /api/slides/gerar` na mesma sessão usam esse estilo sem pedir nova seleção

#### Scenario: Estilo restaurado ao recarregar o projeto
- **WHEN** o usuário recarrega um projeto (`POST /api/carregar-projeto`) que já teve um estilo visual selecionado anteriormente
- **THEN** `sess.estiloVisual` é restaurado a partir do `projeto.json`, sem exigir nova escolha

---

### Requirement: Quantidade de slides por aula escolhida pelo usuário
Antes de gerar os slides de cada aula, o sistema SHALL oferecer um menu com
opções de 1 a 5 slides, e SHALL gerar exatamente a quantidade escolhida para
aquela aula (`numCards` enviado ao Gamma), em vez de uma quantidade fixa ou
decidida automaticamente pela IA. A escolha SHALL ter um valor padrão
("sticky"): pré-selecionada com a última quantidade usada na aula anterior
deste mesmo ciclo de geração (ou 3, na primeira geração do projeto), mas o
usuário SHALL poder alterá-la a qualquer momento antes de confirmar cada aula.

#### Scenario: Quantidade escolhida é respeitada como alvo de geração
- **WHEN** o usuário escolhe 2 slides para uma aula e confirma
- **THEN** o `numCards` enviado ao Gamma para aquela aula é 2

#### Scenario: Valor padrão pré-selecionado na primeira aula do curso
- **WHEN** o usuário monta os parâmetros da primeira aula gerada neste projeto
- **THEN** o menu de quantidade vem pré-selecionado com 3 slides, dentro do intervalo permitido de 1 a 5

#### Scenario: Valor padrão reaplicado às aulas seguintes
- **WHEN** o usuário gera os slides de uma aula com uma quantidade escolhida e avança para a aula seguinte
- **THEN** o menu de quantidade da aula seguinte já vem pré-selecionado com a mesma quantidade usada na aula anterior

#### Scenario: Quantidade fora do intervalo permitido é rejeitada
- **WHEN** o cliente envia uma quantidade menor que 1, maior que 5, ou não inteira
- **THEN** o sistema retorna status 400, sem alterar o valor padrão nem iniciar geração alguma

---

### Requirement: Observações complementares por aula, com persistência por aula gerada
Antes de gerar os slides de cada aula, o sistema SHALL permitir que o usuário
insira observações complementares em texto livre (mapeadas para
`additionalInstructions` do Gamma). O valor SHALL ter comportamento "sticky":
pré-preenchido com a última observação usada, reaplicado por padrão à aula
seguinte caso o usuário não o altere. O valor efetivamente usado em cada aula
SHALL ser gravado individualmente por aula no `projeto.json` (não apenas um
valor global do curso), permitindo consultar ou reproduzir depois qual
observação foi usada em cada aula específica.

#### Scenario: Observação enviada como instrução adicional ao Gamma
- **WHEN** o usuário digita uma observação complementar e confirma a geração de uma aula
- **THEN** o texto da observação é enviado como `additionalInstructions` na chamada `POST /generations` para aquela aula

#### Scenario: Observação reaplicada por padrão na aula seguinte
- **WHEN** o usuário gera a aula N com uma observação preenchida e avança para a aula N+1 sem editar o campo
- **THEN** a observação usada na aula N+1 é idêntica à usada na aula N

#### Scenario: Observação alterada passa a valer como novo padrão
- **WHEN** o usuário edita a observação antes de confirmar a geração de uma aula
- **THEN** essa nova observação é usada nessa aula e passa a ser o valor padrão pré-preenchido para a aula seguinte

#### Scenario: Cada aula grava a observação que de fato usou
- **WHEN** o curso tem múltiplas aulas geradas com observações diferentes entre si
- **THEN** o registro de cada aula em `sess.slidesGerados`/`projeto.json` contém exatamente a observação usada naquela aula específica, não apenas o valor padrão atual do curso

---

### Requirement: Pausa para revisão humana a cada aula, com avanço automático
O sistema SHALL pausar antes de gerar os slides de cada aula, aguardando o
usuário confirmar a quantidade de slides e a observação complementar daquela
aula (ver requisitos correspondentes), em vez de gerar automaticamente todas
as aulas do curso numa única operação. Após a geração de uma aula ser
concluída com sucesso, o sistema SHALL avançar automaticamente para a
montagem dos parâmetros da aula seguinte, sem exigir um clique adicional do
usuário, até esgotar todas as aulas do curso.

#### Scenario: Avanço automático após sucesso
- **WHEN** os slides da aula de índice `i` são gerados com sucesso e existe uma aula de índice `i + 1`
- **THEN** o sistema monta e exibe automaticamente os parâmetros da aula `i + 1` para revisão, sem exigir um novo clique em "Gerar Slides"

#### Scenario: Fim do ciclo na última aula
- **WHEN** os slides gerados são os da última aula do curso
- **THEN** o sistema exibe um resumo final com os arquivos gerados, em vez de montar parâmetros de uma próxima aula

#### Scenario: Falha na geração de uma aula não avança para a próxima
- **WHEN** a geração de slides de uma aula falha (erro do Gamma, timeout de polling, ou falha de rede)
- **THEN** o sistema emite um evento de erro e permanece na mesma aula, sem avançar automaticamente — o usuário pode revisar e tentar gerar novamente essa mesma aula, sem perder os arquivos já gerados para aulas anteriores

---

### Requirement: Geração de imagens via API do Gamma, no estilo visual escolhido
Para cada aula, o sistema SHALL solicitar ao Gamma a geração de imagens que
complementem os tópicos (`imageOptions.source: "aiGenerated"`), combinando o
estilo visual escolhido pelo usuário (`housePrompt` da Etapa 8, repassado como
`imageOptions.style`) com o título da aula, de forma que a imagem reflita
tanto a identidade visual consistente do curso quanto o tema específico
daquela aula.

#### Scenario: Estilo visual aplicado à geração de imagem da aula
- **WHEN** o usuário já escolheu um estilo visual e o sistema gera os slides de uma aula
- **THEN** o `imageOptions.style` enviado ao Gamma inclui o `housePrompt` do estilo escolhido combinado com o título da aula

#### Scenario: Imagens seguem o formato widescreen já usado
- **WHEN** o sistema monta a chamada de geração para o Gamma
- **THEN** `cardOptions.dimensions` é `"16x9"`, mantendo o mesmo padrão de proporção widescreen já usado antes desta mudança

---

### Requirement: Conteúdo e tom adequados ao público-alvo, faixa etária e nível do curso
O sistema SHALL enviar ao Gamma o público-alvo do curso (`sess.config.publico`,
mesmo campo usado em todo o projeto para faixa etária/público — não existe
campo "idade" estruturado separado) via `textOptions.audience`, e SHALL
instruir um tom leve e adequado à faixa etária via `textOptions.tone`,
incorporando também o nível do curso (`sess.config.nivel`) para adequar a
densidade e o vocabulário do conteúdo gerado.

#### Scenario: Público-alvo enviado ao Gamma
- **WHEN** o sistema monta a chamada de geração para uma aula
- **THEN** `textOptions.audience` contém o valor de `sess.config.publico` definido na configuração do curso

#### Scenario: Tom leve e nível do curso incorporados às instruções
- **WHEN** o sistema monta a chamada de geração para uma aula
- **THEN** `textOptions.tone` (ou `additionalInstructions`) inclui uma instrução de tom leve/descontraído adequado à faixa etária, e menciona o nível do curso (`sess.config.nivel`) para adequar densidade e vocabulário

---

### Requirement: Erro claro quando GAMMA_API_KEY não está configurada
O sistema SHALL verificar, antes de qualquer chamada de rede à API do Gamma, se a variável de ambiente `GAMMA_API_KEY` está definida e não vazia, e SHALL retornar um erro citando explicitamente o nome da variável e apontando para `.env.example` quando ela estiver ausente — em vez de deixar a chamada prosseguir e falhar com um erro genérico de autenticação da API do Gamma.

#### Scenario: GAMMA_API_KEY ausente ao gerar slides
- **WHEN** o usuário aciona `GET /api/slides/gerar` com `GAMMA_API_KEY` ausente ou vazia no `.env`
- **THEN** o evento SSE `error` cita `GAMMA_API_KEY` e `.env.example`, e nenhum arquivo `.pptx` é gerado

#### Scenario: GAMMA_API_KEY presente segue o fluxo normal
- **WHEN** `GAMMA_API_KEY` está definida e não vazia
- **THEN** o sistema chama a API do Gamma normalmente, sem nenhuma mudança de comportamento em relação ao existente

