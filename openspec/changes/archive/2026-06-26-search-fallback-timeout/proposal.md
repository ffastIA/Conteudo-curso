## Why

A Etapa 2 (Pesquisa Web) usa o modelo `gpt-4o-search-preview`, que depende de conectividade externa e pode falhar silenciosamente por timeout, indisponibilidade do serviço, rate limit ou erro de rede. Atualmente, qualquer falha encerra a etapa com uma mensagem de erro, bloqueando o progresso do usuário e exigindo retry manual, sem garantia de sucesso na segunda tentativa. Isso aborda parcialmente o **Gap G05** (sem retry em falhas OpenAI).

## What Changes

- Definir um timeout máximo de **45 segundos** para a chamada ao `gpt-4o-search-preview`; se excedido, a chamada é abortada
- Implementar **uma tentativa de retry** automático (mesma chamada, novo timeout de 30s) antes de acionar o fallback
- Implementar **fallback sem web search**: se retry também falhar, gerar o conteúdo de pesquisa usando `gpt-4o-mini` a partir do conhecimento do modelo + ementa + config do curso, sem chamada externa
- Notificar o usuário via evento SSE de progresso quando o fallback é acionado, deixando claro que a pesquisa foi gerada sem fontes da web
- Toda a sessão anterior (ementa, config, bncc, metodologia) permanece intacta — a falha não afeta dados já persistidos

## Capabilities

### New Capabilities

- `web-search-resilience`: timeout configurável, retry automático e fallback sem web-search para a Etapa 2

### Modified Capabilities

*(nenhuma)*

## Impact

- **`server.js`**: handler `GET /api/search` — adicionar timeout via `AbortSignal.timeout()`, lógica de retry e chamada de fallback ao `gpt-4o-mini` sem `web_search_options`
- **`skills.js`**: nova skill `pesquisaFallbackSkill` que gera conteúdo de pesquisa a partir do conhecimento do modelo, recebendo os mesmos parâmetros que `pesquisaWebSkill`
- **`public/app.js`**: nenhuma mudança necessária — o frontend já exibe eventos `progress` com mensagens arbitrárias
- Sem novas dependências npm

## Non-goals

- Não implementar retry genérico para outras etapas (Etapas 3–5 não usam web search)
- Não cachear resultados de pesquisa anteriores para reutilizar
- Não configurar o timeout via UI ou variável de ambiente (valor fixo no código por ora)
- Não tratar erros de autenticação da OpenAI (chave inválida) como caso de fallback — esses erros devem subir normalmente
