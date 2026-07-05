## MODIFIED Requirements

### Requirement: Nota de qualidade por aula
O relatório de revisão de qualidade SHALL incluir, para cada aula, uma nota de qualidade de 0 a 1 (0 = qualidade baixíssima, 1 = qualidade total), calculada pela fórmula de score da capability `quality-scoring` (`Score = 0.7 × RubricaLLM + 0.3 × Determinístico`). A seção "Nota de Qualidade" do prompt SHALL pedir à IA os 5 critérios da rubrica (Aderência ao Plano de Aula, Aderência ao Plano de Ensino e Ementa, Adequação a Nível/Público/Modalidade, Qualidade Didática, Clareza e Estrutura), cada um em escala 0–10, numa linha parseável por critério, em vez de uma nota holística autoatribuída. O servidor SHALL calcular a nota final combinando a rubrica extraída com os componentes determinísticos da aula.

#### Scenario: Nota calculada a partir dos 5 critérios
- **WHEN** a análise de uma aula retorna as 5 linhas de critério no formato esperado (`Critério: N/10`)
- **THEN** o sistema extrai os 5 valores, calcula `RubricaLLM` (média ponderada) e `Determinístico`, e compõe a nota final pela fórmula de `quality-scoring`

#### Scenario: Fallback para nota holística quando a rubrica não é reconhecida
- **WHEN** a análise de uma aula não contém as 5 linhas de critério no formato esperado, mas contém uma linha "Nota: X.XX"
- **THEN** o sistema usa esse valor diretamente como nota daquela aula (sem componente determinístico), preservando o comportamento anterior a esta mudança

#### Scenario: Falha total de formatação não interrompe o relatório
- **WHEN** a análise de uma aula não contém nem os 5 critérios nem uma linha de nota holística
- **THEN** o sistema atribui "N/A" à nota daquela aula na lista-resumo
- **THEN** a geração do relatório continua normalmente para as demais aulas

#### Scenario: Nota fora da faixa é limitada
- **WHEN** qualquer componente do cálculo produz um valor fora do intervalo [0, 1]
- **THEN** o sistema limita (clamp) o valor ao intervalo [0, 1] antes de exibi-lo
