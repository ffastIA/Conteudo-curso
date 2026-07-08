# Design: abortar-streams-desconexao

## Context

`streamSkillToClient` (server.js:1582-1656) é o funil de streaming de todas as etapas. O ramo streaming já possui um `AbortController` — usado só pelo timer de inatividade (`STALL_TIMEOUT_MS`, aborta stream *parado*, não cliente ausente). O ramo web-search usa `makeAbortSignal(ms)` (timeout puro). Os loops multi-aula (`/api/conteudo` :1684, `/api/aplicar-melhorias/confirmar` :2582) intercalam pausas de 4s e persistência por aula. O catch existente (:1713-1721) interpreta qualquer `APIUserAbortError` como timeout e emite evento de erro — com abort por desconexão isso mandaria erro para um socket morto e mascararia a causa no log. Fato de runtime: `send()` escreve em socket morto sem lançar, por isso hoje nada quebra — só desperdiça.

## Goals / Non-Goals

**Goals:**
- Desconexão do cliente → abort imediato da chamada OpenAI em curso e parada dos loops.
- Distinção explícita desconexão × timeout de inatividade.
- Compatibilidade: handlers que não passarem o contexto continuam com o comportamento atual.

**Non-Goals:**
- Retry/resume de gerações interrompidas (G05, change futura).
- Cancelamento iniciado pelo frontend (botão "cancelar") — o mecanismo serve de base, mas a UI fica fora.

## Decisions

1. **Detecção por `res.on('close')` + `writableEnded === false`**, encapsulada em `clientAbort(res)`. Alternativa considerada: `req.on('aborted')` — deprecado e não cobre todos os encerramentos; `close` em `res` é o sinal canônico no Node moderno. O check de `writableEnded` evita falso positivo no `close` normal pós-`end()`.
2. **Composição de signals com `AbortSignal.any` + fallback manual** (Node 18 não tem `any`; o repo declara Node 18+). Alternativa: trocar timeouts por checagens manuais — rejeitada, mexeria no comportamento de timeout existente.
3. **Parâmetro opcional em `streamSkillToClient` em vez de assinatura nova obrigatória** — migração incremental por handler, sem big-bang; chamadas não migradas preservam o comportamento atual byte a byte.
4. **Encerramento silencioso na desconexão** (log `console.warn`, `return` limpo, sem evento de erro): não há ninguém para receber o evento, e re-lançar poluiria o log com stack traces de um caso esperado. Timeout real mantém o caminho de erro atual.
5. **Persistência parcial mantida**: aulas completas persistidas antes da desconexão ficam (o usuário pode recarregar o projeto e continuar); a aula interrompida não persiste (nunca gravar conteúdo truncado — coerente com a regra existente do ciclo de melhorias).

## Risks / Trade-offs

- [Abort disparar em `close` legítimo pós-stream] → check `writableEnded`; teste unitário dedicado para os dois lados.
- [Desconexão reportada como "Tempo limite excedido" (ou o inverso)] → ponto de revisão explícito; a distinção usa `client.disconnected`, não a classe do erro.
- [Teste de integração de desconexão flaky (timing)] → fallback definido: teste direto de `streamSkillToClient` com `res` fake + teste unitário dos helpers.
- [Ordem check→sleep→gerar nos loops] → o check de `disconnected` DEVE preceder a chamada cara; a posição relativa à pausa de 4s é indiferente ao custo.

## Migration Plan

Incremental e sempre-verde: (1) helpers + exports (nada usa ainda); (2) `streamSkillToClient` com parâmetro opcional (chamadas existentes inalteradas); (3) adoção handler a handler; (4) testes. Rollback: remover a criação do contexto nos handlers devolve o comportamento anterior.
