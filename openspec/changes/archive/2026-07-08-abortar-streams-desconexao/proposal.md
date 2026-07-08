# Proposal: abortar-streams-desconexao

## Why

Nenhum handler SSE observa a desconexão do cliente (`grep` confirma zero `req.on('close')`/`res.on('close')` em `server.js`): refresh ou aba fechada no meio de uma geração deixa o servidor consumindo o stream da OpenAI até o fim — e, nos loops multi-aula, seguindo para as aulas seguintes, pagando tokens e gravando arquivos para ninguém. Num curso de 10 aulas com teto de 10.000 tokens/aula, um refresh na aula 1 pode desperdiçar ~90.000 tokens de saída.

## What Changes

- Novos helpers em `server.js`: `clientAbort(res)` (detecta desconexão prematura via evento `close` com `writableEnded === false` e expõe um `AbortSignal`) e `combineSignals(a, b)` (compõe desconexão + timeout; `AbortSignal.any` com fallback Node 18).
- `streamSkillToClient` ganha parâmetro opcional `clientCtx` e aborta o stream OpenAI quando o cliente some (ambos os ramos: streaming e web-search).
- Todos os handlers SSE criam o contexto e propagam o signal; loops multi-aula (`/api/conteudo`, `/api/aplicar-melhorias/confirmar`) fazem `break` na desconexão; chamadas diretas (`/api/ppc`, continuações de melhorias, `images.generate` dos slides) usam signal combinado.
- Abort por desconexão encerra **silenciosamente** (log no servidor); abort por timeout mantém o comportamento atual (evento de erro ao cliente). Os dois casos passam a ser distinguidos.
- Aulas já concluídas antes da desconexão permanecem persistidas; a aula interrompida não é persistida.

## Non-goals

- Não implementar retry automático em falhas transitórias da OpenAI (**Gap G05** — change futura; esta infraestrutura de signals é pré-requisito natural dela).
- Não alterar o timer de inatividade (`STALL_TIMEOUT_MS`) nem seu comportamento.
- Não mudar o contrato de eventos SSE com o frontend.
- Não tocar na lógica de continuação/truncamento das melhorias (só o signal das chamadas).

## Capabilities

### New Capabilities
- `sse-client-disconnect`: comportamento do servidor quando o cliente desconecta de uma rota SSE em andamento — abort das chamadas OpenAI, interrupção de loops multi-aula, persistência parcial consistente e encerramento silencioso.

### Modified Capabilities

(vazio — `content-generation` e `improvement-application-cycle` mantêm seus requisitos; o novo comportamento na desconexão é coberto integralmente pela capability nova)

## Impact

- **Código**: `server.js` (helpers + `streamSkillToClient` + ~10 handlers SSE), `tests/unit/client-abort.test.js` (novo), `tests/integration/sse.test.js`.
- **Custo**: redução direta de gasto de tokens em gerações abandonadas.
- **Dependências**: nenhuma nova. **Depende da change** `baseline-verificacao-testes` (helpers de mock `__lastOptions` e `APIUserAbortError`).
- **Referência detalhada**: `plans/003-abortar-streams-em-desconexao.md`.
