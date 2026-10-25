# docx-rich-formatting Specification

## Purpose
TBD - created by archiving change docx-markdown-completo. Update Purpose after archive.
## Requirements
### Requirement: Elementos Markdown em .docx
`buildDocx` SHALL renderizar listas numeradas, tabelas, blocos de código (fonte monoespaçada e sombreamento), itálico e links clicáveis, além dos elementos já suportados.

#### Scenario: Lista numerada
- **WHEN** o conteúdo contém `1. passo um` e `2. passo dois`
- **THEN** o `.docx` contém uma lista numerada com os dois itens

#### Scenario: Tabela
- **WHEN** o conteúdo contém uma tabela Markdown de 2 colunas
- **THEN** o `.docx` contém uma tabela com as mesmas células

#### Scenario: Bloco de código
- **WHEN** o conteúdo contém um bloco cercado por crases triplas
- **THEN** o `.docx` mostra o código em fonte monoespaçada com sombreamento

### Requirement: Fontes com URL clicável
Os documentos de pesquisa e de aula SHALL listar as fontes com URL como hiperlink clicável.

#### Scenario: Pesquisa exportada
- **WHEN** `pesquisa.docx` é gerado com fontes
- **THEN** cada fonte aparece com título e hiperlink para a URL

### Requirement: Paridade com a interface
`renderMarkdown` na UI SHALL renderizar o mesmo conjunto de elementos do `.docx`.

#### Scenario: Tabela na UI
- **WHEN** o resultado contém uma tabela Markdown
- **THEN** a UI exibe uma tabela HTML

### Requirement: Prompt do template Gamma por configuração
As instruções específicas de template do Gamma SHALL vir de configuração por template e SHALL NOT estar fixas no código.

#### Scenario: Template sem instrução
- **WHEN** o template escolhido não tem entrada em `GAMMA_TEMPLATE_PROMPTS`
- **THEN** nenhuma instrução fixa é adicionada ao prompt dos slides

#### Scenario: Template com instrução
- **WHEN** o template tem entrada configurada
- **THEN** a instrução é adicionada ao prompt dos slides

