## ADDED Requirements

### Requirement: Validação e correção automática da quantidade de aulas planejadas
O sistema SHALL validar, após receber a resposta da IA em `planLessons()`, se a quantidade de aulas retornada corresponde a `numAulas` (calculado a partir de carga horária ÷ duração por aula). Em caso de divergência, o sistema SHALL tentar novamente uma única vez, informando à IA a quantidade incorreta da tentativa anterior e a quantidade exata exigida. O sistema SHALL usar o resultado mais próximo de `numAulas` entre as duas tentativas, sem interromper a geração do curso mesmo que a divergência persista após o retry.

#### Scenario: IA acerta a quantidade de primeira
- **WHEN** a primeira chamada a `planLessonsSkill` retorna exatamente `numAulas` aulas
- **THEN** o sistema usa esse resultado diretamente, sem tentar novamente

#### Scenario: IA erra a quantidade e acerta no retry
- **WHEN** a primeira chamada retorna uma quantidade diferente de `numAulas`
- **THEN** o sistema emite uma mensagem de progresso visível ao usuário indicando a nova tentativa
- **THEN** o sistema tenta novamente informando à IA o erro da tentativa anterior
- **THEN** se a segunda tentativa retornar exatamente `numAulas`, esse resultado é usado

#### Scenario: IA erra a quantidade nas duas tentativas
- **WHEN** tanto a primeira quanto a segunda chamada retornam uma quantidade diferente de `numAulas`
- **THEN** o sistema usa o resultado cuja quantidade está mais próxima de `numAulas`
- **THEN** o sistema registra um aviso no log do servidor com as quantidades obtidas em ambas as tentativas
- **THEN** a geração do curso prossegue normalmente com o resultado escolhido, sem interrupção
