# rate-limit-handling Specification

## Purpose
TBD - created by archiving change geracao-retomavel. Update Purpose after archive.
## Requirements
### Requirement: Espera adaptativa em 429
O sistema SHALL tratar respostas 429 da OpenAI com o helper `comRateLimit`, que SHALL esperar o tempo do cabeçalho `retry-after` quando presente, ou backoff exponencial iniciando em 2 s com teto de 60 s quando ausente, e SHALL repetir a chamada até o número máximo de tentativas.

#### Scenario: 429 com retry-after
- **WHEN** a API responde 429 com `retry-after: 7`
- **THEN** o sistema espera 7 segundos e repete a chamada

#### Scenario: 429 sem retry-after
- **WHEN** a API responde 429 sem `retry-after`
- **THEN** o sistema espera 2 s, depois 4 s, 8 s e assim por diante, até o teto de 60 s

#### Scenario: Tentativas esgotadas
- **WHEN** o limite de tentativas é atingido
- **THEN** o erro 429 é propagado e a etapa emite evento `error` SSE

### Requirement: Repetição somente antes do primeiro token
O helper SHALL repetir a chamada apenas quando o 429 ocorrer antes de qualquer token enviado ao cliente, e SHALL NOT repetir erros que não sejam 429.

#### Scenario: Erro no meio do stream
- **WHEN** o erro ocorre após tokens já enviados ao cliente
- **THEN** a chamada não é repetida e o erro é propagado

#### Scenario: Erro 400
- **WHEN** a API responde 400
- **THEN** o helper não repete a chamada

### Requirement: Falhas transitórias com poucas tentativas
Como o cliente OpenAI usa `maxRetries: 0`, o helper SHALL repetir falhas transitórias (HTTP 5xx e erros de conexão) até 2 vezes com espera curta, e SHALL NOT repetir erros 4xx diferentes de 429.

#### Scenario: Erro 500 seguido de sucesso
- **WHEN** a API responde 500 e depois 200
- **THEN** a chamada é repetida uma vez e o resultado é devolvido

### Requirement: Espera visível e abortável
Durante a espera o sistema SHALL emitir eventos `progress` SSE informando o tempo restante, SHALL impedir que o stall timeout dispare e SHALL abortar a espera quando o cliente desconectar.

#### Scenario: Aviso durante a espera
- **WHEN** o helper inicia uma espera
- **THEN** um evento `progress` "aguardando limite da API" é enviado ao cliente

#### Scenario: Desconexão durante a espera
- **WHEN** o cliente desconecta enquanto o helper espera
- **THEN** a espera é abortada e nenhuma nova chamada é feita

### Requirement: Sem retry silencioso do SDK e sem pausa fixa
O cliente OpenAI SHALL ser criado com `maxRetries: 0`, e as pausas fixas de 4 s entre aulas em geração, aplicação de melhorias e realinhamento SHALL ser removidas depois de o helper estar aplicado nesses pontos.

#### Scenario: Aulas consecutivas sem limite atingido
- **WHEN** duas aulas são geradas em sequência sem 429
- **THEN** a segunda inicia imediatamente após a primeira, sem espera

### Requirement: Paralelismo controlado
O sistema SHALL aceitar `CONTEUDO_PARALELISMO` (padrão 1, máximo 2) para gerar até 2 aulas simultaneamente, mantendo o padrão sequencial.

#### Scenario: Padrão
- **WHEN** `CONTEUDO_PARALELISMO` não está definido
- **THEN** as aulas são geradas em sequência

#### Scenario: Valor acima do máximo
- **WHEN** `CONTEUDO_PARALELISMO=5`
- **THEN** o valor efetivo é 2

