## ADDED Requirements

### Requirement: Revisão de qualidade avalia adequação à modalidade
A `revisaoQualidadeSkill` SHALL receber a modalidade do curso e incluir no relatório uma avaliação de adequação do conteúdo à modalidade declarada; a `aplicarMelhoriasSkill` SHALL receber a modalidade para que as melhorias aplicadas a preservem.

#### Scenario: Relatório aponta desvio de modalidade
- **WHEN** o relatório de revisão é gerado para um curso EaD cujo conteúdo propõe dinâmicas exclusivamente presenciais
- **THEN** o relatório sinaliza a inadequação à modalidade na seção correspondente, com recomendação de ajuste

#### Scenario: Melhorias preservam a modalidade
- **WHEN** o usuário aplica melhorias sugeridas pela revisão em um curso EaD
- **THEN** o conteúdo melhorado mantém atividades e recursos compatíveis com EaD (o prompt de `aplicarMelhoriasSkill` contém a modalidade)
