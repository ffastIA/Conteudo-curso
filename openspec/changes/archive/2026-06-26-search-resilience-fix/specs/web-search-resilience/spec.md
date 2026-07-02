## MODIFIED Requirements

### Requirement: Timeout na chamada de pesquisa web
O sistema SHALL abortar a chamada ao modelo de pesquisa web se ela não concluir dentro de **45 segundos**. O timeout SHALL ser implementado via `AbortSignal` passado ao SDK OpenAI, cancelando efetivamente a requisição HTTP. O modelo de pesquisa web SHALL ser `gpt-4o` (não `gpt-4o-search-preview`, que foi descontinuado), referenciado pela constante `MODEL_RESEARCH` em `skills.js`.

#### Scenario: Timeout acionado na primeira tentativa
- **WHEN** a chamada ao modelo de pesquisa web demora mais de 45 segundos sem resposta
- **THEN** a chamada é abortada, um evento `progress` com mensagem de aviso é enviado via SSE e o sistema inicia o processo de retry automaticamente

#### Scenario: Chamada concluída dentro do timeout
- **WHEN** o modelo responde em menos de 45 segundos
- **THEN** o fluxo normal continua sem nenhuma alteração de comportamento

---

### Requirement: Fallback sem web search após falha persistente
Se a primeira tentativa **e** o retry falharem por razão transitória, o sistema SHALL acionar um fallback que gera o conteúdo de pesquisa usando `gpt-4o-mini` sem web search, a partir do conhecimento do modelo e da ementa já gerada.

O fallback SHALL:
- Enviar um evento `progress` avisando o usuário antes de iniciar a geração
- Usar os mesmos parâmetros de contexto do curso (nome, nível, público, tópicos, ementa)
- Executar com timeout de **30 segundos** via `AbortSignal` (constante `SEARCH_FALLBACK_TIMEOUT_MS`)
- Persistir o resultado com `persistStage` exatamente como a pesquisa normal
- Enviar `done` ao final — o frontend não distingue fallback de execução normal
- Gerar prompt correto sem fragmentos de concatenação literais no texto

#### Scenario: Fallback acionado após retry também falhar
- **WHEN** tanto a primeira tentativa quanto o retry da pesquisa web falham por razão transitória
- **THEN** o sistema envia `{ type: 'progress', message: '⚠️ Pesquisa web indisponível — gerando a partir do conhecimento do modelo...' }` e inicia a geração via `gpt-4o-mini` sem `web_search_options`, com timeout de 30s

#### Scenario: Fallback conclui com sucesso
- **WHEN** o fallback com `gpt-4o-mini` gera o conteúdo dentro do timeout
- **THEN** o texto é persistido em disco via `persistStage('pesquisa', ...)` e o evento `done` é enviado, permitindo que o usuário avance para a Etapa 3 normalmente

#### Scenario: Fallback também falha por timeout ou rede
- **WHEN** a chamada de fallback ao `gpt-4o-mini` excede 30 segundos ou falha com erro de rede
- **THEN** o sistema envia um evento `error` via SSE e encerra — sem loop infinito

#### Scenario: Nenhum site é listado no fallback
- **WHEN** o fallback é usado (sem web search)
- **THEN** nenhum evento `site` é enviado e `sitesCollected` fica vazio

---

## ADDED Requirements

### Requirement: Orientação ao usuário após falha total na pesquisa
Quando a Etapa 2 falha com evento `error` (fallback também falhou), o frontend SHALL exibir no log panel uma mensagem de orientação informando que a pesquisa pode ser tentada novamente ou pulada.

#### Scenario: Mensagem de orientação exibida após erro
- **WHEN** o evento `error` é recebido no SSE da Etapa 2 e o callback `onError` é chamado
- **THEN** o log panel exibe a mensagem `"💡 Tente novamente ou avance para a Etapa 3 — a pesquisa pode ser pulada."` após a mensagem de erro, e o botão "Pesquisar" é reabilitado

#### Scenario: Botão reabilitado após erro
- **WHEN** o evento `error` ou `onerror` é recebido no SSE da Etapa 2
- **THEN** `btnSearch` é reabilitado (`disabled = false`) — comportamento já existente, mantido
