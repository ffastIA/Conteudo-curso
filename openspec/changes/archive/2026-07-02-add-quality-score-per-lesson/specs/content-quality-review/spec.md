## ADDED Requirements

### Requirement: Nota de qualidade por aula
O relatório de revisão de qualidade SHALL incluir, para cada aula, uma nota de qualidade de 0 a 1 (0 = qualidade baixíssima, 1 = qualidade total), fundamentada na aderência ao plano de aula, ao plano de ensino, à ementa, e na gravidade das deficiências identificadas na análise da mesma aula. A nota SHALL ser expressa no texto retornado pela IA em um formato fixo e extraível por regex pelo servidor.

#### Scenario: Nota extraída com sucesso
- **WHEN** a análise de uma aula retorna uma linha no formato "Nota: X.XX"
- **THEN** o sistema extrai o valor numérico e o associa ao número e título daquela aula

#### Scenario: Falha de formatação não interrompe o relatório
- **WHEN** a análise de uma aula não contém uma linha de nota no formato esperado
- **THEN** o sistema atribui "N/A" à nota daquela aula na lista-resumo
- **THEN** a geração do relatório continua normalmente para as demais aulas

#### Scenario: Nota fora da faixa é limitada
- **WHEN** a IA retorna um valor de nota fora do intervalo [0, 1] (ex.: 1.2)
- **THEN** o sistema limita (clamp) o valor ao intervalo [0, 1] antes de exibi-lo

---

### Requirement: Lista-resumo de notas na última página do relatório
O sistema SHALL anexar, como a última seção do relatório de revisão de qualidade, uma lista com o número, título e nota de cada aula, ordenada em ordem crescente pelo número da aula. Essa seção SHALL ser a última adicionada ao conteúdo do relatório, garantindo que ocupe a(s) página(s) final(is) do arquivo `.docx` gerado.

#### Scenario: Lista ordenada por aula
- **WHEN** o relatório de revisão de qualidade é gerado para um curso com N aulas
- **THEN** a seção final "Notas de Qualidade por Aula" lista as N aulas em ordem crescente de número, no formato "Aula X: Título — Nota: 0.XX"

#### Scenario: Seção final sempre na última página
- **WHEN** o relatório é exportado como `.docx`
- **THEN** a lista de notas está posicionada após uma quebra de página, tornando-a a seção final do documento

#### Scenario: Pré-visualização ao vivo não exibe marcadores técnicos
- **WHEN** o relatório é exibido ao vivo no navegador durante o streaming
- **THEN** nenhum marcador técnico de quebra de página aparece como texto visível na tela
