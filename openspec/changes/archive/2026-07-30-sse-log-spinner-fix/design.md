## Context

`public/app.js` tem 3 lugares que escrevem no painel de log com spinner: o
helper genérico `streamSSE()` (linhas ~156-227, usado por praticamente
todas as etapas de texto) e dois handlers `EventSource` customizados
(Slides/Etapa 8, Vídeo com Avatar/Etapa 10 — customizados porque o evento
`done` deles carrega metadado de arquivo binário, não texto markdown).
`addLog`/`finishLog` já tinham lógica idêntica e duplicada para remover a
classe `.current` (e o `<span class="spinner">` dentro dela) da última
linha antes de adicionar uma nova — só que essa limpeza nunca era
disparada pelo evento `done` em si, só por uma próxima chamada de
`addLog`/`finishLog` que dependesse de reconhecer o texto certo.

## Goals / Non-Goals

**Goals:**
- Nenhum spinner do painel de log deve continuar girando depois que a
  operação SSE correspondente termina (`done`), não importa o texto da
  última mensagem de `progress`.

**Non-Goals:**
- Não criar testes automatizados de DOM/frontend para isso — o projeto não
  tem essa infraestrutura de testes hoje, e criar um framework de testes de
  UI só para este bug seria desproporcional.
- Não mudar o formato/contrato dos eventos SSE (`progress`/`done`/`error`)
  — só a reação do cliente a eles.

## Decisions

**D1 — `clearSpinner(panel)` extraído como função própria, chamado no `done`.**
Em vez de exigir que toda rota SSE termine com uma mensagem de progresso
literal reconhecível (frágil — qualquer nova rota ou mudança de texto
reintroduziria o bug), a limpeza do spinner passa a ser responsabilidade do
recebimento do evento `done` em si, que é o sinal autoritativo e já
existente de "esta operação terminou". `addLog`/`finishLog` passam a
chamar a mesma função (elimina a duplicação de código que já existia
entre as duas). Idempotente: se o spinner já tinha sido limpo por um
`finishLog` anterior (rotas que já mandavam o literal `"Concluído"`),
chamar de novo no `done` não tem efeito (não há mais `.current` para
limpar).

## Risks / Trade-offs

- **[Risco] Nenhum** — mudança aditiva e idempotente; não altera nenhum
  contrato de dados nem comportamento fora da limpeza visual do spinner.
