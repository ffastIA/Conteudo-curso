## ADDED Requirements

### Requirement: Skills retornam async generator com texto da OpenAI
Cada função de skill em `skills.js` SHALL retornar um async generator (símbolo `Symbol.asyncIterator`) quando chamada com parâmetros válidos, produzindo os chunks de texto recebidos da SDK OpenAI.

#### Scenario: skill emite chunks e finaliza
- **WHEN** `ementaSkill` é chamada com `{ nome, publico, carga, nivel, objetivos }` e o mock OpenAI retorna `"conteudo mock"`
- **THEN** iterar sobre o generator produz o texto e o generator finaliza sem lançar exceção

#### Scenario: skill propaga erro da OpenAI
- **WHEN** o mock OpenAI está configurado para lançar `new Error("API Error")`
- **THEN** iterar sobre o generator lança a mesma exceção

### Requirement: Skills aceitam parâmetros pedagógicos opcionais
As skills `ementaSkill`, `planoEnsinoSkill`, `planoAulaSkill`, `conteudoSkill` e `expansaoConteudoSkill` SHALL aceitar parâmetros opcionais `metodologia` e `bnccContext` sem lançar erro quando ausentes.

#### Scenario: chamada sem parâmetros pedagógicos
- **WHEN** `planoEnsinoSkill` é chamada sem `metodologia` e sem `bnccContext`
- **THEN** o generator é criado com sucesso e o mock OpenAI é chamado exatamente uma vez

#### Scenario: chamada com parâmetros pedagógicos
- **WHEN** `planoEnsinoSkill` é chamada com `metodologia: "ABP"` e `bnccContext: "## BNCC..."`
- **THEN** o generator é criado com sucesso e o mock OpenAI é chamado com os parâmetros injetados no prompt

### Requirement: metodologiaSkill retorna texto estruturado
`metodologiaSkill` SHALL retornar um async generator que produz conteúdo em markdown descrevendo a metodologia pedagógica.

#### Scenario: chamada com perfil completo do curso
- **WHEN** `metodologiaSkill` é chamada com `{ nome, publico, carga, nivel, proporcaoTeoricoPratico }`
- **THEN** o generator produz um ou mais chunks de texto sem lançar exceção

### Requirement: qualidadeSkill aceita contexto completo do curso
`qualidadeSkill` SHALL aceitar `{ config, ementa, planoEnsino, planoAula, resumosAulas, metodologia, bncc }` e retornar um async generator.

#### Scenario: chamada com todos os artefatos
- **WHEN** `qualidadeSkill` é chamada com config, ementa, plano de ensino e plano de aula preenchidos
- **THEN** o generator é criado com sucesso e o mock OpenAI é chamado com os dados do curso no prompt
