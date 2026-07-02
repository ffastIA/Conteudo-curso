## Why

Durante a geração de plano de aula (`/api/plano-aula`) e de conteúdo (`/api/conteudo`) para cursos com muitas aulas (~20), o navegador trava e exibe o diálogo nativo de "página não responde" antes de a geração terminar. A causa raiz é `streamSSE` em `public/app.js`: a cada evento SSE `token` recebido, o texto acumulado de **todas** as aulas já geradas é reprocessado do zero por `renderMarkdown` (9 regex encadeados, incluindo um padrão com quantificador aninhado propenso a backtracking custoso) e reinjetado inteiro via `resultArea.innerHTML = ...`, forçando o navegador a descartar e reconstruir toda a árvore DOM. Como o servidor envia cada delta do streaming da OpenAI como um evento SSE individual (sem agrupamento), o custo por atualização cresce de forma aproximadamente quadrática (O(n²)) com o volume total de texto já gerado. Isso explica o padrão observado: a trava não ocorre numa aula fixa, mas progressivamente, geralmente entre a aula 5 e 6, dependendo do volume de texto acumulado.

## What Changes

- Alterar `streamSSE` (`public/app.js`) para não reprocessar/re-renderizar o texto acumulado inteiro a cada evento `token`. O incremento novo passa a ser convertido e anexado ao DOM já existente, ou a atualização visual passa a ser agrupada/limitada em frequência (ex.: via `requestAnimationFrame`), eliminando o crescimento quadrático de custo por atualização.
- Revisar o regex com quantificador aninhado em `renderMarkdown` (`/(<li>.*<\/li>\n?)+/g`) para uma forma sem backtracking custoso (ex.: quantificador não-guloso ou reescrita sem grupo repetido sobre `.*`).
- Preservar o resultado final idêntico ao atual: o texto renderizado ao término do streaming (evento `done`) deve corresponder byte a byte ao HTML produzido hoje por `renderMarkdown(fullText)`.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `content-generation`: a renderização incremental do streaming de plano de aula e conteúdo passa a evitar reprocessamento/re-render de todo o texto acumulado a cada token, garantindo que a UI permaneça responsiva durante a geração de cursos com muitas aulas.

## Impact

- `public/app.js`: função `streamSSE` (~linhas 129-171) — lógica de acumulação/renderização a cada evento `token` e `done`.
- `public/app.js`: função `renderMarkdown` (~linhas 111-122) — regex de lista com quantificador aninhado.
- Nenhuma mudança de contrato de API/SSE entre cliente e servidor (os tipos de evento `progress`, `site`, `token`, `done`, `error`, `warning` permanecem os mesmos).
- Sem dependências externas novas; sem breaking changes.

## Non-goals

- Não alterar a granularidade dos eventos SSE emitidos pelo servidor (`server.js`) — a correção é inteiramente client-side.
- Não introduzir uma biblioteca de markdown/virtual DOM; a solução deve continuar usando os mesmos regex/DOM nativos, apenas de forma incremental.
- Não alterar o comportamento funcional de outras telas que usam `streamSSE` (etapas de ementa, pesquisa web, revisão de qualidade, etc.) além de corrigir a mesma classe de problema, já que compartilham a função genérica.
- Não resolve os gaps G05 (retry em falhas OpenAI) ou G06 (logging estruturado) — fora de escopo desta correção.
