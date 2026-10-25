## ADDED Requirements

### Requirement: Atributos de trace em todos os spans
Com o Langfuse habilitado, o sistema SHALL incluir em **cada** span OTLP enviado (span raiz, `generation` e spans filhos) os atributos de trace `langfuse.trace.name`, `langfuse.session.id`, `langfuse.trace.tags`, `langfuse.trace.metadata.etapa`, `langfuse.environment` e `langfuse.release`, com valores idênticos aos do span raiz do mesmo trace. O atributo `langfuse.session.id` SHALL ser omitido quando não houver sessão, e nunca enviado vazio.

#### Scenario: Generation filha com sessão e nome do trace
- **WHEN** a ementa é gerada em `POST /api/metodologia/confirmar` com o curso "Teste Langfuse" e a observabilidade habilitada
- **THEN** a `generation` `ementa.gerar` enviada leva `langfuse.session.id = "teste-langfuse"`, `langfuse.trace.name = "metodologia_confirmar"` e `langfuse.trace.metadata.etapa = "metodologia_confirmar"`

#### Scenario: Span não-LLM com os mesmos atributos
- **WHEN** uma chamada ao HeyGen ou ao Gamma gera um span filho
- **THEN** esse span leva os mesmos `langfuse.session.id`, `langfuse.trace.name`, `langfuse.trace.tags`, `langfuse.environment` e `langfuse.release` do span raiz

#### Scenario: Raiz e filhos coincidem
- **WHEN** um trace com um span raiz e três `generation` é enviado
- **THEN** os quatro spans têm exatamente os mesmos valores para os seis atributos de trace

#### Scenario: Sem sessão
- **WHEN** a requisição não tem cookie de sessão nem curso nomeado
- **THEN** nenhum span do trace leva `langfuse.session.id`, e o envio continua normalmente

### Requirement: Tags como array
O sistema SHALL enviar `langfuse.trace.tags` como array OTLP de strings (`arrayValue`), e não como texto serializado. As tags SHALL ser `etapa:<etapa>` e `captura:<metadados|completo>`. Objetos continuam sendo serializados como JSON, e arrays vazios SHALL ser omitidos.

#### Scenario: Tags no corpo OTLP
- **WHEN** um span é montado com `LANGFUSE_CAPTURE=metadados` na etapa `search`
- **THEN** o atributo `langfuse.trace.tags` do corpo tem `arrayValue` com os valores `etapa:search` e `captura:metadados`

#### Scenario: Objeto continua JSON
- **WHEN** um atributo recebe um objeto (por exemplo parâmetros do modelo)
- **THEN** ele é enviado como `stringValue` com o JSON, sem alteração em relação ao comportamento atual

### Requirement: Valores só conhecidos ao final ficam só no span raiz
O sistema SHALL NOT reenviar nem atualizar um span já exportado. `langfuse.trace.metadata.tokens_total`, `langfuse.trace.metadata.custo_usd` e os metadados definidos por `definirMetadadoTrace` (como `custo_heygen_usd`) SHALL ser enviados somente no span raiz, no fechamento da resposta.

#### Scenario: Nenhum span é enviado duas vezes
- **WHEN** uma geração com várias `generation` termina e o contexto é finalizado
- **THEN** cada `spanId` aparece uma única vez no conjunto de lotes enviados ao Langfuse

#### Scenario: Metadado final só no raiz
- **WHEN** o consumo do HeyGen é apurado ao fim do vídeo
- **THEN** `langfuse.trace.metadata.custo_heygen_usd` está no span raiz e não nos spans filhos

### Requirement: Ambiente e release
O sistema SHALL enviar `langfuse.environment` com o valor de `LANGFUSE_ENVIRONMENT` quando definido e válido (minúsculas, dígitos, `-` e `_`, até 40 caracteres, sem começar por `langfuse`), e `default` caso contrário. SHALL enviar `langfuse.release` com a versão do `package.json`. Valor inválido de ambiente SHALL gerar um único aviso no log e nunca impedir o envio.

#### Scenario: Ambiente configurado
- **WHEN** `LANGFUSE_ENVIRONMENT=desenvolvimento`
- **THEN** todos os spans levam `langfuse.environment = "desenvolvimento"`

#### Scenario: Ambiente inválido
- **WHEN** `LANGFUSE_ENVIRONMENT=Langfuse Prod`
- **THEN** os spans levam `langfuse.environment = "default"` e o log registra um aviso, uma única vez

#### Scenario: Ambiente da suíte de testes
- **WHEN** a suíte liga o Langfuse com `fetch` simulado
- **THEN** o ambiente usado é `teste`, nunca o do `.env` do desenvolvedor

#### Scenario: Release
- **WHEN** o app envia um span
- **THEN** `langfuse.release` é igual ao campo `version` do `package.json`

### Requirement: Dados que nunca são enviados como atributo de trace
O sistema SHALL NOT enviar `langfuse.user.id` nem `user.id`, `langfuse.trace.input` ou `langfuse.trace.output`. Nenhum atributo de trace SHALL conter e-mail, nome de usuário, caminho de pasta do usuário, cookie, chave de API ou conteúdo do `.env`, independentemente de `LANGFUSE_CAPTURE`. Valores textuais de atributos de trace SHALL passar pelo mascaramento já existente.

#### Scenario: Nome do curso com caminho
- **WHEN** o nome do curso contém um caminho de pasta ou um e-mail
- **THEN** `langfuse.session.id` é o slug do nome sem esses trechos, e o valor mascarado nunca contém caminho ou e-mail

#### Scenario: Sem identificação de usuário
- **WHEN** qualquer span é enviado
- **THEN** o corpo OTLP não contém `langfuse.user.id`, `user.id`, `langfuse.trace.input` nem `langfuse.trace.output`

### Requirement: Scores ancorados na observação raiz
O sistema SHALL enviar cada score com `traceId` e com `observationId` igual ao id do span raiz do trace. Se o Langfuse rejeitar o score por causa de `observationId`, o sistema SHALL reenviá-lo uma vez somente com `traceId` e registrar o fato como aviso.

#### Scenario: Score com observationId
- **WHEN** a nota `heygen_consumo_usd` é registrada num trace com span raiz `a1b2c3d4e5f60718`
- **THEN** o corpo de `POST /api/public/scores` tem `traceId` do trace e `observationId = "a1b2c3d4e5f60718"`

#### Scenario: Rejeição com observationId
- **WHEN** o Langfuse responde HTTP 4xx ao score com `observationId`
- **THEN** o sistema reenvia o score só com `traceId` e a geração não é afetada

### Requirement: Link do trace válido no Langfuse v4
O sistema SHALL devolver um link de trace que abra o trace no Langfuse v4 em uso. Se o formato `{host}/trace/{traceId}` não resolver, o sistema SHALL usar `{host}/project/{projectId}/traces/{traceId}`, obtendo o `projectId` uma única vez por `GET /api/public/projects` e guardando-o em memória. Falha nessa consulta SHALL cair de volta para o formato anterior, sem bloquear a resposta.

#### Scenario: Link com projeto
- **WHEN** o Langfuse responde ao `GET /api/public/projects` com o projeto da chave
- **THEN** o link do trace inclui o id do projeto

#### Scenario: Consulta de projeto falha
- **WHEN** `GET /api/public/projects` falha por timeout ou HTTP 4xx
- **THEN** o link usa o formato `{host}/trace/{traceId}` e o evento `done` da etapa é enviado normalmente

### Requirement: Falha do Langfuse continua sem efeito sobre a geração
Nenhuma das mudanças desta capability SHALL interromper, atrasar ou alterar o resultado de uma geração. A montagem de atributos SHALL ser envolvida de modo que uma exceção nela seja engolida e registrada como aviso.

#### Scenario: Exceção ao montar atributos
- **WHEN** a montagem dos atributos de trace lança uma exceção
- **THEN** a chamada à OpenAI retorna normalmente ao chamador e o span é descartado com um aviso no log
