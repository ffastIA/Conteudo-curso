## ADDED Requirements

### Requirement: Integração opcional e sem dependência nova
O sistema SHALL integrar com o Langfuse por módulo próprio usando `fetch` nativo, SHALL ficar desligado quando `LANGFUSE_ENABLED` não for verdadeiro ou as chaves não existirem, e SHALL ler as chaves apenas de variáveis de ambiente.

#### Scenario: Sem chaves
- **WHEN** `LANGFUSE_PUBLIC_KEY` ou `LANGFUSE_SECRET_KEY` não estão definidas
- **THEN** nenhuma requisição ao Langfuse é feita e a geração funciona normalmente

### Requirement: Falha do Langfuse não afeta a geração
O envio SHALL usar fila assíncrona em lote com timeout curto e flush no encerramento; erros do Langfuse SHALL gerar apenas aviso no log local e SHALL NOT interromper nem atrasar uma geração.

#### Scenario: Langfuse fora do ar
- **WHEN** o host do Langfuse não responde
- **THEN** a geração termina sem erro e sem atraso perceptível, e um aviso é registrado no log

#### Scenario: Encerramento do servidor
- **WHEN** o processo recebe sinal de encerramento com eventos na fila
- **THEN** a fila é esvaziada com timeout curto antes de sair

### Requirement: Modelo de rastreamento
O sistema SHALL criar um trace por operação do usuário com `sessionId` igual à sessão do projeto e `traceId` igual ao id da requisição, spans por etapa/módulo/aula/seção, e uma `generation` por chamada à OpenAI contendo modelo, parâmetros, usage, `finish_reason`, latência, tentativas e custo. Chamadas externas não-LLM SHALL virar spans com status e duração.

#### Scenario: Chamada OpenAI registrada
- **WHEN** qualquer chamada à OpenAI é concluída
- **THEN** uma `generation` com tokens, custo e `finish_reason` é enfileirada

#### Scenario: Chamada Gamma ou HeyGen
- **WHEN** uma chamada ao Gamma ou HeyGen é concluída
- **THEN** um span com status e duração é enfileirado

### Requirement: Ponto único de instrumentação
Todas as chamadas à OpenAI, incluindo pesquisa web e continuações, SHALL passar pelo wrapper de instrumentação, e um teste estático SHALL falhar quando houver chamada fora dele.

#### Scenario: Chamada fora do wrapper
- **WHEN** o código contém `openai.chat.completions.create` ou `openai.responses.create` fora do wrapper
- **THEN** o teste estático falha

### Requirement: Privacidade e captura
O modo `LANGFUSE_CAPTURE=metadados` (padrão) SHALL enviar apenas tamanhos, tokens, custo e ids, sem texto de prompts ou respostas. Em qualquer modo, e-mails e tokens SHALL ser mascarados e chaves, cookies, caminhos de pastas do usuário e conteúdo de `.env` SHALL NOT ser enviados.

#### Scenario: Modo metadados
- **WHEN** uma generation é enfileirada em modo `metadados`
- **THEN** o payload não contém o texto do prompt nem da resposta

#### Scenario: Segredos no texto
- **WHEN** o texto capturado contém e-mail ou token
- **THEN** o payload contém o valor mascarado

### Requirement: Custo e scores
O app SHALL calcular o custo com tabela de preços configurável, coincidente com o calculado a partir do `usage`, e SHALL enviar como scores do trace as notas por critério, componente determinístico, fundamentação em fontes, completude por seção e marcador de aula incompleta quando disponíveis.

#### Scenario: Custo coerente
- **WHEN** o custo é calculado a partir do `usage` de uma resposta
- **THEN** o valor do app coincide com o enviado à generation

### Requirement: Amostragem e visibilidade na interface
A amostragem SHALL ser configurável por `LANGFUSE_SAMPLE_RATE`, capturando sempre 100% das falhas e das aulas incompletas. Ao final de cada etapa a UI SHALL mostrar o custo real e, quando habilitado, o link do trace, e `geracao_log.json` SHALL guardar o `traceId`.

#### Scenario: Falha amostrada
- **WHEN** uma chamada falha com taxa de amostragem 0
- **THEN** a falha ainda é enviada ao Langfuse

#### Scenario: Fim de etapa
- **WHEN** uma etapa termina
- **THEN** o evento `done` inclui custo e, se habilitado, a URL do trace
