## Why

Não há estimativa de custo antes das etapas pesadas (Gap G08) nem logging estruturado (Gap G06): o app usa `console.log` solto. Com pesquisa por módulo, geração por seções e avaliação map-reduce, o número de chamadas cresce e o usuário precisa saber custo e tempo antes de iniciar (achado A7).

## What Changes

- Estimativa de tokens e custo antes de cada etapa pesada (pesquisa por módulo, conteúdo, revisão), exibida na UI.
- Orçamento opcional por projeto (`ORCAMENTO_USD`) com teto e disjuntor, usando o mesmo `usage` coletado pela instrumentação.
- Logger estruturado em JSON (função própria, sem dependência) com nível, etapa, aula e id da requisição, substituindo `console.log` solto.
- Integração com `observabilidade-langfuse`: app e painel usam os mesmos números de `usage`.

## Capabilities

### New Capabilities
- `cost-estimation`: estimativa prévia, soma por projeto e trava de orçamento.
- `structured-logging`: logs JSON com contexto de requisição.

### Modified Capabilities
*(nenhuma)*

## Impact

- **`logger.js`** (novo), **`server.js`** (substituir `console.*`, middleware de id da requisição, estimativas), **`config/precos-modelos.json`** (compartilhado com Langfuse), **`public/app.js`** (exibir estimativa)
- Sem dependência npm nova.

## Non-goals

- Não cobrar nem faturar; é só estimativa e trava local.
- Não enviar logs a serviço externo (Langfuse cobre rastreamento).
- Não persistir logs em banco.

## Gaps resolvidos

G06 (logging estruturado) e G08 (estimativa de custo).
