## ADDED Requirements

### Requirement: Logger estruturado em JSON
O sistema SHALL fornecer um logger próprio, sem dependência externa, que escreve uma linha JSON por evento com `nivel`, `etapa`, `aula`, `reqId` e `mensagem`, respeitando `LOG_LEVEL`, e SHALL substituir o uso de `console.log` solto nas rotas.

#### Scenario: Evento de geração
- **WHEN** uma aula termina de ser gerada
- **THEN** uma linha JSON com `nivel`, `etapa`, `aula` e `reqId` é escrita

#### Scenario: Nível de log
- **WHEN** `LOG_LEVEL=error`
- **THEN** eventos `info` e `warn` não são escritos

### Requirement: Id de requisição
Cada requisição SHALL receber um id único, usado no logger, nos eventos SSE e como `traceId` da observabilidade.

#### Scenario: Id propagado
- **WHEN** uma requisição SSE inicia
- **THEN** o mesmo `reqId` aparece nos logs e nos eventos enviados ao cliente

### Requirement: Segredos fora dos logs
O logger SHALL NOT escrever chaves de API, cookies nem conteúdo de `.env`.

#### Scenario: Erro com cabeçalho de autorização
- **WHEN** um erro contém o cabeçalho `Authorization`
- **THEN** o valor é omitido ou mascarado no log
