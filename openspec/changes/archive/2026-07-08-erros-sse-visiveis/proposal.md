# Proposal: erros-sse-visiveis

## Why

Seis rotas SSE validam pré-condições com `res.status(400).json(...)`, mas o `EventSource` do navegador não lê corpo de resposta não-200 — só dispara `onerror`. O usuário nunca vê mensagens acionáveis como "Conclua a Etapa 5 antes de gerar o relatório de qualidade"; vê sempre o genérico "Erro de conexão com o servidor." e não sabe como prosseguir.

## What Changes

- Novo helper `sseError(res, message)` em `server.js`: abre o stream SSE, emite `{type:'error', message}` e encerra.
- As 6 recusas de pré-condição em rotas SSE passam a usar o helper (mensagens preservadas byte a byte): `GET /api/qualidade` (server.js:991), `GET /api/ppc` (:1048), `GET /api/slides` (:1159 e :1162), `GET /api/revisao-qualidade` (:2260), `GET /api/aplicar-melhorias/confirmar` (:2533).
- Nenhuma mudança no frontend — `public/app.js:196-201` já renderiza `type:'error'` corretamente.
- Rotas POST (consumidas por `fetch`) mantêm `status(400).json` — comportamento correto para elas.

## Non-goals

- Não alterar o texto das mensagens de pré-condição.
- Não tocar nos `status(400)` de rotas POST/fetch.
- Não sanitizar `err.message` cru em eventos de erro (achado separado da auditoria, não coberto aqui).
- Não mudar o contrato de eventos SSE (`progress|site|token|done|warning|error`).

## Capabilities

### New Capabilities
- `sse-error-contract`: contrato de entrega de erros de pré-condição em rotas SSE — recusas SHALL chegar ao cliente como evento SSE `{type:'error'}`, nunca como resposta HTTP não-200.

### Modified Capabilities

(vazio — os requisitos das capacidades existentes não mudam; muda apenas o canal de entrega do erro, coberto pela capability nova)

## Impact

- **Código**: `server.js` (1 helper novo + 6 substituições de linha). `tests/integration/sse.test.js` (3 testes novos).
- **APIs**: as 6 rotas SSE passam a responder 200 + evento `error` em pré-condição falha (antes: 400 JSON ilegível pelo EventSource).
- **Dependências**: nenhuma.
- **Referência detalhada**: `plans/001-erros-sse-visiveis.md` (excertos, verificações e STOP conditions).
