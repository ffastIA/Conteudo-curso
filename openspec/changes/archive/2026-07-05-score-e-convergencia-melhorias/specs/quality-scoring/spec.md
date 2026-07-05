## ADDED Requirements

### Requirement: Fórmula de score de qualidade de aula
O sistema SHALL calcular o score de qualidade de uma aula como `Score = 0.7 × RubricaLLM + 0.3 × Determinístico`, ambos em escala 0–1, resultado arredondado a 2 casas decimais. `RubricaLLM` SHALL ser a média ponderada de 5 critérios avaliados por LLM em escala 0–10 (convertidos a 0–1): Aderência ao Plano de Aula (peso 0.30), Aderência ao Plano de Ensino e Ementa (0.25), Adequação a Nível/Público/Modalidade (0.20), Qualidade Didática (0.15), Clareza e Estrutura (0.10). `Determinístico` SHALL ser a média de três componentes calculados sem chamada de API: cobertura de objetivos, penalidade de sobreposição Jaccard (limiar 0.55, mesmo já usado no sistema) e completude estrutural (presença tolerante das seções esperadas do conteúdo).

#### Scenario: Cálculo com todos os componentes disponíveis
- **WHEN** os 5 critérios da rubrica e os 3 componentes determinísticos estão disponíveis para uma aula
- **THEN** o score final é `0.7 × médiaPonderada(5 critérios / 10) + 0.3 × média(3 componentes)`, arredondado a 2 casas

#### Scenario: Fórmula compartilhada entre revisão e gate de melhorias
- **WHEN** o score é calculado tanto na revisão de qualidade quanto no julgamento pareado do ciclo de melhorias
- **THEN** os dois usam a mesma função pura de composição (`computeScoreComposto`), garantindo que "score" signifique a mesma coisa nos dois contextos

---

### Requirement: Componentes determinísticos do score
O sistema SHALL calcular, sem chamada de API, três componentes por aula: (1) cobertura de objetivos — fração dos termos significativos de `aula.objetivos` (normalizados, tolerantes a acento/caixa) presentes no texto da aula; (2) penalidade de sobreposição — `1 - max(0, similaridadeMáxima_com_outra_aula - 0.55)`; (3) completude estrutural — fração de seções esperadas (fundamentação técnica, exemplos práticos, erros comuns, síntese) detectáveis por título tolerante no texto da aula.

#### Scenario: Aula sem sobreposição com nenhuma outra
- **WHEN** a maior similaridade Jaccard da aula com qualquer outra aula do curso é menor que 0.55
- **THEN** a penalidade de sobreposição é 1 (sem penalidade)

#### Scenario: Aula com todas as seções esperadas presentes
- **WHEN** o texto da aula contém títulos reconhecíveis para as 4 seções esperadas
- **THEN** a completude estrutural é 1

---

### Requirement: Julgamento pareado original × candidato
O sistema SHALL comparar a versão original e a versão candidata (revisada) de uma aula numa única chamada de LLM, obtendo os 5 critérios da rubrica para as duas versões no mesmo contexto. A chamada SHALL usar `response_format: json_object` e SHALL retornar os critérios de ambas as versões sem texto narrativo adicional.

#### Scenario: Candidato genuinamente melhor
- **WHEN** o candidato aborda melhor os critérios da rubrica que o original
- **THEN** o score composto do candidato é maior que o do original, refletindo a melhora real

#### Scenario: Candidato sem mudança substantiva
- **WHEN** o candidato é textualmente quase idêntico ao original (ex.: apenas pontuação ou uma citação adicionada)
- **THEN** os 5 critérios de ambas as versões ficam próximos, resultando em score composto próximo, sem ganho artificial
