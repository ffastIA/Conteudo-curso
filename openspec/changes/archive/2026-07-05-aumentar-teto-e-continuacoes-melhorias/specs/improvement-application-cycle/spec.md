## MODIFIED Requirements

### Requirement: Proteção contra persistência de respostas truncadas
Na aplicação de melhorias, uma resposta SHALL ser considerada incompleta quando `finish_reason === 'length'` OU quando não contiver a seção obrigatória `### Melhorias Aplicadas` (`isRespostaMelhoriasCompleta`). Para resposta incompleta, o sistema SHALL fazer **até duas** tentativas de continuação (mesma skill, texto acumulado até ali encadeado como mensagem `assistant`, instrução de continuar exatamente de onde parou sem repetir), reavaliando a completude após cada tentativa. Se ainda incompleta após as duas tentativas, o sistema SHALL preservar o conteúdo anterior da aula (sem persistir o truncado), emitir aviso SSE e registrar no relatório de melhorias. Uma aula com conteúdo preservado por truncamento SHALL permanecer elegível ao realinhamento de plano quando tiver melhorias pendentes para aquela aula, já que uma melhoria pode se referir exclusivamente ao plano de aula, independente do sucesso da revisão de conteúdo. O console SHALL registrar `finish_reason` e tokens de completion por aula e por tentativa.

#### Scenario: Corte recuperado na primeira continuação
- **WHEN** a resposta de uma aula termina com `finish_reason: length` e a primeira continuação conclui o texto com a seção `### Melhorias Aplicadas`
- **THEN** o texto final (parcial + continuação) é persistido normalmente e o fluxo segue para a próxima aula, sem uma segunda tentativa

#### Scenario: Corte recuperado somente na segunda continuação
- **WHEN** a primeira continuação também resulta em resposta incompleta
- **THEN** o sistema tenta uma segunda continuação, reenviando o texto acumulado (original + primeira continuação) como mensagem `assistant`
- **THEN** se a segunda continuação completar a resposta, o texto final é persistido normalmente

#### Scenario: Duas continuações insuficientes preservam o conteúdo anterior
- **WHEN** mesmo após as duas tentativas de continuação a resposta permanece incompleta
- **THEN** `aulaNN_conteudo.txt` e `sess.conteudoPorAula` mantêm a versão anterior íntegra, o cliente recebe `warning`, e o relatório registra "melhorias NÃO aplicadas nesta aula"

#### Scenario: Resposta sem a seção obrigatória é tratada como incompleta
- **WHEN** a resposta termina com `finish_reason: stop` mas sem `### Melhorias Aplicadas`
- **THEN** o sistema aciona a continuação como se fosse corte por tokens

#### Scenario: Aula truncada permanece elegível ao realinhamento de plano
- **WHEN** uma aula tem seu conteúdo preservado por truncamento (mesmo após as duas tentativas) mas possui melhorias pendentes
- **THEN** a aula participa normalmente da fase de realinhamento de plano, permitindo que melhorias referentes ao plano de aula sejam aplicadas mesmo sem sucesso na revisão do conteúdo

#### Scenario: Diagnóstico por aula e por tentativa
- **WHEN** cada aula é processada no ciclo de melhorias
- **THEN** o console registra `finish_reason` e tokens de completion da chamada inicial e de cada tentativa de continuação realizada
