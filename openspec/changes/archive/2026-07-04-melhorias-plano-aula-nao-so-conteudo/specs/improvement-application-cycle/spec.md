## MODIFIED Requirements

### Requirement: Realinhamento do plano de aula após aplicação de melhorias
Ao final do ciclo de aplicação de melhorias, o sistema SHALL atualizar automaticamente, no plano de aula, a seção de cada aula cujo conteúdo foi efetivamente alterado (similaridade Jaccard ≤ 0.90 com a versão anterior), usando a `realinharPlanoAulaSkill` para refletir as novas atividades, recursos e sequência didática — mantendo objetivos, título e escopo da aula. A `realinharPlanoAulaSkill` SHALL receber também a lista de melhorias pedidas pelo revisor para aquela aula (`melhorias`, o mesmo dado já usado por `aplicarMelhoriasSkill`) e SHALL corrigir diretamente, na seção do plano, qualquer melhoria da lista que descreva uma atividade, dinâmica ou recurso presente no plano — não apenas sincronizar a seção ao conteúdo revisado. A atualização SHALL ser seccional (`replaceLessonBlock`), preservando intactas as seções das demais aulas, e persistida uma única vez em `plano_de_aula.txt` ao final da fase.

#### Scenario: Aula alterada tem a seção do plano realinhada
- **WHEN** o ciclo de melhorias altera o conteúdo da Aula 3 (similaridade ≤ 0.90) e conclui
- **THEN** a seção `# Aula 3` do plano de aula é atualizada para refletir o conteúdo melhorado, as seções das demais aulas permanecem byte a byte idênticas, e `sess.planoAula` + `plano_de_aula.txt` são atualizados com badge de origem `ia`

#### Scenario: Melhoria referente a uma atividade do plano é corrigida no plano
- **WHEN** uma melhoria da lista descreve uma atividade presente na seção do plano de aula da aula (ex.: "substituir a dinâmica presencial X por uma atividade assíncrona"), mesmo que essa atividade não conste no conteúdo da aula
- **THEN** `realinharPlanoAulaSkill` recebe essa melhoria e corrige a atividade correspondente na seção do plano; a atividade problemática deixa de constar em `plano_de_aula.txt` após o ciclo

#### Scenario: Aula pouco alterada é pulada
- **WHEN** o conteúdo de uma aula sai do ciclo com similaridade > 0.90
- **THEN** a seção correspondente do plano de aula NÃO é reescrita e o relatório registra a aula como "sem mudança relevante"

#### Scenario: Plano de aula de origem usuário não é sobrescrito
- **WHEN** o ciclo de melhorias conclui e `projeto.json.stages["plano_de_aula"].fonte === "usuario"`
- **THEN** nenhuma seção do plano é alterada e o relatório registra que o realinhamento automático foi pulado por o plano ser versão do usuário

#### Scenario: Falha no realinhamento não desfaz as melhorias
- **WHEN** a chamada de realinhamento de uma aula falha após as melhorias já persistidas
- **THEN** o ciclo termina com `done` (não `error`), o conteúdo melhorado permanece persistido e a falha é registrada via progress e no relatório
