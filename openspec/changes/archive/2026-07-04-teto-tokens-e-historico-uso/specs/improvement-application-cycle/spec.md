## ADDED Requirements

### Requirement: Proteção contra persistência de respostas truncadas
Na aplicação de melhorias, uma resposta SHALL ser considerada incompleta quando `finish_reason === 'length'` OU quando não contiver a seção obrigatória `### Melhorias Aplicadas` (`isRespostaMelhoriasCompleta`). Para resposta incompleta, o sistema SHALL fazer **uma** tentativa de continuação (mesma skill, resposta parcial encadeada como mensagem `assistant`, instrução de continuar exatamente de onde parou sem repetir). Se ainda incompleta, o sistema SHALL preservar o conteúdo anterior da aula (sem persistir o truncado), emitir aviso SSE, registrar no relatório de melhorias e excluir a aula do realinhamento de planos. O console SHALL registrar `finish_reason` e tokens de completion por aula.

#### Scenario: Corte recuperado por continuação
- **WHEN** a resposta de uma aula termina com `finish_reason: length` e a continuação conclui o texto com a seção `### Melhorias Aplicadas`
- **THEN** o texto final (parcial + continuação) é persistido normalmente e o fluxo segue para a próxima aula

#### Scenario: Continuação insuficiente preserva o conteúdo anterior
- **WHEN** mesmo após a continuação a resposta permanece incompleta
- **THEN** `aulaNN_conteudo.txt` e `sess.conteudoPorAula` mantêm a versão anterior íntegra, o cliente recebe `warning`, o relatório registra "melhorias NÃO aplicadas nesta aula" e a aula não realinha o plano

#### Scenario: Resposta sem a seção obrigatória é tratada como incompleta
- **WHEN** a resposta termina com `finish_reason: stop` mas sem `### Melhorias Aplicadas`
- **THEN** o sistema aciona a continuação como se fosse corte por tokens

#### Scenario: Diagnóstico por aula
- **WHEN** cada aula é processada no ciclo de melhorias
- **THEN** o console registra `[melhorias] aula N: finish=<reason> tokens=<completion_tokens>`
