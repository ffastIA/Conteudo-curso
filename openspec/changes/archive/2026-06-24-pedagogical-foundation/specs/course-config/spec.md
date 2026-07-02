## MODIFIED Requirements

### Requirement: CourseConfig inclui campos de modalidade, pré-requisitos e proporção teórico/prático
O modelo `CourseConfig` SHALL incluir três novos campos opcionais: `modalidade`, `preRequisitos` e `proporcaoTeoricoPratico`. O formulário da Etapa 1 SHALL exibir esses campos antes do botão de submissão. Os campos existentes (nome, publico, carga, duracao, nivel, objetivos) permanecem inalterados.

**Campos adicionados:**
- `modalidade`: string, enum [`presencial`, `EaD`, `híbrido`], required, default `presencial`
- `preRequisitos`: string, optional, texto livre descrevendo conhecimentos prévios necessários
- `proporcaoTeoricoPratico`: string, required, formato livre (ex: "70% teoria / 30% prática")

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
