## ADDED Requirements

### Requirement: Spinner do painel de log encerra ao receber o evento done
O painel de log de qualquer etapa consumida via SSE SHALL encerrar o indicador de carregamento (spinner) da última linha de progresso assim que o evento `done` for recebido, independentemente do texto da última mensagem de `progress` enviada pelo servidor. O sistema SHALL NOT depender de reconhecer um texto específico de mensagem de progresso (ex.: o literal `"Concluído"`) para encerrar o spinner.

#### Scenario: Última mensagem de progresso é descritiva, não literal
- **WHEN** uma rota SSE envia como última mensagem de `progress` um texto descritivo (ex.: `"Roteiro de avatar da aula 1 concluído"`, que não é o literal `"Concluído"`) seguido do evento `done`
- **THEN** o spinner da linha correspondente é removido e a linha marcada como concluída assim que o evento `done` chega, mesmo sem o texto bater com nenhum padrão reconhecido

#### Scenario: Última mensagem de progresso já é reconhecida como finalização
- **WHEN** uma rota SSE envia o literal `"Concluído"` (ou outro padrão já reconhecido, ex.: mensagens contendo "concluídos") como última mensagem de `progress`
- **THEN** o spinner já é encerrado nesse momento, e o evento `done` subsequente não duplica a linha de conclusão nem produz nenhum efeito visual adicional

#### Scenario: Nenhuma linha de progresso pendente ao receber done
- **WHEN** o evento `done` chega e não há nenhuma linha `.current` no painel de log
- **THEN** nenhuma alteração é feita (operação idempotente, sem erro)
