## MODIFIED Requirements

### Requirement: CourseConfig inclui campos de modalidade, pré-requisitos, proporção teórico/prático e pasta do projeto
O modelo `CourseConfig` SHALL incluir quatro campos opcionais: `modalidade`, `preRequisitos`, `proporcaoTeoricoPratico` (adicionados anteriormente) e o novo campo `pastaProjeto`. O formulário da Etapa 1 SHALL exibir `pastaProjeto` após os campos existentes e antes do botão de submissão.

**Campos do modelo:**
- `modalidade`: string, enum [`presencial`, `EaD`, `híbrido`], required, default `presencial`
- `preRequisitos`: string, optional, texto livre
- `proporcaoTeoricoPratico`: string, required, formato livre (ex: "70% teoria / 30% prática")
- `pastaProjeto`: string, optional, caminho absoluto para a pasta raiz do projeto

#### Scenario: Submissão com pastaProjeto preenchido
- **WHEN** o usuário preenche `pastaProjeto` com um caminho válido e submete o formulário da Etapa 1
- **THEN** `sess.config.pastaProjeto` contém o caminho fornecido; o servidor cria o diretório se não existir; arquivos futuros vão para esse local

#### Scenario: Submissão sem pastaProjeto (campo opcional)
- **WHEN** o usuário deixa `pastaProjeto` em branco e submete o formulário
- **THEN** o sistema aceita a submissão normalmente com `pastaProjeto: ""` e usa `saídas/{slug}/` como fallback

#### Scenario: Submissão com campos de modalidade, preRequisitos e proporcaoTeoricoPratico — comportamento inalterado
- **WHEN** o usuário preenche o formulário da Etapa 1 incluindo `modalidade`, `preRequisitos` e `proporcaoTeoricoPratico` e submete via `POST /api/config`
- **THEN** a sessão armazena todos os campos do `CourseConfig` incluindo os três campos anteriores, e o sistema processa normalmente

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
