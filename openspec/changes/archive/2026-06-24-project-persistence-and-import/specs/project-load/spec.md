## ADDED Requirements

### Requirement: Listar projetos existentes
O sistema SHALL escanear o diretório `saídas/` e retornar todos os projetos que possuam `projeto.json`, incluindo nome do curso, data da última modificação e quais etapas foram concluídas.

#### Scenario: Projetos encontrados
- **WHEN** o cliente faz `GET /api/projetos`
- **THEN** o sistema retorna JSON `{ projetos: [{ slug, nome, etapas: string[], ultimaModificacao }] }` com todos os projetos que possuem `projeto.json`

#### Scenario: Nenhum projeto encontrado
- **WHEN** o cliente faz `GET /api/projetos` e `saídas/` está vazia ou sem `projeto.json`
- **THEN** o sistema retorna `{ projetos: [] }` com status 200

#### Scenario: Diretório saídas/ não existe
- **WHEN** o cliente faz `GET /api/projetos` e o diretório `saídas/` não existe
- **THEN** o sistema retorna `{ projetos: [] }` com status 200 sem lançar erro

---

### Requirement: Carregar projeto existente na sessão
O sistema SHALL reconstruir a sessão completa a partir de `projeto.json` e dos arquivos `.txt` em disco, sem realizar nenhuma chamada à OpenAI.

#### Scenario: Projeto válido com projeto.json completo
- **WHEN** o cliente faz `POST /api/carregar-projeto` com `{ slug: "Python_para_Iniciantes" }`
- **THEN** o sistema popula `sess.config`, `sess.bncc`, `sess.metodologia`, `sess.aulas` a partir do `projeto.json` e carrega os campos textuais (`ementa`, `pesquisa`, `planoEnsino`, `planoAula`, `conteudo`) a partir dos `.txt` correspondentes, retornando `{ ok: true, etapasCarregadas: string[], camposFaltantes: string[] }`

#### Scenario: Projeto sem projeto.json (legado)
- **WHEN** o cliente faz `POST /api/carregar-projeto` com slug de pasta existente mas sem `projeto.json`
- **THEN** o sistema carrega apenas os campos textuais disponíveis nos `.txt`, retorna `{ ok: true, etapasCarregadas: [...], camposFaltantes: ["bncc", "metodologia", "aulas"] }` e o frontend alerta o usuário para reinserir os campos faltantes

#### Scenario: Slug inexistente
- **WHEN** o cliente faz `POST /api/carregar-projeto` com slug que não existe em `saídas/`
- **THEN** o sistema retorna status 404 com `{ error: "Projeto não encontrado" }`

---

### Requirement: Salvar projeto automaticamente a cada etapa
O sistema SHALL gravar `saídas/{slug}/projeto.json` ao final de cada etapa concluída, serializando os campos estruturados da sessão: `config`, `bncc`, `metodologia`, `aulas`, e um mapa `stages` com metadados de origem de cada artefato.

#### Scenario: Etapa concluída com sucesso
- **WHEN** `persistStage()` é chamado com qualquer etapa
- **THEN** `projeto.json` é atualizado com os campos atuais da sessão e `stages[baseName] = { fonte: "ia", geradoEm: ISO8601 }`

#### Scenario: Sessão sem config definido
- **WHEN** `persistStage()` é chamado mas `sess.config.nome` está vazio
- **THEN** `saveProject()` é ignorado silenciosamente (sem erro)

---

### Requirement: Interface de seleção de projeto existente
O sistema SHALL exibir na Etapa 0 um card "Abrir projeto existente" que liste os projetos disponíveis e permita recarregá-los com um clique.

#### Scenario: Projetos disponíveis listados ao carregar a página
- **WHEN** a página é carregada e `GET /api/projetos` retorna ao menos um projeto
- **THEN** o card "Abrir projeto existente" é exibido com a lista de projetos em cards clicáveis mostrando nome, data e etapas concluídas

#### Scenario: Nenhum projeto disponível
- **WHEN** `GET /api/projetos` retorna lista vazia
- **THEN** o card "Abrir projeto existente" é ocultado

#### Scenario: Usuário seleciona um projeto
- **WHEN** o usuário clica em um projeto da lista
- **THEN** `POST /api/carregar-projeto` é chamado, a interface avança para a última etapa concluída e exibe banner "Projeto carregado: {nome}"
