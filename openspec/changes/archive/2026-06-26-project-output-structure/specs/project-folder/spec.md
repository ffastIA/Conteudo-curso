## ADDED Requirements

### Requirement: Pasta raiz por projeto com subdiretório /scr para internos
Cada projeto SHALL ter uma pasta raiz configurável (`pastaProjeto` em `sess.config`). O sistema SHALL salvar arquivos `.docx` de exportação na raiz dessa pasta e arquivos internos (`.txt`, `projeto.json`) no subdiretório `/scr` dentro dela. Quando `pastaProjeto` não estiver configurado, o sistema SHALL usar `saídas/{slug}/` como raiz de fallback com a mesma estrutura.

#### Scenario: Projeto com pastaProjeto configurado — docx vai para a raiz
- **WHEN** uma etapa é concluída e `sess.config.pastaProjeto` está definido (ex: `C:/MeusCursos/Python/`)
- **THEN** o arquivo `.docx` gerado é salvo em `C:/MeusCursos/Python/{nome-arquivo}.docx`

#### Scenario: Projeto com pastaProjeto configurado — txt vai para /scr
- **WHEN** uma etapa é concluída e `sess.config.pastaProjeto` está definido
- **THEN** o arquivo `.txt` correspondente é salvo em `C:/MeusCursos/Python/scr/{baseName}.txt`

#### Scenario: Projeto sem pastaProjeto — fallback para saídas/{slug}/
- **WHEN** `sess.config.pastaProjeto` é nulo ou vazio
- **THEN** o `.docx` vai para `saídas/{slug}/{nome-arquivo}.docx` e o `.txt` vai para `saídas/{slug}/scr/{baseName}.txt`

#### Scenario: Diretório /scr criado automaticamente
- **WHEN** o `/scr` não existe ainda ao salvar o primeiro arquivo interno
- **THEN** o sistema cria o diretório `{courseRootDir}/scr/` automaticamente sem erro

### Requirement: Validação de pastaProjeto no servidor
O servidor SHALL validar que `pastaProjeto` não contém traversal de path (`..`) e não aponta para dentro do diretório da aplicação. SHALL verificar permissão de escrita antes de aceitar o valor.

#### Scenario: pastaProjeto com traversal rejeitado
- **WHEN** `POST /api/config` recebe `pastaProjeto: "../../etc/passwd"`
- **THEN** o servidor retorna HTTP 400 com mensagem de erro descritiva

#### Scenario: pastaProjeto sem permissão de escrita rejeitado
- **WHEN** `POST /api/config` recebe `pastaProjeto` apontando para um diretório sem permissão de escrita
- **THEN** o servidor retorna HTTP 400 indicando que a pasta não é gravável

#### Scenario: pastaProjeto válido aceito
- **WHEN** `POST /api/config` recebe `pastaProjeto` com caminho absoluto válido e gravável
- **THEN** o servidor aceita o valor, cria o diretório se necessário, e salva `pastaProjeto` em `sess.config`

### Requirement: Índice global de projetos em saídas/index.json
O sistema SHALL manter um arquivo `saídas/index.json` mapeando `slug → { nome, pastaProjeto, ultimaModificacao }`. `saveProject()` SHALL atualizar esse índice a cada gravação. `GET /api/projetos` SHALL combinar o índice com os diretórios presentes em `saídas/` para descobrir todos os projetos.

#### Scenario: Índice atualizado ao salvar projeto
- **WHEN** `saveProject()` é chamado para o projeto "Python para Iniciantes"
- **THEN** `saídas/index.json` contém uma entrada `Python_para_Iniciantes` com `nome`, `pastaProjeto` e `ultimaModificacao` atualizados

#### Scenario: GET /api/projetos lista projetos com pastaProjeto externo
- **WHEN** o projeto "Python" está em `C:/Docs/Python/` (externo ao app) e esse path está no índice
- **THEN** `GET /api/projetos` inclui "Python" na lista, verificando que `C:/Docs/Python/scr/projeto.json` existe

#### Scenario: Projeto deletado do disco removido da lista
- **WHEN** o diretório `/scr` de um projeto não existe mais no disco
- **THEN** `GET /api/projetos` não inclui esse projeto na lista (verifica existência antes de listar)

### Requirement: Migração automática de projetos legados on-load
Na função `POST /api/carregar-projeto`, o sistema SHALL detectar projetos com estrutura plana (arquivos `.txt` e `projeto.json` diretamente em `saídas/{slug}/`) e movê-los para `saídas/{slug}/scr/` antes de carregar a sessão.

#### Scenario: Projeto legado migrado automaticamente ao carregar
- **WHEN** `POST /api/carregar-projeto` é chamado para um projeto com `saídas/{slug}/ementa.txt` (sem `/scr`)
- **THEN** o sistema move `ementa.txt` e `projeto.json` para `saídas/{slug}/scr/`, então carrega a sessão normalmente

#### Scenario: Projeto já migrado não é movido novamente
- **WHEN** `POST /api/carregar-projeto` é chamado para um projeto com arquivos já em `saídas/{slug}/scr/`
- **THEN** nenhum arquivo é movido; o sistema carrega normalmente sem erros
