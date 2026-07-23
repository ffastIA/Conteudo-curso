## ADDED Requirements

### Requirement: Um roteiro por aula, quantidade sempre igual ao número de aulas do curso
O sistema SHALL gerar exatamente um arquivo de roteiro por aula do curso. O número
total de arquivos gerados SHALL ser sempre igual a `sess.aulas.length` no momento da
geração — nunca uma quantidade fixa. Um curso com 5 aulas SHALL gerar exatamente 5
roteiros (`roteiro01.docx` … `roteiro05.docx`); um curso com 6 aulas SHALL gerar
exatamente 6 (`roteiro01.docx` … `roteiro06.docx`); e assim por diante para qualquer
número de aulas. Cada aula SHALL receber um único roteiro, nunca múltiplos roteiros
por aula.

#### Scenario: Curso com 5 aulas
- **WHEN** o usuário conclui a geração de roteiros para um curso com 5 aulas em `sess.aulas`
- **THEN** o sistema gera exatamente 5 arquivos: `roteiro01.docx` até `roteiro05.docx`

#### Scenario: Curso com 6 aulas
- **WHEN** o usuário conclui a geração de roteiros para um curso com 6 aulas em `sess.aulas`
- **THEN** o sistema gera exatamente 6 arquivos: `roteiro01.docx` até `roteiro06.docx`

#### Scenario: Curso com uma única aula
- **WHEN** o curso tem apenas 1 aula em `sess.aulas`
- **THEN** o sistema gera exatamente 1 arquivo (`roteiro01.docx`) e encerra o fluxo sem tentar avançar para uma próxima aula

#### Scenario: Nenhuma aula gera mais de um roteiro
- **WHEN** o roteiro de uma aula já foi gerado e salvo
- **THEN** o sistema não gera um segundo arquivo de roteiro para essa mesma aula dentro do mesmo ciclo de geração

---

### Requirement: Etapa opcional e independente, requer Plano de Aula concluído
O sistema SHALL oferecer uma Etapa 9 opcional ("Roteiros") que SHALL NOT bloquear
nem ser bloqueada por nenhuma outra etapa, exceto exigir que a Etapa 4 (Plano de
Aula) já tenha sido concluída — fonte de `sess.aulas` (título e objetivos por aula).
A interface SHALL exibir o botão "Roteiros" desabilitado até que a Etapa 4 esteja
concluída.

#### Scenario: Botão desabilitado antes da Etapa 4
- **WHEN** o usuário ainda não concluiu a Etapa 4 (Plano de Aula)
- **THEN** o botão "Roteiros" permanece desabilitado

#### Scenario: Geração de roteiros sem plano de aula disponível é rejeitada
- **WHEN** o cliente chama `GET /api/roteiro/prompt` antes de a Etapa 4 ter sido concluída (`sess.aulas` vazio)
- **THEN** o sistema retorna HTTP 400 com uma mensagem indicando que a Etapa 4 precisa ser concluída primeiro

#### Scenario: Geração de roteiros não afeta outras etapas
- **WHEN** o usuário gera os roteiros de um curso
- **THEN** nenhum dado de `sess.ementa`, `sess.pesquisa`, `sess.planoEnsino`, `sess.planoAula`, `sess.conteudo`, `sess.revisaoQualidade`, `sess.relatorioQualidade` ou `sess.estiloVisual` é alterado

---

### Requirement: Número de blocos escolhido uma única vez por curso
Antes da primeira geração, o sistema SHALL pedir ao usuário um número inteiro de
blocos entre 1 e 6 (via seletor). Essa escolha SHALL ser feita uma única vez por
curso e SHALL ser reaplicada a todas as aulas subsequentes, sem pedir novamente a
cada aula.

#### Scenario: Primeira geração pede o número de blocos
- **WHEN** o usuário clica em "Roteiros" pela primeira vez nesta sessão, sem ter escolhido blocos ainda
- **THEN** o sistema exibe um seletor com as opções de 1 a 6 blocos antes de montar qualquer prompt

#### Scenario: Escolha é reaplicada às demais aulas do mesmo curso
- **WHEN** o usuário já escolheu o número de blocos e o sistema avança para a aula seguinte
- **THEN** o prompt da aula seguinte usa o mesmo número de blocos, sem exibir o seletor novamente

#### Scenario: Escolha é persistida na sessão e no projeto
- **WHEN** o cliente chama `POST /api/roteiro/blocos` com um valor válido (1 a 6)
- **THEN** o sistema grava a escolha em `sess.roteiroBlocos` e no `projeto.json` do curso

#### Scenario: Valor de blocos fora do intervalo é rejeitado
- **WHEN** o cliente chama `POST /api/roteiro/blocos` com um valor menor que 1, maior que 6, ou não inteiro
- **THEN** o sistema retorna HTTP 400 sem alterar `sess.roteiroBlocos`

---

### Requirement: Montagem do prompt a partir do template e dos dados da aula
Para cada aula, o sistema SHALL montar um prompt substituindo, no texto extraído de
`PromptRoteiro.docx`, o placeholder de tema pela concatenação do título da aula
(sem o prefixo "Aula N:") com os objetivos específicos da aula (`sess.aulas[i].objetivos`),
o placeholder de idade pelo público-alvo do curso (`sess.config.publico`), e o
placeholder de blocos pelo número escolhido pelo usuário. A substituição SHALL ser
tolerante a espaços internos nos placeholders (ex.: `[%% TEMA%%]`). O prompt montado
SHALL ser retornado ao cliente sem nenhuma chamada à IA nesse passo.

#### Scenario: Montagem do prompt da primeira aula
- **WHEN** o cliente chama `GET /api/roteiro/prompt?index=0` com `sess.aulas`, `sess.config.publico` e `sess.roteiroBlocos` definidos
- **THEN** o sistema retorna o texto do template com `%%TEMA%%` substituído pela concatenação de `sess.aulas[0].titulo` + objetivos, `%%IDADE%%` substituído por `sess.config.publico`, e `%%BLOCOS%%` substituído pelo número escolhido

#### Scenario: Aula sem objetivos preenchidos
- **WHEN** `sess.aulas[i].objetivos` está vazio ou ausente
- **THEN** o prompt usa apenas o título da aula no lugar do placeholder de tema, sem quebrar a montagem

#### Scenario: Público-alvo ausente na configuração do curso
- **WHEN** `sess.config.publico` está vazio ou ausente
- **THEN** o sistema usa um valor de fallback textual no lugar do placeholder de idade, sem bloquear a montagem do prompt

#### Scenario: Índice de aula inválido
- **WHEN** o cliente chama `GET /api/roteiro/prompt` com um `index` fora do intervalo `[0, sess.aulas.length - 1]`
- **THEN** o sistema retorna HTTP 400

---

### Requirement: Revisão e edição do prompt antes da geração
O sistema SHALL exibir o prompt montado em uma caixa de texto editável, permitindo
que o usuário altere o conteúdo antes de aprovar a geração. Nenhuma chamada à IA
SHALL ocorrer antes de uma aprovação explícita do usuário.

#### Scenario: Usuário edita o prompt antes de gerar
- **WHEN** o usuário altera o texto exibido na caixa de revisão antes de clicar em "Gerar"
- **THEN** o texto final enviado para geração é exatamente o texto editado pelo usuário, não o texto originalmente montado pelo sistema

#### Scenario: Aprovação grava o texto pendente
- **WHEN** o cliente chama `POST /api/roteiro/aprovar` com `{ index, texto }` válidos
- **THEN** o sistema grava `sess.roteiroPendente = { index, texto }` e retorna sucesso, sem chamar a IA

#### Scenario: Aprovação com texto vazio é rejeitada
- **WHEN** o cliente chama `POST /api/roteiro/aprovar` com `texto` vazio ou ausente
- **THEN** o sistema retorna HTTP 400, sem alterar `sess.roteiroPendente`

---

### Requirement: Geração via IA em streaming e persistência do arquivo da aula
Ao receber a aprovação, o sistema SHALL chamar a IA com o prompt aprovado, usando
streaming via SSE (eventos `progress`, `token`, `done`, `error`), injetando o
contexto pedagógico via `pedagCtxBlock`. Ao concluir, o sistema SHALL persistir o
resultado como `roteiro{NN}.docx` (NN = número da aula em 2 dígitos) na pasta do
projeto, com o `.txt` correspondente em `/scr` (persistência dupla).

#### Scenario: Geração bem-sucedida persiste o arquivo da aula
- **WHEN** `GET /api/roteiro/gerar` é chamado com `sess.roteiroPendente` definido para a aula de índice `i`
- **THEN** o sistema grava `roteiro{NN}.docx` em `courseRootDir(sess)` e `roteiro{NN}.txt` em `courseScrDir(sess)`, onde `NN = String(i + 1).padStart(2, '0')`

#### Scenario: Geração sem prompt aprovado é rejeitada
- **WHEN** o cliente chama `GET /api/roteiro/gerar` sem `sess.roteiroPendente` definido
- **THEN** o sistema retorna um erro de pré-condição SSE (`sseError`) antes de iniciar o streaming

#### Scenario: Contexto pedagógico é injetado no prompt final
- **WHEN** o sistema monta a chamada à IA para gerar um roteiro
- **THEN** o `user` enviado à IA inclui o texto aprovado pelo usuário seguido do bloco retornado por `pedagCtxBlock(metodologia, bnccContext)`

#### Scenario: Cliente desconecta durante o streaming
- **WHEN** o cliente encerra a conexão SSE antes do evento `done` de `GET /api/roteiro/gerar`
- **THEN** o sistema aborta a chamada à IA em andamento e não persiste nenhum arquivo parcial para essa aula

---

### Requirement: Avanço automático entre aulas até esgotar todas as aulas do curso
Após persistir o roteiro da aula de índice `i` com sucesso, o sistema SHALL indicar
ao cliente o índice da próxima aula pendente (`i + 1`), se existir alguma aula após
essa. O cliente SHALL montar e exibir automaticamente o prompt dessa próxima aula,
sem exigir um clique adicional do usuário. Quando não houver mais aulas pendentes
(`i` for a última aula, índice `sess.aulas.length - 1`), o sistema SHALL sinalizar
o fim do ciclo em vez de indicar uma próxima aula.

#### Scenario: Avanço automático para a aula seguinte
- **WHEN** o roteiro da aula de índice `i` é gerado com sucesso e existe uma aula de índice `i + 1`
- **THEN** o evento `done` de `GET /api/roteiro/gerar` inclui `proximoIndex = i + 1`, e o cliente monta automaticamente o prompt dessa aula em seguida, sem esperar um novo clique

#### Scenario: Fim do ciclo na última aula
- **WHEN** o roteiro gerado é o da última aula do curso (índice `sess.aulas.length - 1`)
- **THEN** o evento `done` inclui `proximoIndex: null`, e o cliente exibe um resumo final com os arquivos gerados em vez de montar um novo prompt

---

### Requirement: Restauração ao recarregar um projeto existente
Ao recarregar um projeto que já teve roteiros gerados anteriormente, o sistema
SHALL restaurar a escolha de blocos e a lista de roteiros já gerados a partir do
`projeto.json`, sem exigir que o usuário escolha o número de blocos novamente.

#### Scenario: Blocos restaurados ao recarregar o projeto
- **WHEN** o usuário recarrega um projeto (`POST /api/carregar-projeto`) que já teve um número de blocos selecionado anteriormente
- **THEN** `sess.roteiroBlocos` é restaurado a partir do `projeto.json`, sem exibir o seletor de blocos novamente

#### Scenario: Lista de roteiros já gerados é restaurada
- **WHEN** o usuário recarrega um projeto que já teve um ou mais roteiros gerados
- **THEN** a interface exibe os arquivos já gerados (badges), a partir de `sess.roteirosGerados` restaurado do `projeto.json`
