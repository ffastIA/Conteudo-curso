## Context

`addUsage(usage, sess)` já acumula tokens por sessão. Não há tabela de preços nem id de requisição. O logger atual é `console.log/warn/error` com prefixos manuais como `[sse]`, `[stream]`, `[melhorias]`.

## Goals / Non-Goals

**Goals:** número antes da etapa; um único formato de log; trava opcional.
**Non-Goals:** exatidão centesimal da estimativa; dashboards.

## Decisions

- **D1**: `logger.js` exporta `log(nivel, msg, ctx)` escrevendo JSON em stdout/stderr; nível por `LOG_LEVEL` (padrão `info`); chaves e cookies nunca são logados.
- **D2**: middleware gera `req.id` (`crypto.randomUUID()`), usado no logger, em eventos SSE e como `traceId` do Langfuse.
- **D3**: estimativa = tokens do prompt (aproximação por caracteres) + saída esperada por tipo de etapa × preço da tabela; mostrada como faixa.
- **D4**: orçamento: se `custoAcumulado + estimativaDaChamada > ORCAMENTO_USD`, a etapa aborta com erro SSE claro; disjuntor após N falhas consecutivas.
- **D5**: tabela de preços única (`config/precos-modelos.json`) compartilhada com `observabilidade-langfuse`.

## Risks / Trade-offs

- Estimativa imprecisa → exibida como faixa e rotulada "estimativa".
- Migração de `console.*` pode quebrar testes que checam saída → substituir gradualmente, com `LOG_LEVEL=silent` nos testes.
