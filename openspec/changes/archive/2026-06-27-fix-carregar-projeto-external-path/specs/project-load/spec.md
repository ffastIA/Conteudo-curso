## MODIFIED Requirements

### Requirement: Carregamento de projeto a partir do disco
O sistema SHALL reconstruir a sessão a partir dos arquivos persistidos em disco quando `POST /api/carregar-projeto` for chamado com um `slug`. O sistema SHALL resolver o diretório base do projeto consultando `index.json` antes de tentar o diretório local `saídas/{slug}/`: se `index.json` contiver `pastaProjeto` não-vazio para o slug, esse caminho SHALL ser usado como `baseDir`. O `projeto.json` SHALL ser lido de `{baseDir}/scr/projeto.json`. `sess.config.pastaProjeto` SHALL refletir o caminho real do projeto após o carregamento.

#### Scenario: Carregamento de projeto local (saídas/)
- **WHEN** o slug está em `index.json` com `pastaProjeto` vazio (ou `index.json` não existe)
- **THEN** o sistema usa `saídas/{slug}/` como `baseDir`
- **THEN** lê `saídas/{slug}/scr/projeto.json` e popula a sessão normalmente
- **THEN** `sess.config.pastaProjeto` permanece vazio (projeto local)

#### Scenario: Carregamento de projeto externo via index.json
- **WHEN** o slug está em `index.json` com `pastaProjeto` apontando para diretório externo válido
- **THEN** o sistema usa o caminho externo como `baseDir`
- **THEN** lê `{pastaProjeto}/scr/projeto.json` e popula a sessão
- **THEN** `sess.config.pastaProjeto` é corretamente definido com o caminho externo
- **THEN** gravações subsequentes via `persistStage` vão para o caminho externo

#### Scenario: index.json ausente ou corrompido
- **WHEN** `index.json` não existe ou não pode ser lido
- **THEN** o sistema faz fallback silencioso para `saídas/{slug}/` como `baseDir`
- **THEN** o comportamento é idêntico ao de projetos locais

#### Scenario: Caminho externo registrado mas inexistente
- **WHEN** `index.json` contém `pastaProjeto` para o slug, mas o diretório não existe em disco
- **THEN** o sistema retorna HTTP 404 com `{ error: "Projeto não encontrado" }`

#### Scenario: Migração legada restrita a projetos locais
- **WHEN** o `baseDir` resolvido é `saídas/{slug}/` e o projeto está na estrutura plana legada
- **THEN** o sistema executa `migrarSeNecessario(slug)` para reorganizar em `scr/`
- **WHEN** o `baseDir` é um caminho externo
- **THEN** a migração legada NÃO é executada (projetos externos já têm estrutura `scr/`)
