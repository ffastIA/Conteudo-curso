# Tasks: erros-sse-visiveis

> Referência detalhada (excertos, comandos de verificação, STOP conditions):
> `plans/001-erros-sse-visiveis.md`

## 1. Helper SSE

- [x] 1.1 Adicionar `sseError(res, message)` em `server.js` logo após `send` (~linha 818): `sseHeaders(res)` + `send(res, {type:'error', message})` + `res.end()`

## 2. Conversão das recusas

- [x] 2.1 Substituir `return res.status(400).json({error: ...})` por `return sseError(res, ...)` em `server.js` nas rotas `GET /api/qualidade` (:991) e `GET /api/ppc` (:1048), preservando as mensagens
- [x] 2.2 Idem em `GET /api/slides` (:1159 e :1162)
- [x] 2.3 Idem em `GET /api/revisao-qualidade` (:2260) e `GET /api/aplicar-melhorias/confirmar` (:2533)
- [x] 2.4 Conferir que nenhum `status(400)` de rota POST foi tocado: `grep -n "status(400)" server.js` mantém os sites de POST listados no plano

## 3. Testes

- [x] 3.1 Adicionar em `tests/integration/sse.test.js` o describe "pré-condições SSE" com 3 casos (qualidade, revisao-qualidade, slides): status 200, `text/event-stream`, evento `"type":"error"` com a mensagem correta
- [x] 3.2 Rodar `npm test` — 13 suites verdes, 3+ testes novos passando
