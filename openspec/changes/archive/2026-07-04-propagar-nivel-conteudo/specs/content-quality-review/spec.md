## ADDED Requirements

### Requirement: Revisão de qualidade avalia adequação ao nível declarado
A `revisaoQualidadeSkill` SHALL incluir no relatório uma seção obrigatória "Adequação ao Nível Declarado", avaliando se profundidade, vocabulário e complexidade do conteúdo correspondem ao nível configurado (`config.nivel`), ao lado da avaliação de faixa etária/perfil de público já existente. A `aplicarMelhoriasSkill` SHALL injetar as diretrizes de nível para que as melhorias preservem o nível.

#### Scenario: Relatório aponta desvio de nível
- **WHEN** o relatório de revisão é gerado para um curso `Básico` cujo conteúdo usa vocabulário técnico sem definição e assume pré-requisitos
- **THEN** o relatório sinaliza a inadequação na seção "Adequação ao Nível Declarado", com recomendação de ajuste

#### Scenario: Melhorias preservam o nível
- **WHEN** o usuário aplica melhorias sugeridas pela revisão em um curso `Avançado`
- **THEN** o conteúdo melhorado mantém a profundidade e o vocabulário do nível avançado (o prompt de `aplicarMelhoriasSkill` contém as diretrizes de nível)
