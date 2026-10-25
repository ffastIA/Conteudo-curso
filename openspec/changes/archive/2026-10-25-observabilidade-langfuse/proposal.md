## Why

Custo, latência, tokens e qualidade das chamadas ao LLM só aparecem em logs soltos e não permitem comparar versões de prompt e de modelo (achado B10). Observabilidade deve existir antes das Fases 2 a 4 para que elas já nasçam instrumentadas e a linha de base possa ser comparada. Resolve parcialmente **G06** (logging) e a parte de medição de **G08** (custo), e cria o gap **G13** (observabilidade de LLM).

## What Changes

- Módulo próprio `observabilidade.js` com `fetch` nativo, sem SDK, enviando spans OTLP/HTTP JSON ao endpoint `/api/public/otel/v1/traces` do **Langfuse autohospedado** (a API de ingestão em lote `/api/public/ingestion` está obsoleta e indisponível no Langfuse v4 em `events_only`). Notas de qualidade vão por `POST /api/public/scores`.
- Variáveis: `LANGFUSE_ENABLED`, `LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_CAPTURE` (`completo|metadados`, padrão `metadados`), `LANGFUSE_SAMPLE_RATE`. Desligado sem chaves.
- Fila assíncrona em memória, envio em lote, timeout curto e flush no encerramento; falha do Langfuse nunca interrompe nem atrasa a geração.
- Um trace por operação do usuário (sessionId = sessão do projeto, traceId = id da requisição); spans por etapa/módulo/aula/seção; cada chamada OpenAI vira `generation` (modelo, parâmetros, usage, finish_reason, latência, tentativas, custo); chamadas Gamma/HeyGen/downloads viram spans.
- Wrapper único das chamadas à OpenAI (incluindo pesquisa web e continuações) com teste estático proibindo chamadas fora dele.
- Custo calculado pelo app com tabela de preços configurável; scores de qualidade enviados ao trace; dataset da linha de base.
- Privacidade: modo metadados padrão, mascaramento de e-mails/tokens, nunca enviar chaves, cookies ou caminhos de pasta.
- UI: custo real ao fim de cada etapa e link do trace; `geracao_log.json` guarda o `traceId`.

## Capabilities

### New Capabilities
- `llm-observability`: rastreamento, custo, scores e privacidade das chamadas ao LLM.

### Modified Capabilities
*(nenhuma)*

## Impact

- **`observabilidade.js`** (novo), **`config/precos-modelos.json`** (novo), **`server.js`** (wrapper `chamarOpenAI`, `fetchObs`, middleware de trace, `send`), **`.env.example`**, **`public/app.js`** (custo/link), **`docs/langfuse-autohospedado.md`**, **`scripts/langfuse-dataset.js`**
- Depende de `pesquisa-web-real` (busca centralizada). Sem dependência npm nova.

## Non-goals

- Langfuse não bloqueia gasto; a trava de orçamento fica em `custo-e-logs`.
- Não alterar o bind em `127.0.0.1`.
- Não usar o SDK do Langfuse (exceção só por decisão explícita registrada).
- Não instrumentar o frontend.
