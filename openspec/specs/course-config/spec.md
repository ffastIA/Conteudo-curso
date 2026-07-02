### Requirement: CourseConfig inclui campos de modalidade, pré-requisitos, proporção teórico/prático e pasta do projeto
O modelo `CourseConfig` SHALL incluir os campos `modalidade`, `preRequisitos`, `proporcaoTeoricoPratico` e `pastaProjeto`. O formulário da Etapa 1 SHALL exibir esses campos antes do botão de submissão. Os campos existentes (nome, publico, carga, duracao, nivel, objetivos) permanecem inalterados.

**Campos do modelo:**
- `modalidade`: string, enum [`presencial`, `EaD`, `híbrido`], required, default `presencial`
- `preRequisitos`: string, optional, texto livre descrevendo conhecimentos prévios necessários
- `proporcaoTeoricoPratico`: string, required, formato livre (ex: "70% teoria / 30% prática")
- `pastaProjeto`: string, required, caminho absoluto para a pasta raiz do projeto (ver capability `project-folder`)

O servidor SHALL validar `pastaProjeto`: rejeitar valor vazio/ausente, paths com `..`, paths dentro do diretório da aplicação, e paths sem permissão de escrita (HTTP 400 em todos os casos).

#### Scenario: Submissão com pastaProjeto preenchido
- **WHEN** o usuário preenche `pastaProjeto` com um caminho válido e submete o formulário da Etapa 1
- **THEN** `sess.config.pastaProjeto` contém o caminho fornecido; o servidor cria o diretório se não existir; arquivos futuros vão para esse local

#### Scenario: pastaProjeto com traversal rejeitado
- **WHEN** `POST /api/config` recebe `pastaProjeto` contendo `..`
- **THEN** o servidor retorna HTTP 400 com mensagem de erro descritiva

#### Scenario: Submissão com campos novos preenchidos
- **WHEN** o usuário preenche o formulário da Etapa 1 incluindo `modalidade`, `preRequisitos` e `proporcaoTeoricoPratico` e submete via `POST /api/config`
- **THEN** a sessão armazena todos os campos do `CourseConfig` incluindo os três novos, e o sistema processa normalmente

#### Scenario: Submissão sem pré-requisitos (campo opcional)
- **WHEN** o usuário deixa `preRequisitos` em branco e submete o formulário
- **THEN** o sistema aceita a submissão normalmente e armazena `preRequisitos: ""` na sessão sem erro de validação

#### Scenario: Submissão sem proporção teórico/prático
- **WHEN** o usuário não preenche `proporcaoTeoricoPratico` e tenta submeter
- **THEN** o sistema exibe validação indicando que o campo é obrigatório antes de permitir o avanço

#### Scenario: `proporcaoTeoricoPratico` disponível nas skills
- **WHEN** `planoAulaSkill` ou `conteudoSkill` é chamada após Etapa 1 concluída
- **THEN** `session.config.proporcaoTeoricoPratico` está disponível e é passado como parâmetro para a skill usar no prompt

#### Scenario: pastaProjeto restaurado ao carregar projeto
- **WHEN** `POST /api/carregar-projeto` carrega um projeto com `pastaProjeto` salvo em `projeto.json`
- **THEN** `data.config.pastaProjeto` está presente na resposta e o campo "Pasta do projeto" na Etapa 1 é preenchido automaticamente

---

### Requirement: Configuração do curso e geração da ementa
O sistema SHALL atualizar `sess.config` com os dados do formulário sempre que `POST /api/config` for chamado, calculando se a ementa precisará ser regenerada: (a) nenhuma ementa existir na sessão, OU (b) ao menos um dos campos pedagógicos (`nome`, `publico`, `carga`, `duracao`, `nivel`, `objetivos`) tiver valor diferente do registrado na sessão antes da atualização. Campos operacionais (`pastaProjeto`, `modalidade`, `proporcaoTeoricoPratico`, `preRequisitos`) SHALL ser atualizados sem marcar necessidade de regeneração. A geração da ementa em si SHALL NOT ocorrer dentro de `POST /api/config` — SHALL ocorrer somente na confirmação da metodologia pedagógica (capability `pedagogical-methodology`, requisito "Confirmação explícita da metodologia definitiva"), usando a metodologia já definitiva nesse momento.

#### Scenario: Primeira configuração do curso
- **WHEN** o usuário submete a Etapa 1 pela primeira vez (sem ementa na sessão)
- **THEN** o sistema atualiza `sess.config` e marca que a ementa precisa ser gerada
- **THEN** `POST /api/config` retorna `{ ok: true }` sem o campo `ementa` (ela ainda não existe)
- **THEN** a ementa só é efetivamente gerada quando a metodologia for confirmada (`POST /api/metodologia/confirmar`)

#### Scenario: Atualização apenas de pastaProjeto
- **WHEN** o usuário submete a Etapa 1 alterando somente o campo "Pasta do projeto"
- **THEN** o sistema atualiza `sess.config.pastaProjeto`
- **THEN** NÃO marca necessidade de regeneração de ementa

#### Scenario: Atualização de campo pedagógico com ementa existente
- **WHEN** o usuário submete a Etapa 1 alterando `nome`, `publico`, `carga`, `duracao`, `nivel` ou `objetivos` de um projeto que já tem ementa
- **THEN** o sistema atualiza `sess.config` e marca que a ementa precisa ser regenerada
- **THEN** a ementa é efetivamente regenerada na próxima confirmação da metodologia, não imediatamente

#### Scenario: Atualização de campos operacionais múltiplos
- **WHEN** o usuário submete a Etapa 1 alterando `modalidade` e `proporcaoTeoricoPratico` sem alterar campos pedagógicos
- **THEN** o sistema atualiza `sess.config` sem marcar necessidade de regeneração de ementa

#### Scenario: Confirmação da metodologia gera a ementa pendente
- **WHEN** a Etapa 1 marcou necessidade de regeneração de ementa e o usuário confirma a metodologia (`POST /api/metodologia/confirmar`)
- **THEN** o sistema gera a ementa via `ementaSkill`, passando a metodologia definitiva como parâmetro
- **THEN** a ementa gerada é persistida em disco junto com a metodologia
