## Context

O handler `GET /api/search` em `server.js` faz uma chamada síncrona ao `gpt-4o-search-preview` sem nenhum timeout. Qualquer falha (timeout do SDK, erro de rede, rate limit, indisponibilidade do serviço) termina em `send(res, { type: 'error', ... })` e encerra a conexão SSE, bloqueando o usuário na Etapa 2. Os dados das etapas anteriores (ementa, config, bncc, metodologia) permanecem intactos na sessão — o problema é exclusivamente no caminho de erro da chamada ao modelo.

## Goals / Non-Goals

**Goals:**
- Abortar a chamada ao `gpt-4o-search-preview` se demorar mais de 45 s
- Fazer uma segunda tentativa automática (timeout de 30 s) antes de acionar o fallback
- Em caso de falha persistente, gerar o conteúdo de pesquisa sem web search usando `gpt-4o-mini`
- Avisar o usuário via evento SSE quando o fallback for acionado
- Preservar todos os dados anteriores da sessão em qualquer cenário de falha

**Non-Goals:**
- Retry para outras etapas do pipeline
- Timeout configurável via UI ou env var (constante no código)
- Cache de resultados de pesquisa entre sessões

## Decisions

### D1 — AbortSignal.timeout() + opção `signal` do SDK OpenAI

O SDK `openai` v4 aceita `{ signal: AbortSignal }` como opção de request. `AbortSignal.timeout(ms)` (Node.js 17.3+) cria um sinal que aborta automaticamente após `ms` milissegundos, sem precisar gerenciar `clearTimeout` manualmente. Ao ser abortado, a promise rejeita com `APIUserAbortError` (ou `AbortError`).

Alternativa considerada: `Promise.race([call, new Promise((_,rej) => setTimeout(rej, ms, new Error('timeout')))])` — mais verboso e sem cancelamento real da requisição HTTP.

### D2 — Retry apenas para erros transitórios

Erros que justificam retry: timeout/abort, erro de rede (`APIConnectionError`, `APITimeoutError`), rate limit (`RateLimitError` 429), erros de servidor (`InternalServerError`, status ≥ 500).

Erros que NÃO fazem retry e sobem diretamente: autenticação (`AuthenticationError` 401), requisição inválida (`BadRequestError` 400). Nesses casos o erro é sinal de configuração ou bug, não de instabilidade transitória.

Helper proposto:
```js
function isRetriable(err) {
  if (err instanceof OpenAI.AuthenticationError) return false;
  if (err instanceof OpenAI.BadRequestError) return false;
  return true;
}
```

### D3 — Fallback como skill separada em skills.js

`pesquisaFallbackSkill({ nome, nivel, publico, topicos, ementa })` — mesma assinatura relevante de `pesquisaWebSkill`, mas retorna `model: 'gpt-4o-mini'` sem `web_search_options`. O prompt instrui o modelo a sintetizar a partir do seu conhecimento e da ementa fornecida. O resultado segue exatamente o mesmo fluxo de persistência (`persistStage`) — o único campo diferente é a ausência de `sitesCollected`.

### D4 — Constantes no topo de server.js

```js
const SEARCH_TIMEOUT_MS = 45_000;
const SEARCH_RETRY_TIMEOUT_MS = 30_000;
```

Fácil de localizar e ajustar sem tocar na lógica.

### D5 — Notificação ao usuário via evento progress

Ao acionar o fallback, enviar:
```
{ type: 'progress', message: '⚠️ Pesquisa web indisponível — gerando a partir do conhecimento do modelo...' }
```
O frontend já exibe todos os eventos `progress` — nenhuma mudança no cliente.

## Risks / Trade-offs

- **Qualidade do fallback**: O conteúdo gerado sem web search pode ser genérico ou desatualizado. Mitigation: o prompt do fallback deixa explícito ao modelo que não há fontes externas e pede síntese baseada na ementa; o aviso ao usuário na UI torna a diferença transparente.
- **Tempo total aumentado**: Com retry, o usuário pode esperar até ~75 s antes de o fallback ser acionado. Mitigation: o timeout total é curto o suficiente para não parecer travamento; os eventos `progress` mantêm feedback contínuo.
- **AbortSignal.timeout não disponível em Node < 17.3**: O projeto roda em Node.js atual (verificar versão). Fallback: `AbortController` + `setTimeout` manual se necessário.

## Migration Plan

Deploy simples — sem migração de dados. Rollback: reverter as alterações em `server.js` e `skills.js`.
