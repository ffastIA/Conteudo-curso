# model-configuration Specification

## Purpose
TBD - created by archiving change docx-markdown-completo. Update Purpose after archive.
## Requirements
### Requirement: Modelos configuráveis por ambiente
O sistema SHALL ler `OPENAI_RESEARCH_MODEL`, `OPENAI_CONTENT_MODEL` e `OPENAI_ECONOMY_MODEL` do ambiente, mantendo os modelos atuais como padrão, e SHALL usar essas constantes em todas as skills.

#### Scenario: Sem variáveis
- **WHEN** nenhuma variável de modelo está definida
- **THEN** as skills usam os modelos padrão atuais

#### Scenario: Modelo de conteúdo alterado
- **WHEN** `OPENAI_CONTENT_MODEL=outro-modelo` está definido
- **THEN** `conteudoSkill` usa `outro-modelo`

### Requirement: Contexto pedagógico em formato único
Todas as skills SHALL incluir o contexto BNCC e a metodologia exclusivamente via `pedagCtxBlock`, sem formatos paralelos.

#### Scenario: Ementa com BNCC
- **WHEN** a skill de ementa recebe contexto BNCC
- **THEN** o bloco no prompt é o gerado por `pedagCtxBlock`

