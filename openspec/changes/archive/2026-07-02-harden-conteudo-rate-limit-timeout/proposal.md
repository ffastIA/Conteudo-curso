## Why

A geração de conteúdo técnico por aula (Etapa 5, `GET /api/conteudo`) dispara uma chamada sequencial à OpenAI por aula sem nenhuma pausa entre elas e sem timeout/`AbortSignal` nas chamadas, ao contrário da pesquisa web (Etapa 2) e da aplicação de melhorias (Etapa 6), que já têm esse hardening. Em cursos com muitas aulas isso expõe a Etapa 5 a rate-limit (429) da OpenAI — cujos retries automáticos (`maxRetries: 6`) podem ficar tentando silenciosamente por minutos sem nenhum evento SSE emitido ao cliente — e a chamadas presas no timeout padrão (bem mais longo) do SDK, travando o loop sequencial sem feedback ao usuário. Isso é o gap conhecido G05 (sem retry/timeout em falhas OpenAI) do projeto, ainda não fechado para esta etapa especificamente.

## What Changes

- Adicionar pausa de 4s entre aulas (a partir da segunda) no loop de `GET /api/conteudo` (`server.js`), replicando o padrão já usado e validado no ciclo de aplicação de melhorias (Etapa 6).
- Adicionar `{ signal: makeAbortSignal(timeoutMs) }` às duas chamadas `openai.chat.completions.create` dentro de `streamSkillToClient` (usada tanto pela variante com `web_search_options` quanto pela variante de streaming padrão), reaproveitando o helper `makeAbortSignal` já existente.
- Ao ocorrer abort por timeout, emitir um evento SSE `error` com mensagem clara para o cliente, permitindo que o usuário identifique a causa e tente novamente manualmente.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `content-generation`: a geração de conteúdo técnico por aula (`GET /api/conteudo`) passa a aplicar pausa entre chamadas sequenciais à OpenAI e timeout com sinalização explícita ao cliente em caso de chamada presa, em vez de depender apenas do timeout/retry padrão do SDK.

## Impact

- `server.js`: função `streamSkillToClient` (~linhas 787-831) — adicionar `signal` às duas chamadas `openai.chat.completions.create`.
- `server.js`: loop de `GET /api/conteudo` (~linhas 859-892) — adicionar pausa de 4s entre aulas.
- **Efeito colateral benéfico esperado:** `streamSkillToClient` também é usada por `GET /api/revisao-qualidade` (~linha 1373) e pelo ciclo de aplicação de melhorias (~linha 1568, Etapa 6). Como o timeout é adicionado na função compartilhada, essas duas chamadas passam a se beneficiar da mesma proteção contra chamada presa, sem nenhuma mudança de comportamento adicional exigida nelas. A ausência de pausa entre iterações em `GET /api/revisao-qualidade` (que, diferente de `/api/conteudo` e da Etapa 6, ainda não tem nenhuma pausa) permanece fora do escopo desta correção.
- Nenhuma mudança de contrato de API/SSE observável em operação normal (os tipos de evento existentes `progress`, `token`, `done`, `error` continuam os mesmos); em caso de timeout, o cliente passa a receber um `error` explícito em vez de a conexão travar sem feedback.
- Sem dependências externas novas; sem breaking changes.

## Non-goals

- Não implementar retry automático com backoff para a Etapa 5 (apenas timeout com falha explícita); um mecanismo de retry mais amplo fica para uma iteração futura do gap G05.
- Não alterar as Etapas 2 (pesquisa web) e 6 (aplicar melhorias), que já têm hardening equivalente.
- Não implementar o heartbeat/keepalive periódico em `sseHeaders` levantado como fator agravante na investigação — fica registrado como possível melhoria futura, fora do escopo mínimo desta correção (ver Open Questions em design.md).
- Não é parte desta correção o travamento do navegador client-side durante o streaming — esse é tratado separadamente pelo change `fix-sse-stream-render-freeze`.
