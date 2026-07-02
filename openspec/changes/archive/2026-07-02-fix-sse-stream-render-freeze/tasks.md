## 1. Corrigir regex de agrupamento de lista

- [x] 1.1 Em `public/app.js`, reescrever o regex `/(<li>.*<\/li>\n?)+/g` dentro de `renderMarkdown` (~linha 119) para uma forma sem grupo repetido contendo `.*`, mantendo o agrupamento de itens `<li>` consecutivos em um único `<ul>`.
- [x] 1.2 Testar manualmente `renderMarkdown` com um texto de exemplo contendo: lista simples, lista longa (30+ itens), listas separadas por linha em branco, e texto sem listas — confirmar que o HTML gerado é equivalente ao comportamento atual em todos os casos.

## 2. Agrupar renderização de tokens SSE por frame de animação

- [x] 2.1 Em `public/app.js`, na função `streamSSE` (~linhas 129-171), remover a chamada de `renderMarkdown` + `innerHTML` de dentro do handler síncrono do evento `token`; manter apenas `fullText += msg.text` e marcar que há renderização pendente.
- [x] 2.2 Adicionar agendamento via `requestAnimationFrame`: ao marcar renderização pendente, agendar (se ainda não houver um agendamento ativo para esta conexão) um callback que executa `renderMarkdown(fullText)` + atualização de `innerHTML` + `scrollTop` uma única vez, cobrindo todos os tokens acumulados até aquele frame.
- [x] 2.3 Garantir que cada chamada a `streamSSE` tenha seu próprio estado de agendamento (não compartilhado entre chamadas concorrentes/sequenciais), já que a função é reusada por várias etapas (ementa, pesquisa web, plano de aula, conteúdo, revisão de qualidade).
- [x] 2.4 No handler do evento `done`, cancelar qualquer `requestAnimationFrame` pendente (`cancelAnimationFrame`) e renderizar imediatamente o `fullText` final recebido do servidor, sem esperar o próximo frame.
- [x] 2.5 No handler do evento `error` e em `es.onerror`, cancelar qualquer `requestAnimationFrame` pendente para evitar renderização após o encerramento da conexão.

## 3. Validação manual

- [ ] 3.1 Rodar a geração de plano de aula para um curso com ~20 aulas e confirmar que o navegador permanece responsivo do início ao fim, sem o diálogo de "página não responde".
- [ ] 3.2 Rodar a geração de conteúdo (Etapa correspondente) para o mesmo curso e confirmar o mesmo comportamento.
- [ ] 3.3 Confirmar que o texto final exibido ao término do streaming (evento `done`) é idêntico, em conteúdo e formatação, ao gerado antes da mudança (comparar visualmente ou por diff de HTML renderizado em uma execução de controle).
- [ ] 3.4 Fazer um smoke test rápido em pelo menos uma etapa mais curta que também usa `streamSSE` (ex.: geração de ementa) para garantir que não houve regressão nas demais telas.
