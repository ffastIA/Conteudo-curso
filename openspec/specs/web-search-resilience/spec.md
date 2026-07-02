### Requirement: Timeout na chamada de pesquisa web
O sistema SHALL abortar a chamada ao modelo de pesquisa web se ela não concluir dentro de **45 segundos**. O timeout SHALL ser implementado via `AbortSignal` passado ao SDK OpenAI, cancelando efetivamente a requisição HTTP. O modelo de pesquisa web SHALL ser `gpt-4o-search-preview`, referenciado pela constante `MODEL_SEARCH` em `skills.js`.

#### Scenario: Timeout acionado na primeira tentativa
- **WHEN** a chamada ao modelo de pesquisa web demora mais de 45 segundos sem resposta
- **THEN** a chamada é abortada, um evento `progress` com mensagem de aviso é enviado via SSE e o sistema inicia o processo de retry automaticamente

#### Scenario: Chamada concluída dentro do timeout
- **WHEN** o modelo responde em menos de 45 segundos
- **THEN** o fluxo normal continua sem nenhuma alteração de comportamento

---

### Requirement: Retry automático após falha transitória
O sistema SHALL realizar automaticamente **uma segunda tentativa** da chamada ao modelo de pesquisa web (com timeout de 30 segundos) quando a primeira falhar por razão transitória. Erros transitórios incluem: timeout, erro de rede, rate limit (HTTP 429) e erros de servidor (HTTP ≥ 500). Erros de autenticação (HTTP 401) e requisição inválida (HTTP 400) NÃO devem acionar retry.

#### Scenario: Retry bem-sucedido após timeout
- **WHEN** a primeira chamada expira por timeout e a segunda tentativa retorna resultado dentro de 30 segundos
- **THEN** o fluxo de pesquisa conclui normalmente com os resultados da segunda tentativa

#### Scenario: Retry não acionado para erro de autenticação
- **WHEN** a chamada retorna HTTP 401 (chave inválida ou sem permissão)
- **THEN** o sistema envia um evento `error` via SSE imediatamente, sem retry, preservando os dados da sessão

#### Scenario: Retry não acionado para requisição inválida
- **WHEN** a chamada retorna HTTP 400
- **THEN** o sistema envia um evento `error` via SSE imediatamente, sem retry

---

### Requirement: Fallback sem web search após falha persistente
Se a primeira tentativa **e** o retry falharem por razão transitória, o sistema SHALL acionar um fallback que gera o conteúdo de pesquisa usando `gpt-4o-mini` sem web search, a partir do conhecimento do modelo e da ementa já gerada.

O fallback SHALL:
- Enviar um evento `progress` avisando o usuário antes de iniciar a geração
- Usar os mesmos parâmetros de contexto do curso (nome, nível, público, tópicos, ementa)
- Executar com timeout de **30 segundos** via `AbortSignal`
- Persistir o resultado com `persistStage` exatamente como a pesquisa normal
- Enviar `done` ao final — o frontend não distingue fallback de execução normal

#### Scenario: Fallback acionado após retry também falhar
- **WHEN** tanto a primeira tentativa quanto o retry da pesquisa web falham por razão transitória
- **THEN** o sistema envia `{ type: 'progress', message: '⚠️ Pesquisa web indisponível — gerando a partir do conhecimento do modelo...' }` e inicia a geração via `gpt-4o-mini` sem `web_search_options`

#### Scenario: Fallback conclui com sucesso
- **WHEN** o fallback com `gpt-4o-mini` gera o conteúdo
- **THEN** o texto é persistido em disco via `persistStage('pesquisa', ...)` e o evento `done` é enviado, permitindo que o usuário avance para a Etapa 3 normalmente

#### Scenario: Fallback também falha por timeout ou rede
- **WHEN** a chamada de fallback ao `gpt-4o-mini` excede 30 segundos ou falha com erro de rede
- **THEN** o sistema envia um evento `error` via SSE e encerra — sem loop infinito

#### Scenario: Nenhum site é listado no fallback
- **WHEN** o fallback é usado (sem web search)
- **THEN** nenhum evento `site` é enviado e `sitesCollected` fica vazio — o painel de fontes da web não exibe sites, o que é comportamento esperado

---

### Requirement: Dados anteriores preservados em caso de falha
Em qualquer cenário de falha na Etapa 2 (timeout, erro, fallback ou erro irrecuperável), os dados das etapas anteriores (ementa, config, bncc, metodologia) SHALL permanecer intactos na sessão e no disco. A falha na pesquisa web NÃO deve afetar o estado das etapas 0 e 1.

#### Scenario: Falha total na pesquisa — sessão anterior preservada
- **WHEN** a pesquisa web falha e o fallback também falha (erro inesperado no `gpt-4o-mini`)
- **THEN** o sistema envia um evento `error` via SSE, a sessão mantém `sess.ementa`, `sess.config`, `sess.bncc` e `sess.metodologia` com seus valores originais, e nenhum arquivo anterior é sobrescrito

---

### Requirement: Orientação ao usuário após falha total na pesquisa
Quando a Etapa 2 falha com evento `error` (fallback também falhou), o frontend SHALL exibir no log panel uma mensagem de orientação informando que a pesquisa pode ser tentada novamente ou pulada.

#### Scenario: Mensagem de orientação exibida após erro
- **WHEN** o evento `error` é recebido no SSE da Etapa 2 e o callback `onError` é chamado
- **THEN** o log panel exibe a mensagem `"💡 Tente novamente ou avance para a Etapa 3 — a pesquisa pode ser pulada."` após a mensagem de erro, e o botão "Pesquisar" é reabilitado

#### Scenario: Botão reabilitado após erro
- **WHEN** o evento `error` ou `onerror` é recebido no SSE da Etapa 2
- **THEN** `btnSearch` é reabilitado (`disabled = false`)
