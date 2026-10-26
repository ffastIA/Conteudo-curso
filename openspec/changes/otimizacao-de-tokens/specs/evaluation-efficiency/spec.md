## ADDED Requirements

### Requirement: Pré-checagem determinística antes da revisão
Antes de qualquer chamada de revisão de uma aula, o sistema SHALL consultar o estado da aula e rodar checagens locais sem chamar o modelo: bloco de código com cerca aberta, ids de fonte `[F#]` inexistentes no dossiê e contagem de palavras abaixo de metade da meta. Os achados SHALL entrar no relatório de revisão como alertas e SHALL NOT alterar a nota, que continua sendo 0,7 × rubrica + 0,3 × determinístico.

#### Scenario: Bloco de código aberto
- **WHEN** o texto de uma aula tem uma cerca de código aberta sem fechamento
- **THEN** a revisão registra o alerta antes da chamada ao modelo e a nota segue a fórmula existente

#### Scenario: Citação inexistente
- **WHEN** o texto cita `[F9]` e o dossiê só tem `F1` a `F6`
- **THEN** o relatório traz o alerta de id inválido

### Requirement: Aula incompleta ou pulada não é avaliada
O sistema SHALL NOT chamar o modelo para revisar nem pontuar uma aula marcada como `incompleta` ou pulada por decisão do usuário. A revisão SHALL registrar a aula como "não avaliada" com o motivo, SHALL mantê-la fora das médias e dos consolidados, e SHALL seguir para a aula seguinte. Aulas `completa` e `curta` continuam sendo avaliadas como antes.

#### Scenario: Aula incompleta no disjuntor
- **WHEN** a aula 5 ficou incompleta após o disparo do disjuntor e a revisão é executada
- **THEN** nenhuma chamada de revisão é feita para a aula 5, o relatório a lista como "não avaliada: aula incompleta" e a média das notas considera só as outras aulas

#### Scenario: Aula pulada
- **WHEN** o usuário pulou a aula 5
- **THEN** a revisão a trata do mesmo modo e a registra como "não avaliada: aula pulada"

#### Scenario: Aula curta continua avaliada
- **WHEN** a aula está marcada `curta`
- **THEN** a revisão a avalia normalmente
