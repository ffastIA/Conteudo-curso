## ADDED Requirements

### Requirement: Renderização client-side responsiva durante streaming SSE
O cliente SHALL exibir o texto recebido via SSE (`streamSSE` em `public/app.js`, usado por plano de aula, conteúdo e demais etapas que consomem streaming) sem bloquear o thread principal do navegador de forma contínua e sem re-render completo por evento `token` recebido. O sistema SHALL agrupar (coalescer) múltiplos eventos `token` recebidos entre frames de renderização em uma única atualização de DOM, de modo que o custo total de renderização não cresça de forma quadrática com o volume de texto acumulado ao longo de uma sessão de streaming. Ao término do streaming (evento `done`), o sistema SHALL exibir o texto final completo, idêntico ao produzido por `renderMarkdown` sobre o texto consolidado enviado pelo servidor.

#### Scenario: Geração de curso com muitas aulas não trava o navegador
- **WHEN** o usuário inicia a geração de plano de aula ou conteúdo para um curso com 20 aulas
- **THEN** o navegador permanece responsivo (não exibe o diálogo de "página não responde") durante toda a geração
- **THEN** a mensagem de progresso "Gerando aula N de 20" é atualizada normalmente conforme cada aula é processada

#### Scenario: Múltiplos tokens chegam entre frames de renderização
- **WHEN** o servidor emite vários eventos `token` para a mesma etapa antes do próximo frame de renderização do navegador
- **THEN** o cliente acumula o texto de todos esses eventos
- **THEN** o cliente executa no máximo uma atualização de DOM (`renderMarkdown` + atualização da área de resultado) para cobrir todos os eventos acumulados naquele frame

#### Scenario: Conteúdo final idêntico ao comportamento anterior
- **WHEN** o evento `done` é recebido, com o texto completo consolidado da etapa
- **THEN** o cliente renderiza imediatamente esse texto final, sem esperar o próximo frame agendado
- **THEN** o HTML exibido é equivalente ao produzido por `renderMarkdown(fullText)` sobre o texto final, para o mesmo conteúdo de entrada

### Requirement: Regex de agrupamento de lista sem backtracking catastrófico
A função `renderMarkdown` SHALL processar listas markdown (`- item` / `* item`) sem usar um padrão de regex com quantificador repetido envolvendo um grupo que contém `.*` (formato suscetível a backtracking catastrófico), preservando o agrupamento de itens consecutivos em um único elemento `<ul>`.

#### Scenario: Texto com muitos itens de lista não degrada performance
- **WHEN** o texto acumulado contém dezenas de itens de lista (`<li>...</li>`) consecutivos, como listas de objetivos/materiais em planos de aula
- **THEN** `renderMarkdown` processa o texto em tempo proporcional ao tamanho do texto, sem backtracking exponencial
- **THEN** o HTML resultante agrupa os itens consecutivos em um único `<ul>`, preservando o comportamento visual atual
