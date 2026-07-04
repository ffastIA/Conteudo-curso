## ADDED Requirements

### Requirement: Realinhamento do plano de aula após aplicação de melhorias
Ao final do ciclo de aplicação de melhorias, o sistema SHALL atualizar automaticamente, no plano de aula, a seção de cada aula cujo conteúdo foi efetivamente alterado (similaridade Jaccard ≤ 0.90 com a versão anterior), usando a `realinharPlanoAulaSkill` para refletir as novas atividades, recursos e sequência didática — mantendo objetivos, título e escopo da aula. A atualização SHALL ser seccional (`replaceLessonBlock`), preservando intactas as seções das demais aulas, e persistida uma única vez em `plano_de_aula.txt` ao final da fase.

#### Scenario: Aula alterada tem a seção do plano realinhada
- **WHEN** o ciclo de melhorias altera o conteúdo da Aula 3 (similaridade ≤ 0.90) e conclui
- **THEN** a seção `# Aula 3` do plano de aula é atualizada para refletir o conteúdo melhorado, as seções das demais aulas permanecem byte a byte idênticas, e `sess.planoAula` + `plano_de_aula.txt` são atualizados com badge de origem `ia`

#### Scenario: Aula pouco alterada é pulada
- **WHEN** o conteúdo de uma aula sai do ciclo com similaridade > 0.90
- **THEN** a seção correspondente do plano de aula NÃO é reescrita e o relatório registra a aula como "sem mudança relevante"

#### Scenario: Plano de aula de origem usuário não é sobrescrito
- **WHEN** o ciclo de melhorias conclui e `projeto.json.stages["plano_de_aula"].fonte === "usuario"`
- **THEN** nenhuma seção do plano é alterada e o relatório registra que o realinhamento automático foi pulado por o plano ser versão do usuário

#### Scenario: Falha no realinhamento não desfaz as melhorias
- **WHEN** a chamada de realinhamento de uma aula falha após as melhorias já persistidas
- **THEN** o ciclo termina com `done` (não `error`), o conteúdo melhorado permanece persistido e a falha é registrada via progress e no relatório

---

### Requirement: Sinalização de escopo para ementa e plano de ensino
O realinhamento SHALL NOT alterar a ementa nem o plano de ensino. A `realinharPlanoAulaSkill` SHALL receber ementa e módulos do plano de ensino como referência e sinalizar extrapolações de escopo do conteúdo melhorado em linhas com o prefixo exato `> ⚠️ ALERTA DE ESCOPO:`; o sistema SHALL extrair essas linhas (excluindo-as do plano persistido) e agregá-las à seção `## Realinhamento de Planos` do relatório `melhorias_aplicadas_<timestamp>.docx`.

#### Scenario: Melhoria extrapola o escopo da ementa
- **WHEN** o conteúdo melhorado de uma aula passa a abordar tema não previsto na ementa/módulos do plano de ensino
- **THEN** o relatório de melhorias inclui o alerta de escopo identificando a aula e o tema, e ementa/plano de ensino permanecem inalterados

#### Scenario: Sem extrapolação de escopo
- **WHEN** as melhorias se mantêm dentro do escopo da ementa e do plano de ensino
- **THEN** a seção de realinhamento do relatório não contém alertas de escopo e nenhuma linha de alerta aparece no plano de aula persistido

#### Scenario: Coerência restaurada verificada pela revisão seguinte
- **WHEN** uma nova revisão de qualidade é executada após um ciclo de melhorias com realinhamento
- **THEN** a seção "Compatibilidade com o Plano de Aula" não aponta descompasso causado pelo ciclo anterior (plano e conteúdo coerentes)
