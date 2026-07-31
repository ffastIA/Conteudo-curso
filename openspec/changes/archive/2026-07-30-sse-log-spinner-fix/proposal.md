## Why

O painel de log usado por várias etapas SSE (`streamSSE()` genérico, e os
handlers customizados de Slides/Etapa 8 e Vídeo com Avatar/Etapa 10) só
encerrava o spinner da última linha "current" quando reconhecia o texto de
uma mensagem de `progress` específica (ex.: `msg.message === 'Concluído'`
no `streamSSE()`). Endpoints cuja última mensagem de progresso é descritiva
em vez de literal — `"Roteiro da aula 1 concluído"`, `"Roteiro de avatar da
aula 1 concluído"` — nunca batiam nessa checagem, e como o evento `done`
não tocava no painel de log, o spinner ficava girando para sempre mesmo com
a operação já concluída. Reportado pelo usuário ao usar "Gerar Roteiro" na
Etapa 10; o mesmo bug já existia (mascarado) na Etapa 9.

## What Changes

- O painel de log encerra o indicador de carregamento (spinner) sempre que
  o evento SSE `done` é recebido, independente do texto da última mensagem
  de `progress` — não depende mais de reconhecer um texto específico.
- Aplicado nos 3 pontos que gerenciam spinner em painel de log: o helper
  genérico `streamSSE()` (usado por Roteiros — Etapa 9 — e Roteiro de
  Avatar — Etapa 10 — entre outros) e os dois handlers customizados de
  Slides (Etapa 8) e envio ao HeyGen (Etapa 10).

## Capabilities

### New Capabilities
- `sse-progress-log-ui`: comportamento do painel de log (spinner/linhas de
  progresso) do frontend diante de eventos SSE `progress`/`done` — capability
  nova porque nenhum spec existente cobre renderização de UI de progresso
  (só `sse-error-contract`, que é sobre o canal de erro, e
  `sse-client-disconnect`, sobre desconexão).

### Modified Capabilities
(nenhuma)

## Impact

- **Código**: `public/app.js` (`clearSpinner()` novo, extraído de
  `addLog`/`finishLog`; chamado nos 3 handlers de evento `done`). Já
  implementado e testado manualmente antes desta proposta — `npm test`
  segue 291/291 (mudança de renderização pura de UI, fora do escopo do
  Jest/Supertest, que testa só o backend).
- **Não resolve um Gap ID priorizado existente (G01–G07)** — é correção de
  um bug de UI encontrado pelo usuário.
- **Non-goals**: não adiciona teste automatizado para essa lógica de UI
  (o projeto não tem suíte de testes de frontend/DOM); não muda o formato
  dos eventos SSE em si (`progress`/`done`/`error`), só como o cliente reage
  a eles.
