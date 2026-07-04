## ADDED Requirements

### Requirement: Relatório inclui seção estruturada "Melhorias a serem Aplicadas"
O relatório de revisão de qualidade SHALL terminar com a seção consolidada `## Melhorias a serem Aplicadas`, precedida da instrução fixa ao revisor ("Edite apenas os itens abaixo — uma melhoria por linha. O sistema aplicará exclusivamente o que estiver nesta seção."). Para cada aula, a seção SHALL conter a linha `Aula NN` seguida de uma melhoria por linha (pré-preenchidas a partir do resumo emitido pela revisão), com linha em branco entre aulas. A `revisaoQualidadeSkill` SHALL emitir, ao final da revisão de cada aula, a subseção `### Resumo de Melhorias Propostas` com bullets curtos (uma melhoria por bullet, sem prosa), da qual o servidor extrai os itens da seção consolidada.

#### Scenario: Seção consolidada pré-preenchida
- **WHEN** o relatório de revisão é gerado para um curso de 3 aulas
- **THEN** o documento termina com `## Melhorias a serem Aplicadas` contendo os blocos `Aula 01`, `Aula 02` e `Aula 03`, cada um com as melhorias propostas pela revisão, uma por linha

#### Scenario: Instrução ao revisor presente
- **WHEN** o relatório é exportado como .docx
- **THEN** o parágrafo de instrução aparece imediatamente antes da seção consolidada

#### Scenario: Aula sem resumo emitido pelo modelo
- **WHEN** a revisão de uma aula não contém a subseção `### Resumo de Melhorias Propostas`
- **THEN** o bloco `Aula NN` aparece na seção consolidada sem itens (o revisor pode preenchê-lo manualmente) e a geração não falha
