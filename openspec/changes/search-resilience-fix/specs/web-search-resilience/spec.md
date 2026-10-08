## MODIFIED Requirements

### Requirement: Timeout na chamada de pesquisa web
O sistema SHALL usar o modelo `gpt-4o` (não `gpt-4o-search-preview`) com `web_search_options` para pesquisa web, referenciado pela constante `MODEL_RESEARCH` em `skills.js`. O timeout de 45s via `AbortSignal` permanece.

#### Scenario: Chamada concluída dentro do timeout
- **WHEN** o modelo responde em menos de 45 segundos
- **THEN** o fluxo normal continua sem alteração de comportamento

---

### Requirement: Fallback sem web search após falha persistente
O fallback SHALL executar com timeout de **30 segundos** via `combineSignals(client.signal, makeAbortSignal(SEARCH_FALLBACK_TIMEOUT_MS))`. O prompt do fallback SHALL ser gerado sem fragmentos literais de concatenação de string.

#### Scenario: Fallback acionado com timeout próprio
- **WHEN** pesquisa web falha e fallback é acionado
- **THEN** a chamada ao `gpt-4o-mini` tem timeout de 30s — se excedido, encerra com evento `error` sem loop

#### Scenario: Fallback conclui com sucesso
- **WHEN** o fallback gera conteúdo dentro do timeout
- **THEN** resultado é persistido e evento `done` é enviado

---

## ADDED Requirements

### Requirement: Orientação ao usuário após falha total na pesquisa
Após evento `error` na Etapa 2, o frontend SHALL exibir mensagem de orientação no log panel.

#### Scenario: Mensagem exibida após erro
- **WHEN** `onError` é chamado no SSE da Etapa 2
- **THEN** log panel exibe `"💡 Tente novamente ou avance para a Etapa 3 — a pesquisa pode ser pulada."` e `btnSearch` é reabilitado
