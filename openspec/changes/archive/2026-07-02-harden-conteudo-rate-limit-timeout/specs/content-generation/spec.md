## ADDED Requirements

### Requirement: Pausa entre chamadas sequenciais na geração de conteúdo por aula
O endpoint `GET /api/conteudo` SHALL aguardar um intervalo mínimo de 4 segundos entre o início da geração de uma aula e o início da geração da aula seguinte, a partir da segunda aula, para reduzir a probabilidade de disparar rate-limit da OpenAI em cursos com muitas aulas.

#### Scenario: Geração de curso com múltiplas aulas
- **WHEN** o endpoint `GET /api/conteudo` processa a aula de índice N (N > 0) no loop de geração
- **THEN** o sistema aguarda ao menos 4 segundos após o término do processamento da aula anterior antes de iniciar a chamada à OpenAI para a aula N

### Requirement: Timeout de inatividade em chamadas de streaming à OpenAI
A função `streamSkillToClient` SHALL abortar uma chamada de streaming à OpenAI se nenhum dado (`delta`) for recebido por um intervalo configurado de inatividade, evitando que o loop de geração fique preso indefinidamente aguardando uma chamada travada, sem impor um limite à duração total de uma geração legítima que continua recebendo dados normalmente.

#### Scenario: Chamada de streaming trava sem retornar dados
- **WHEN** uma chamada de streaming à OpenAI para gerar o conteúdo de uma aula para de emitir novos deltas por mais que o intervalo de inatividade configurado
- **THEN** a chamada é abortada
- **THEN** o sistema emite um evento SSE `error` identificando a aula afetada
- **THEN** a conexão SSE é encerrada, em vez de permanecer presa indefinidamente

#### Scenario: Geração longa porém ativa não é interrompida
- **WHEN** uma chamada de streaming continua recebendo deltas normalmente, mesmo que a geração completa da aula leve vários minutos
- **THEN** a chamada NÃO é abortada por timeout, desde que o intervalo entre deltas consecutivos permaneça abaixo do limite de inatividade configurado

### Requirement: Timeout em chamadas não-streaming de conteúdo com busca web
A função `streamSkillToClient` SHALL aplicar um timeout fixo às chamadas não-streaming (`web_search_options`) à OpenAI usadas na geração de conteúdo, análogo ao já aplicado em `tentarPesquisaWeb`, mas dimensionado para respostas mais longas.

#### Scenario: Chamada não-streaming trava
- **WHEN** uma chamada não-streaming à OpenAI com `web_search_options` não retorna dentro do timeout configurado
- **THEN** a chamada é abortada
- **THEN** o sistema emite um evento SSE `error` ao cliente
