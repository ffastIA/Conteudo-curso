## Why

O fluxo atual de "Abrir Projeto Existente" (lista automática na Etapa 0, construída a partir de `GET /api/projetos` + `saídas/index.json`) depende de um índice global que se mostrou fonte recorrente de bugs nesta sessão de trabalho: `pastaProjeto` dessincronizada da realidade, projetos "fantasmas" continuando na lista após o usuário limpar a pasta que julgava ser a do projeto. Além disso, o campo "pasta do projeto" na Etapa 1 é hoje opcional — quando deixado em branco, o sistema usa silenciosamente uma pasta interna (`saídas/{nome-do-curso}/`) dentro do próprio diretório da aplicação, o que já causou confusão real: arquivos gerados em um lugar que o usuário não esperava nem sabia que existia. Este change resolve os dois problemas na raiz: torna a pasta do projeto obrigatória e explícita, e substitui a descoberta automática (via índice) por seleção direta e manual da pasta pelo usuário, eliminando a possibilidade de dessincronização.

## What Changes

- Etapa 0: o card "Abrir Projeto Existente" passa a mostrar um botão único ("Selecionar pasta do projeto") em vez de uma lista automática de projetos conhecidos.
- Ao clicar, um diálogo nativo de seleção de pasta do Windows é aberto (via novo endpoint de servidor, ver capability nova abaixo). O usuário escolhe a pasta raiz do projeto diretamente.
- `POST /api/carregar-projeto` passa a receber o caminho absoluto da pasta (`{ pasta: string }`) em vez de um `slug`, lendo `{pasta}/scr/projeto.json` diretamente — sem consultar nenhum índice global.
- A pasta selecionada pelo usuário passa a ser sempre tratada como a `pastaProjeto` definitiva da sessão a partir daquele carregamento, mesmo que o `projeto.json` da pasta tenha um valor diferente ou vazio gravado — corrigindo (a partir do próximo carregamento) projetos antigos afetados pelo bug de `pastaProjeto` vazia.
- Além do banner/badges já existentes, a interface passa a exibir pequenos cards com o nome de cada arquivo real encontrado na pasta (ementa, plano de ensino, plano de aula, aula01, aula02 etc.), construídos por escaneamento direto do disco (raiz para `.docx`, `/scr` para `.txt`) — não a partir de metadados (`stages`) potencialmente desatualizados.
- **BREAKING**: o campo `pastaProjeto` da Etapa 1 passa a ser obrigatório — `POST /api/config` rejeita a requisição (400) se estiver vazio, e o formulário exige preenchimento antes de submeter.
- Um botão "Procurar..." ao lado do campo de texto `pastaProjeto` (Etapa 1) abre o mesmo diálogo nativo, preenchendo o campo com o caminho escolhido — usado tanto para criar um projeto novo (indicando uma pasta de destino nova) quanto para editar a pasta de um projeto existente.

## Capabilities

### New Capabilities

- `native-folder-picker`: mecanismo de servidor que abre um diálogo nativo de seleção de pasta do Windows (via PowerShell + `System.Windows.Forms.FolderBrowserDialog`) e retorna o caminho absoluto escolhido ao cliente, com fallback gracioso para entrada manual de texto caso o diálogo não possa ser aberto.

### Modified Capabilities

- `project-load`: o carregamento de projeto passa a ser por caminho de pasta explícito (fornecido pelo usuário a cada seleção) em vez de por `slug` resolvido via índice; a interface de seleção passa de lista automática para botão + diálogo nativo; a resposta do carregamento passa a incluir a lista de arquivos reais encontrados na pasta, para exibição em cards.
- `project-folder`: `pastaProjeto` deixa de ser opcional — passa a ser obrigatória em `POST /api/config`, eliminando o fallback silencioso para a pasta interna `saídas/{slug}/` em projetos novos.

## Impact

- `server.js`: novo endpoint `GET /api/escolher-pasta` (diálogo nativo via PowerShell).
- `server.js`: `POST /api/carregar-projeto` (~linhas 1023-1099) — passa a aceitar `{ pasta }` em vez de `{ slug }`, define `sess.config.pastaProjeto = pasta` incondicionalmente, e escaneia o disco para montar a lista de arquivos encontrados.
- `server.js`: `POST /api/config` (~linhas 466-524) — adiciona validação obrigatória para `pastaProjeto`, igual ao padrão já usado para `modalidade`/`proporcaoTeoricoPratico`.
- `public/index.html`: Etapa 0 (card "Abrir Projeto Existente", ~linhas 41-51) — botão único em vez de lista; Etapa 1 (campo `pastaProjeto`, ~linhas 180-188) — `required`, label sem "(opcional)", botão "Procurar...".
- `public/app.js`: `carregarListaProjetos()`/`selecionarProjeto()` (~linhas 714-799) — adaptados para o novo fluxo por pasta; novo helper para chamar `GET /api/escolher-pasta` e exibir os cards de arquivos.
- Sem dependências npm novas — o diálogo nativo usa PowerShell (já presente no Windows) via `child_process`, não uma biblioteca.
- Relacionado ao gap conhecido G02 (sem autenticação): a arquitetura do diálogo nativo assume explicitamente uso local (navegador e servidor na mesma máquina) — documentado como constraint no design.

## Non-goals

- Não implementa suporte multiplataforma para o diálogo nativo — é Windows-only (usa PowerShell + `System.Windows.Forms`); em qualquer falha (SO diferente, política de execução bloqueada), o campo de texto continua editável manualmente.
- Não migra automaticamente projetos legados — cada um precisa ser aberto uma vez pela nova interface para que sua `pastaProjeto` correta seja assumida dali em diante.
- Não implementa drag-and-drop de pastas nem upload de arquivos como alternativa de seleção.
- A remoção do índice global `saídas/index.json` em si é escopo do change `remove-projects-index-json` (que depende deste change ser implementado primeiro ou junto).
