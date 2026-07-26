## Purpose

Permitir que o usuário retome um projeto existente reconstruindo a sessão
inteira a partir do `projeto.json` e dos arquivos `.txt` em disco, sem
nenhuma chamada à OpenAI.

## Requirements

### Requirement: Carregar projeto existente na sessão
O sistema SHALL reconstruir a sessão completa a partir do `projeto.json` e dos arquivos `.txt` encontrados na pasta informada pelo cliente, sem realizar nenhuma chamada à OpenAI. O sistema SHALL receber o caminho absoluto da pasta do projeto diretamente na requisição (não um `slug` resolvido indiretamente), SHALL definir `sess.config.pastaProjeto` como esse caminho incondicionalmente (mesmo que o `projeto.json` da pasta contenha um valor diferente ou vazio), e SHALL retornar, além dos campos já existentes, a lista de arquivos reais encontrados na pasta (escaneados diretamente do disco).

#### Scenario: Projeto válido com projeto.json completo
- **WHEN** o cliente faz `POST /api/carregar-projeto` com `{ pasta: "C:/MeusCursos/Python" }` e essa pasta contém `scr/projeto.json`
- **THEN** o sistema popula `sess.config`, `sess.bncc`, `sess.metodologia`, `sess.aulas` a partir do `projeto.json` e carrega os campos textuais (`ementa`, `pesquisa`, `planoEnsino`, `planoAula`, `conteudo`) a partir dos `.txt` correspondentes
- **THEN** `sess.config.pastaProjeto` é definido como `"C:/MeusCursos/Python"`, independentemente do que estava gravado em `projeto.json.config.pastaProjeto`
- **THEN** a resposta inclui `{ ok: true, etapasCarregadas: string[], camposFaltantes: string[], arquivos: [...] }`, onde `arquivos` reflete o escaneamento real da pasta (não o campo `stages` do `projeto.json`)

#### Scenario: Projeto sem projeto.json (legado)
- **WHEN** o cliente faz `POST /api/carregar-projeto` com `{ pasta }` apontando para uma pasta existente mas sem `scr/projeto.json`
- **THEN** o sistema carrega apenas os campos textuais disponíveis nos `.txt` encontrados, retorna `camposFaltantes: ["bncc", "metodologia", "aulas"]`, define `sess.config.pastaProjeto = pasta`, e o frontend alerta o usuário para reinserir os campos faltantes

#### Scenario: Pasta inexistente
- **WHEN** o cliente faz `POST /api/carregar-projeto` com `{ pasta }` que não existe no disco
- **THEN** o sistema retorna status 404 com `{ error: "Pasta não encontrada" }`

#### Scenario: Pasta não informada
- **WHEN** o cliente faz `POST /api/carregar-projeto` sem o campo `pasta` (ou vazio)
- **THEN** o sistema retorna status 400 com uma mensagem de erro indicando que a pasta é obrigatória

---

### Requirement: Salvar projeto automaticamente a cada etapa
O sistema SHALL gravar `{courseRootDir}/scr/projeto.json` ao final de cada etapa concluída, serializando os campos estruturados da sessão: `config`, `bncc`, `metodologia`, `aulas`, e um mapa `stages` com metadados de origem de cada artefato.

#### Scenario: Etapa concluída com sucesso
- **WHEN** `persistStage()` é chamado com qualquer etapa
- **THEN** `projeto.json` é atualizado com os campos atuais da sessão e `stages[baseName] = { fonte: "ia", geradoEm: ISO8601 }`

#### Scenario: Sessão sem config definido
- **WHEN** `persistStage()` é chamado mas `sess.config.nome` está vazio
- **THEN** `saveProject()` é ignorado silenciosamente (sem erro)

---

### Requirement: Interface de seleção de projeto existente
O sistema SHALL exibir na Etapa 0 um botão "Selecionar pasta do projeto" que abre um diálogo nativo de seleção de pasta (capability `native-folder-picker`) e, após o usuário escolher uma pasta, chama o carregamento do projeto por caminho, exibindo o resultado com banner e pequenos cards representando os arquivos reais encontrados na pasta (ementa, plano de ensino, plano de aula, aulaNN_conteudo, etc.).

#### Scenario: Usuário clica no botão e escolhe uma pasta válida
- **WHEN** o usuário clica em "Selecionar pasta do projeto" e escolhe, no diálogo nativo, uma pasta que contém um projeto válido
- **THEN** o sistema chama `POST /api/carregar-projeto` com essa pasta
- **THEN** a interface exibe um banner "Projeto carregado: {nome}" e um card pequeno para cada arquivo encontrado (rotulado, por exemplo, "Ementa", "Plano de Ensino", "Plano de Aula", "Aula 01", "Aula 02", etc.)
- **THEN** os campos da Etapa 1 são preenchidos automaticamente a partir de `config` retornado
- **THEN** a interface avança para a última etapa concluída

#### Scenario: Usuário cancela a seleção de pasta
- **WHEN** o usuário clica em "Selecionar pasta do projeto" e cancela o diálogo nativo
- **THEN** nenhuma requisição de carregamento é feita e a interface permanece como estava

#### Scenario: Pasta escolhida não é um projeto válido
- **WHEN** o usuário escolhe uma pasta que não existe mais ou não contém nenhum arquivo reconhecível de projeto
- **THEN** o sistema exibe uma mensagem de erro clara, sem travar a interface
