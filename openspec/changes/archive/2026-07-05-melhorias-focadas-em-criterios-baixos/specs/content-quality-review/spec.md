## MODIFIED Requirements

### Requirement: Relatório inclui seção estruturada "Melhorias a serem Aplicadas"
O relatório de revisão de qualidade SHALL terminar com a seção consolidada `## Melhorias a serem Aplicadas`, precedida da instrução fixa ao revisor ("Edite apenas os itens abaixo — uma melhoria por linha. O sistema aplicará exclusivamente o que estiver nesta seção."). Para cada aula, a seção SHALL conter a linha `Aula NN` seguida de uma melhoria por linha (pré-preenchidas a partir do resumo emitido pela revisão), com linha em branco entre aulas. A `revisaoQualidadeSkill` SHALL emitir, ao final da revisão de cada aula, a subseção `### Resumo de Melhorias Propostas` com bullets curtos (uma melhoria por bullet, sem prosa), da qual o servidor extrai os itens da seção consolidada. O resumo SHALL ser derivado prioritariamente do(s) 1-2 critério(s) com menor nota na rubrica da própria aula (nivelamento), com cada melhoria prefixada pelo critério-alvo entre colchetes (ex.: `[Adequação a Nível/Público/Modalidade] ...`); quando todos os 5 critérios estiverem com nota ≥ 9, o resumo SHALL declarar "Nenhuma". A tag `[Critério]` é orientativa: uma melhoria sem tag (inclusive adicionada manualmente pelo revisor) permanece válida e aplicável, e nenhum filtro por critério é imposto na aplicação.

#### Scenario: Seção consolidada pré-preenchida
- **WHEN** o relatório de revisão é gerado para um curso de 3 aulas
- **THEN** o documento termina com `## Melhorias a serem Aplicadas` contendo os blocos `Aula 01`, `Aula 02` e `Aula 03`, cada um com as melhorias propostas pela revisão, uma por linha

#### Scenario: Instrução ao revisor presente
- **WHEN** o relatório é exportado como .docx
- **THEN** o parágrafo de instrução aparece imediatamente antes da seção consolidada

#### Scenario: Aula sem resumo emitido pelo modelo
- **WHEN** a revisão de uma aula não contém a subseção `### Resumo de Melhorias Propostas`
- **THEN** o bloco `Aula NN` aparece na seção consolidada sem itens (o revisor pode preenchê-lo manualmente) e a geração não falha

#### Scenario: Melhorias derivadas dos critérios mais baixos
- **WHEN** a rubrica de uma aula tem notas 8/9/7/8/8 nos 5 critérios
- **THEN** o prompt instrui que as melhorias do resumo sejam derivadas prioritariamente do(s) critério(s) de menor nota (no exemplo, "Adequação a Nível/Público/Modalidade" com 7/10), cada uma prefixada com o critério-alvo entre colchetes

#### Scenario: Critérios nivelados em nota alta declaram convergência
- **WHEN** todos os 5 critérios de uma aula estão com nota ≥ 9
- **THEN** o resumo declara "Nenhuma", reforçando o sinal de convergência antes do aviso de early stopping

#### Scenario: Melhoria sem tag continua válida
- **WHEN** um item da seção estruturada não começa com `[Critério]` (ex.: melhoria adicionada manualmente pelo revisor)
- **THEN** o item é parseado e aplicado normalmente — a tag é orientativa, nunca obrigatória

---

## ADDED Requirements

### Requirement: Linha de foco sugerido por aula no relatório de revisão
Quando a rubrica de 5 critérios de uma aula for parseada com sucesso, o relatório de revisão SHALL incluir, na análise daquela aula, uma linha "Foco sugerido desta rodada: <critério de menor nota> (N/10)", calculada mecanicamente pelo servidor a partir da rubrica extraída — independente de o modelo ter respeitado o direcionamento no resumo de melhorias.

#### Scenario: Foco calculado a partir da rubrica parseada
- **WHEN** a rubrica de uma aula é extraída com sucesso e o critério de menor nota é "Adequação a Nível/Público/Modalidade" com 7/10
- **THEN** a análise da aula no relatório inclui a linha "Foco sugerido desta rodada: Adequação a Nível/Público/Modalidade (7/10)"

#### Scenario: Rubrica não parseável omite a linha sem erro
- **WHEN** a análise de uma aula não contém as 5 linhas de critério no formato esperado (fallback para nota holística ou N/A)
- **THEN** a linha de foco não é incluída para aquela aula e a geração do relatório continua normalmente
