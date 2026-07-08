# Tasks: abortar-streams-desconexao

> Pré-requisito: change `baseline-verificacao-testes` aplicada (mock com
> `__lastOptions` e `APIUserAbortError`).
> Referência detalhada: `plans/003-abortar-streams-em-desconexao.md`

## 1. Helpers

- [x] 1.1 Em `server.js` (perto de `makeAbortSignal`, ~:47): adicionar `clientAbort(res)` (AbortController + `res.on('close')` com guarda `writableEnded`) e `combineSignals(a, b)` (`AbortSignal.any` com fallback Node 18); adicionar ambos ao `module.exports` (~:3289-3304)
- [x] 1.2 Rodar `npm test` — tudo verde (nada usa os helpers ainda)

## 2. streamSkillToClient

- [x] 2.1 Em `server.js:1582`: aceitar 5º parâmetro opcional `clientCtx`; no ramo streaming, encadear `clientCtx.signal` ao `controller` existente; no ramo web-search, combinar com o `makeAbortSignal` atual e sair cedo do loop de reemissão se `clientCtx?.disconnected`
- [x] 2.2 Rodar `npm test` — tudo verde (chamadas existentes não passam o parâmetro)

## 3. Adoção nos handlers SSE (server.js)

- [x] 3.1 `/api/conteudo` (:1661): criar `clientAbort(res)` após `sseHeaders`, passar às chamadas, `break` no topo do loop de aulas se desconectado, e distinguir desconexão×timeout no catch (:1713-1721) — desconexão = log + return silencioso
- [x] 3.2 `/api/aplicar-melhorias/confirmar` (:2528): idem, incluindo signal combinado nas chamadas de continuação (:2625-2646)
- [x] 3.3 `/api/ppc` (:1045): check de desconexão entre as 4 chamadas sequenciais + signal combinado em cada; `/api/slides` (:1155): idem incluindo `images.generate` (:2247); `/api/revisao-qualidade` (:2256): idem
- [x] 3.4 Handlers de etapa única (`/api/search`, `/api/plano-ensino`, `/api/plano-aula`, `/api/qualidade`, `/api/metodologia`): criar contexto, passar ao `streamSkillToClient`, abort silencioso no catch

## 4. Testes

- [x] 4.1 Criar `tests/unit/client-abort.test.js`: (a) `close` antes de `end` → aborta; (b) `close` após `writableEnded` → não aborta; (c) `combineSignals` aborta com qualquer um dos lados
- [x] 4.2 Em `tests/integration/sse.test.js`: destruir a conexão no meio de um stream e verificar `OpenAI.__lastOptions.signal.aborted === true` (fallback do plano se flaky: testar `streamSkillToClient` exportada com `res` fake)
- [x] 4.3 Rodar `npm test` e `npm run test:coverage` — ambos exit 0; conferir `grep -c "clientAbort(res)" server.js` ≥ 10
