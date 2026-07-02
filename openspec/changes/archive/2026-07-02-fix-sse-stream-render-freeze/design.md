## Context

`streamSSE` (`public/app.js:129-171`) é usado por todas as etapas que consomem SSE do servidor (ementa, pesquisa web, plano de ensino, plano de aula, conteúdo, revisão de qualidade). Para cada evento `token`, o handler executa, de forma síncrona dentro do callback `onmessage`:

1. `fullText += msg.text`
2. `resultArea.innerHTML = renderMarkdown(fullText)` — reprocessa a string inteira acumulada com 9 `.replace()` regex.
3. `resultArea.scrollTop = resultArea.scrollHeight` — leitura que força reflow.

O servidor emite um evento `token` por delta bruto do streaming da OpenAI (`server.js:693-736`, `822-829`), o que para 20 aulas pode significar milhares de eventos numa única conexão SSE, sem nenhum agrupamento. Como o custo de cada atualização cresce com o tamanho total já acumulado, o trabalho total no thread principal do navegador cresce aproximadamente O(n²) em relação ao texto total gerado — e a aba trava porque as chamadas de `onmessage` se sucedem sem intervalo para o navegador processar input/pintura, disparando o watchdog de "página não responde" do Chrome.

Este documento cobre a correção porque envolve uma decisão de arquitetura (renderização incremental vs. throttling) e risco de regressão visual/performance em um caminho compartilhado por várias etapas do produto.

## Goals / Non-Goals

**Goals:**
- Eliminar o crescimento quadrático de custo por atualização durante o streaming SSE no cliente.
- Garantir que o navegador nunca fique bloqueado tempo suficiente para disparar o diálogo de "página não responde", independentemente do número de aulas/tamanho do curso.
- Manter o conteúdo final exibido ao término do streaming (`done`) idêntico ao produzido hoje.
- Corrigir o regex de lista com quantificador aninhado em `renderMarkdown`, que agrava o custo por render conforme a string cresce.

**Non-Goals:**
- Não implementar um parser de markdown incremental "de verdade" (que rastreia estado de blocos abertos — listas, negrito partido entre chunks, heading pendente) para anexar apenas o HTML novo via `insertAdjacentHTML`. Fica registrado como possível evolução futura (ver Open Questions).
- Não introduzir bibliotecas externas de markdown/virtual DOM.
- Não alterar a granularidade dos eventos SSE emitidos pelo servidor.
- Não alterar o comportamento de outras etapas além de corrigir a mesma classe de problema, já que compartilham `streamSSE`.

## Decisions

**1. Agrupar (coalesce) eventos `token` por frame de animação, em vez de renderizar a cada evento.**

Em vez de chamar `renderMarkdown` + `innerHTML` dentro do próprio `onmessage`, os tokens recebidos são apenas concatenados a `fullText` (operação O(1) amortizado) e uma atualização de tela é agendada via `requestAnimationFrame`, no máximo uma vez por frame (~16ms). Se múltiplos eventos `token` chegarem antes do frame disparar, todos são acumulados e uma única renderização cobre todos eles.

- *Por que:* Isso não muda a complexidade assintótica de uma única chamada de `renderMarkdown` (ainda é O(tamanho atual do texto)), mas reduz drasticamente o **número** de chamadas — de "uma por delta do OpenAI" (potencialmente milhares) para "no máximo 60/segundo, e na prática muito menos, limitado pela taxa real de chegada de tokens". Mais importante: cada renderização passa a rodar em uma task separada do event loop (callback de `rAF`), dando ao navegador oportunidade de processar input/pintura entre elas — que é exatamente a condição que evita o watchdog de "página não responde" (ele dispara por bloqueio contínuo do thread principal, não pelo total de CPU consumido ao longo do tempo).
- *Alternativa considerada:* renderização incremental "verdadeira", convertendo apenas o texto novo em HTML e anexando com `insertAdjacentHTML('beforeend', novoHtml)`. Rejeitada para esta correção porque exige rastrear estado entre chunks (ex.: um `<li>` ainda não fechado, um `**negrito**` partido entre dois eventos, um heading sem quebra de linha final ainda recebida) — uma mudança bem maior e com mais superfície de bugs sutis de formatação, para resolver o mesmo sintoma que o agrupamento por frame já resolve com uma mudança pequena e de baixo risco.

**2. Corrigir o regex de agrupamento de lista.**

Trocar `/(<li>.*<\/li>\n?)+/g` (quantificador `+` envolvendo um grupo que contém `.*`, formato clássico de backtracking catastrófico) por uma forma sem grupo repetido sobre um `.*` interno — por exemplo, casar cada linha `<li>...</li>` individualmente com uma âncora de linha (`^<li>.*<\/li>$/gm`) e depois agrupar as ocorrências consecutivas em uma segunda passada simples, ou reescrever com uma classe de caracteres negada (`[^<]*` ou `.*?` não-guloso por linha) que não reabre backtracking sobre o texto já consumido.

- *Por que:* mesmo com o agrupamento por frame (Decisão 1), cada render individual ainda passa por esse regex sobre o texto acumulado; sem corrigi-lo, entradas com muitas tags `<li>` (comum em planos de aula com listas de objetivos/materiais) continuam vulneráveis a um único render anormalmente lento.
- *Alternativa considerada:* remover o agrupamento em `<ul>` e deixar `<li>` soltos. Rejeitada por mudar o HTML/CSS resultante (perda de indentação/marcadores de lista).

**3. Renderização final síncrona no evento `done`.**

Ao receber `done`, cancelar qualquer `rAF` pendente e renderizar imediatamente com o `fullText` final do servidor — sem esperar o próximo frame — garantindo que o conteúdo final apareça sem atraso perceptível e sem depender de timing de frame.

## Risks / Trade-offs

- [Risco] Atualização visual passa a ocorrer em "rajadas" por frame em vez de caractere a caractere → Mitigação: 60 atualizações/segundo é imperceptível; a sensação de streaming ao vivo é preservada.
- [Risco] `requestAnimationFrame` pausa quando a aba está em background/minimizada, então a UI não pinta novos tokens nesse período → Mitigação: a geração continua normalmente no servidor (nada é perdido, `fullText` continua acumulando em memória) e o render final no `done` sempre reflete o conteúdo completo; comportamento aceitável e documentado.
- [Risco] Reescrever o regex de lista pode mudar sutilmente a saída em casos de borda (linha em branco entre itens, listas aninhadas) → Mitigação: plano de teste manual comparando saída antes/depois em casos de borda conhecidos (ver tasks.md).
- [Risco] `streamSSE` é compartilhado por outras etapas (ementa, pesquisa web, revisão de qualidade) — a mudança afeta todas elas → Mitigação: é o comportamento desejado (mesma classe de bug), mas amplia a superfície de teste manual necessária antes de finalizar.

## Migration Plan

Mudança client-only, sem alteração de schema/API/contrato SSE. Deploy como atualização normal de `public/app.js` (arquivo estático servido pelo Express). Rollback trivial: reverter o diff do arquivo, sem necessidade de feature flag.

## Open Questions

- Vale a pena, em uma iteração futura, evoluir para renderização incremental real (anexar apenas o HTML novo) para suportar cursos muito maiores (50+ aulas) com ainda mais margem de segurança? Fora do escopo desta correção.
