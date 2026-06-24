## ADDED Requirements

### Requirement: Derivação automática de metodologia pedagógica na Etapa 0
O sistema SHALL derivar automaticamente a metodologia pedagógica mais adequada ao perfil do curso via `metodologiaSkill` (gpt-4o-mini), sempre que a Etapa 0 for executada, independentemente da escolha BNCC.

#### Scenario: Derivação com perfil completo
- **WHEN** o usuário conclui a Etapa 0 (com ou sem BNCC)
- **THEN** o sistema chama `metodologiaSkill` com nome do curso, público-alvo, faixa etária inferida, nível (básico/intermediário/avançado), carga horária e proporção teórico/prático, e armazena o resultado em `session.metodologia`

#### Scenario: Resultado exibido ao usuário
- **WHEN** `metodologiaSkill` retorna
- **THEN** o frontend exibe a metodologia sugerida com justificativa pedagógica, permitindo ao usuário confirmar ou solicitar nova derivação antes de avançar

---

### Requirement: Metodologias pedagógicas consideradas pelo modelo
O prompt da `metodologiaSkill` SHALL instruir o modelo a selecionar e justificar a metodologia mais adequada dentre: Aprendizagem Baseada em Problemas (ABP), Instrução Direta, Sala de Aula Invertida, Andragogia, Aprendizagem por Projetos, Ensino Híbrido — usando a Taxonomia de Bloom como estrutura de objetivos de aprendizagem.

#### Scenario: Curso técnico para adultos com carga alta
- **WHEN** o perfil indica público adulto profissional, nível avançado e carga ≥ 40h
- **THEN** o modelo prioriza Andragogia ou ABP com justificativa baseada no perfil

#### Scenario: Curso introdutório para jovens com carga baixa
- **WHEN** o perfil indica público jovem, nível básico e carga ≤ 20h
- **THEN** o modelo prioriza Instrução Direta ou Sala Invertida com justificativa adequada ao perfil

---

### Requirement: Contexto pedagógico injetado em todas as skills de geração
O sistema SHALL passar `session.metodologia` como parâmetro `metodologia` para todas as skills existentes que geram conteúdo: `ementaSkill`, `planoEnsinoSkill`, `planoAulaSkill`, `conteudoSkill`, `expansaoConteudoSkill`.

#### Scenario: Skill recebe contexto de metodologia
- **WHEN** qualquer skill de geração é chamada e `session.metodologia` está preenchida
- **THEN** o prompt inclui bloco `## Metodologia Pedagógica` com a metodologia e instruções para o modelo observar e justificar as boas práticas didáticas correspondentes ao longo do conteúdo gerado

#### Scenario: Skill chamada sem metodologia definida
- **WHEN** `session.metodologia` está vazia ou nula
- **THEN** a skill se comporta exatamente como antes desta change, sem alteração de prompt

---

### Requirement: Proporção teórico/prático refletida no conteúdo gerado
O sistema SHALL incluir a proporção teórico/prático definida na Etapa 1 como restrição explícita nos prompts de `planoAulaSkill` e `conteudoSkill`, garantindo que o balanceamento seja observado na estrutura de cada aula.

#### Scenario: Proporção 70/30 definida
- **WHEN** `session.config.proporcaoTeoricoPratico = "70% teoria / 30% prática"` e `planoAulaSkill` é chamada
- **THEN** o prompt instrui o modelo a estruturar cada aula respeitando aproximadamente essa proporção, com atividades práticas claramente identificadas
