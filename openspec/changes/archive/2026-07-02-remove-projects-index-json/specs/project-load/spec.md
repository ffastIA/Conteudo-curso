## REMOVED Requirements

### Requirement: Listar projetos existentes
**Reason:** A listagem automática de projetos dependia de `saídas/index.json` para descobrir projetos externos, e mesmo para projetos locais servia como uma segunda fonte de verdade sujeita a dessincronização. O novo fluxo (capability `project-load`, requisito de carregamento por seleção de pasta) substitui a listagem automática por seleção manual e explícita da pasta do projeto pelo usuário.
**Migration:** `GET /api/projetos` é removido. A tela inicial não exibe mais uma lista automática de projetos conhecidos; o usuário abre um projeto existente através do botão de seleção de pasta.

### Requirement: Carregamento de projeto a partir do disco (com suporte a caminhos externos)
**Reason:** Este requisito descrevia a resolução de `baseDir` via `saídas/index.json` para suportar projetos em pastas externas. Essa resolução deixa de ser necessária porque o caminho da pasta agora é sempre fornecido diretamente pelo cliente (o usuário seleciona a pasta explicitamente a cada carregamento), eliminando a necessidade de consultar um registro global para "descobrir" onde um projeto externo está.
**Migration:** `POST /api/carregar-projeto` passa a receber o caminho absoluto da pasta diretamente na requisição (ver capability `project-load`, requisito de carregamento por caminho, introduzido em `add-load-project-by-folder`), em vez de um `slug` resolvido via índice. Projetos externos continuam funcionando normalmente — a única mudança é que o caminho vem do usuário a cada seleção, não de um registro persistido previamente.

Nota: o requisito "Interface de seleção de projeto existente" NÃO é removido por este change — ele é MODIFICADO (não removido) pelo change `add-load-project-by-folder`, que substitui a lista automática por um botão + diálogo nativo, mantendo a capability viva.
