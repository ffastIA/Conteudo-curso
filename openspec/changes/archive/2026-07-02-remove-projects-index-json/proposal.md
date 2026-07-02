## Why

`saídas/index.json` — um índice global mapeando `slug → { nome, pastaProjeto, ultimaModificacao }` — tem sido, ao longo desta sessão de trabalho, a causa raiz recorrente de bugs de "pasta do projeto" (`pastaProjeto`) dessincronizada da realidade: cursos com uma pasta de destino configurada continuaram tendo arquivos gravados na pasta interna `saídas/{slug}/`, porque esse índice nunca foi atualizado corretamente (bug já corrigido em `fix-pastaprojeto-persist-on-config`); e projetos continuaram aparecendo na tela inicial mesmo depois do usuário esvaziar a pasta que ele pensava ser a do projeto, porque o índice apontava para outro lugar. Este change elimina a fonte desses problemas: um arquivo de estado global que pode ficar dessincronizado do disco real, em favor de sempre ler a verdade diretamente da pasta que o usuário indica.

**Dependência:** este change deve ser aplicado somente depois (ou junto) do change `add-load-project-by-folder`, que substitui a listagem automática de projetos por um fluxo em que o usuário sempre indica diretamente a pasta principal do projeto. Sem esse outro change implementado primeiro, remover o índice quebra o carregamento de projetos existentes.

## What Changes

- **BREAKING**: `saveProject()` deixa de escrever/atualizar `saídas/index.json`.
- **BREAKING**: `GET /api/projetos` é removido (a listagem automática de projetos, que dependia do índice, é substituída pelo fluxo de seleção de pasta do change `add-load-project-by-folder`).
- **BREAKING**: `POST /api/carregar-projeto` deixa de consultar `saídas/index.json` para resolver o diretório base do projeto (a resolução passa a vir diretamente do caminho de pasta fornecido na requisição, conforme implementado em `add-load-project-by-folder`).
- Remoção (limpeza única) do arquivo `saídas/index.json` já existente em disco.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `project-folder`: remove o requisito "Índice global de projetos em saídas/index.json" — `saveProject()` não mantém mais nenhum registro global; cada pasta de projeto é autossuficiente (seu próprio `scr/projeto.json` é a única fonte de verdade).
- `project-load`: remove o requisito "Carregamento de projeto a partir do disco (com suporte a caminhos externos)" que dependia de `index.json` para resolver caminhos externos, e remove/ajusta "Listar projetos existentes" — a descoberta de projetos deixa de ser automática via escaneamento de um índice global.

## Impact

- `server.js`: `saveProject()` (~linhas 209-249, bloco de escrita do índice ~239-248).
- `server.js`: `GET /api/projetos` (~linhas 954-1000) — removido.
- `server.js`: `POST /api/carregar-projeto` (~linhas 1023-1099) — resolução de `baseDir` via índice (~linhas 1029-1035) removida, substituída pela lógica introduzida em `add-load-project-by-folder`.
- `public/app.js`: `carregarListaProjetos()` e o card "Abrir Projeto Existente" baseado em lista automática — removidos/substituídos pelo botão do outro change.
- Limpeza de dado: `saídas/index.json` apagado do disco.
- Relacionado ao gap conhecido G04 (sessão in-memory perdida ao reiniciar) como contexto: eliminar uma segunda fonte de verdade (o índice) que podia divergir da sessão em memória reduz a superfície desse tipo de inconsistência.

## Non-goals

- Não implementa, por si só, o novo fluxo de seleção de pasta — isso é responsabilidade do change `add-load-project-by-folder`, que deve ser aplicado antes ou junto.
- Não migra automaticamente projetos legados cujo `pastaProjeto` ficou vazio por conta do bug já corrigido — o usuário precisa reabrir cada projeto pela nova interface (pasta) para que o caminho correto seja usado dali em diante.
- Não remove a capacidade de um projeto ter uma `pastaProjeto` própria (isso continua existindo — apenas o REGISTRO GLOBAL de todas as pastas é removido).
