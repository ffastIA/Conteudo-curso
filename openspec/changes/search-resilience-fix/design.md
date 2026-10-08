## Context

A change `search-fallback-timeout` (arquivada) implementou retry + fallback para a Etapa 2, mas deixou três defeitos: modelo depreciado, fallback sem timeout próprio e bug de string no prompt. Esta change corrige esses defeitos pontualmente.

## Goals / Non-Goals

**Goals:**
- Corrigir model name para `gpt-4o` (suporta `web_search_options` na API atual)
- Timeout de 30s no fallback via `combineSignals` + `makeAbortSignal`
- Prompt limpo em `pesquisaFallbackSkill`
- UX: mensagem de orientação pós-erro

**Non-Goals:**
- Não refatorar retry para outras etapas
- Não adicionar retry automático no frontend

## Decisions

- **D1**: `gpt-4o` em vez de `gpt-4o-search-preview` — modelo atual com suporte a `web_search_options`
- **D2**: `combineSignals(client.signal, makeAbortSignal(SEARCH_FALLBACK_TIMEOUT_MS))` — reutiliza helpers existentes, respeita desconexão do cliente E timeout
- **D3**: Reescrever campo `user` como concatenação de template literals limpos — sem fragmentos `' +\n    '`
- **D4**: `addLog(logPanel, '💡 ...')` no `onError` — aproveita sistema de log existente sem novo componente UI

## Risks / Trade-offs

- `gpt-4o` com `web_search_options` pode ter custo levemente maior → aceitável (pesquisa é uma vez por curso)
- `SEARCH_FALLBACK_TIMEOUT_MS` fixo em 30s → pode falhar em redes lentas funcionais → aceitável para o escopo
