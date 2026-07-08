# Design: erros-sse-visiveis

## Context

O frontend consome as rotas geradoras via `EventSource` (`public/app.js:170` e `:859`). Pela spec do browser, `EventSource` só processa respostas 200 com `Content-Type: text/event-stream`; qualquer outro status vira um `onerror` opaco. O handler genérico de erro do app (`app.js:205-211`) mostra "Erro de conexão com o servidor." — correto para queda de rede, enganoso para pré-condição de negócio. O caminho de erro SSE (`type:'error'`) já existe e é tratado (`app.js:196-201`).

## Goals / Non-Goals

**Goals:**
- Toda recusa de pré-condição em rota SSE chega ao usuário com a mensagem original.
- Zero mudança de frontend e zero mudança nas mensagens.

**Non-Goals:**
- Pré-validação no frontend (endpoint companion) — descartada, ver Decisões.
- Tratamento de erros em rotas POST/fetch (já funcionam).

## Decisions

1. **Erro via evento SSE, não pré-validação no cliente.** Alternativa considerada: o frontend chamar um endpoint de status antes de abrir o `EventSource`. Rejeitada: duplica a validação em dois lugares (drift garantido), adiciona uma ida-e-volta, e o servidor continua precisando validar de qualquer forma.
2. **Helper único `sseError(res, message)`** ao lado dos helpers SSE existentes (`sseHeaders`/`send`, server.js:809-818), em vez de repetir o trio `sseHeaders + send + end` seis vezes. Vira o padrão obrigatório para novas rotas SSE (registrar no PROJECT.md §8 em follow-up).
3. **Status 200 na recusa.** É o único status que o `EventSource` processa. A semântica REST fica subordinada ao transporte SSE — trade-off aceito e delimitado às rotas SSE.

## Risks / Trade-offs

- [Cliente não-browser que dependa do 400 nas rotas SSE] → Não há consumidor conhecido além do `public/app.js`; risco aceito. Mitigação: mensagens preservadas permitem detecção pelo corpo do evento.
- [Rota da lista não ser de fato consumida por EventSource] → Verificação obrigatória antes da conversão (STOP condition no plano 001); conversão indevida quebraria um consumidor `fetch`.
- [Monitoramento por status HTTP perde visibilidade do erro] → Não existe monitoramento hoje (G06); irrelevante no momento.
