## Purpose

Abortar a chamada OpenAI em andamento e interromper loops de geração
multi-aula quando o cliente desconecta de uma rota SSE antes do fim do
stream, distinguindo esse encerramento silencioso do erro de timeout por
inatividade.

## Requirements

### Requirement: Desconexão do cliente aborta a chamada OpenAI em curso
Quando o cliente de uma rota SSE desconecta antes do fim do stream (evento `close` da resposta com `writableEnded === false`), o servidor SHALL abortar a chamada OpenAI em andamento via `AbortSignal`.

#### Scenario: Desconexão no meio do streaming
- **WHEN** o cliente encerra a conexão durante um `GET /api/plano-ensino` em streaming
- **THEN** o signal passado à chamada `openai.chat.completions.create` em curso é abortado

#### Scenario: Encerramento normal não aborta
- **WHEN** o stream completa e o servidor chama `res.end()` antes do evento `close`
- **THEN** nenhum abort é disparado

### Requirement: Loops multi-aula param na desconexão
Nos endpoints que geram múltiplas aulas em sequência (`/api/conteudo`, `/api/aplicar-melhorias/confirmar`), o servidor SHALL verificar a desconexão antes de iniciar cada aula e SHALL interromper o loop se o cliente desconectou. Aulas já concluídas e persistidas SHALL permanecer em disco; a aula interrompida SHALL NOT ser persistida.

#### Scenario: Refresh durante a geração da aula 2 de 5
- **WHEN** o cliente desconecta enquanto a aula 2 é gerada
- **THEN** a chamada da aula 2 é abortada, as aulas 3–5 não são iniciadas, e apenas a aula 1 permanece persistida

### Requirement: Desconexão encerra silenciosamente; timeout mantém o erro
Um abort causado por desconexão SHALL encerrar o handler com registro em log do servidor e sem emissão de evento SSE de erro. Um abort causado pelo timer de inatividade (`STALL_TIMEOUT_MS`) SHALL manter o comportamento atual (evento de erro de tempo limite ao cliente).

#### Scenario: Abort por desconexão
- **WHEN** a chamada OpenAI lança erro de abort e a desconexão do cliente foi detectada
- **THEN** o servidor registra aviso em log e encerra o handler sem enviar evento `error`

#### Scenario: Abort por inatividade com cliente conectado
- **WHEN** o timer de inatividade aborta o stream com o cliente ainda conectado
- **THEN** o cliente recebe o evento `error` de tempo limite, como hoje
