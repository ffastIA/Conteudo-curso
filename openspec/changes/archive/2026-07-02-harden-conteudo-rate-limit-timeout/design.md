## Context

`streamSkillToClient` (`server.js:787-831`) é a função compartilhada que executa uma chamada à OpenAI e repassa o resultado ao cliente via SSE. Ela tem dois caminhos:

1. **Branch `web_search_options`** (`server.js:788-810`): chamada não-streaming (`stream` ausente), resposta completa aguardada de uma vez, depois fatiada manualmente em chunks de 60 chars enviados via SSE com um pequeno delay artificial. Hoje sem `signal`.
2. **Branch padrão de streaming** (`server.js:812-830`): `stream: true`, itera com `for await (const chunk of stream)`, repassando cada delta como evento `token` assim que chega. Hoje sem `signal`.

Essa função é usada por três loops sequenciais de geração por aula: `GET /api/conteudo` (~linha 885, Etapa 5, sem pausa entre aulas), `GET /api/revisao-qualidade` (~linha 1373, sem pausa entre aulas) e o ciclo de aplicação de melhorias (~linha 1568, Etapa 6, já com pausa de 4s desde `server.js:1545`).

Já existe um padrão de referência para timeout em `tentarPesquisaWeb` (`server.js:42-55`), que usa `{ signal: makeAbortSignal(timeoutMs) }` com o helper `makeAbortSignal(ms)` (`server.js:35-40`, baseado em `AbortSignal.timeout` com fallback manual via `AbortController`).

Uma particularidade importante: para o branch de streaming (2), a chamada `openai.chat.completions.create({ stream: true, ... })` retorna rapidamente (abre a conexão), mas o trabalho real acontece no `for await` subsequente, que pode durar bastante tempo para uma aula de conteúdo longo. Um `AbortSignal.timeout(ms)` fixo passado no momento da criação da chamada aborta a conexão HTTP subjacente quando `ms` se esgota **a partir do início da chamada**, independentemente de dados ainda estarem chegando normalmente — ou seja, um timeout fixo curto demais abortaria falsamente uma geração legítima porém longa.

## Goals / Non-Goals

**Goals:**
- Adicionar pausa de 4s entre aulas no loop de `GET /api/conteudo`, replicando o padrão da Etapa 6.
- Garantir que uma chamada OpenAI verdadeiramente travada (sem nenhum dado chegando) seja abortada em tempo razoável, sem risco de abortar falsamente uma geração legítima que apenas demora mais para uma aula de conteúdo extenso.
- Emitir um evento SSE `error` claro ao cliente quando isso ocorrer.

**Non-Goals:**
- Não implementar retry automático com backoff (apenas timeout + falha explícita).
- Não alterar a lógica de negócio de geração de conteúdo em si (prompts, skills, mecanismos de escopo).
- Não adicionar heartbeat/keepalive SSE nesta correção (ver Open Questions).
- Não adicionar pausa entre aulas em `GET /api/revisao-qualidade` (gap relacionado, mas não solicitado neste change).

## Decisions

**1. Timeout de inatividade (stall timeout), não timeout de duração total, para o branch de streaming.**

Em vez de passar um `AbortSignal.timeout(ms)` fixo no momento da criação da chamada (que limitaria a duração *total* da geração de uma aula), o `AbortController` é criado e re-armado a cada chunk recebido: um temporizador de inatividade (`STALL_TIMEOUT_MS`, ex.: 45s) é resetado toda vez que um `delta` chega no `for await`. Se nenhum dado chegar por `STALL_TIMEOUT_MS`, o controller aborta a chamada. Isso captura exatamente o cenário problemático (rate-limit/retry silencioso do SDK, conexão travada) sem penalizar aulas cujo conteúdo é longo e legitimamente demora minutos para ser gerado, desde que dados continuem fluindo.

- *Por que:* o sintoma relatado (loop sequencial travado sem feedback) é causado por ausência de dados chegando, não pela duração total da geração. Um timeout de inatividade ataca a causa exata sem introduzir falsos positivos em aulas mais longas.
- *Alternativa considerada:* usar `makeAbortSignal(timeoutMs)` fixo, igual a `tentarPesquisaWeb`. Rejeitada para o branch de streaming porque a pesquisa web tem resposta curta e previsível (single-shot, `max_tokens: 2000`), enquanto a geração de conteúdo por aula pode gerar textos bem mais longos com duração total variável — um timeout fixo exigiria um valor tão alto (para não cortar gerações longas legítimas) que deixaria de proteger contra o cenário real de rate-limit (que pode "quase funcionar" por vários minutos com o SDK tentando novamente).

**2. Timeout fixo simples para o branch `web_search_options` (não-streaming).**

Para o branch sem streaming (`server.js:788-810`), manter o padrão já usado em `tentarPesquisaWeb`: `{ signal: makeAbortSignal(timeoutMs) }` fixo, com um valor maior (`CONTEUDO_SEARCH_TIMEOUT_MS`, ex.: 90s) já que a resposta esperada aqui é maior que a de pesquisa web (`max_tokens: 16000` vs `2000`, linha 792).

- *Por que:* esse branch aguarda uma resposta única e completa (sem streaming incremental), então o padrão fixo já validado se aplica diretamente sem o problema do item 1.

**3. Pausa de 4s entre aulas replicada da Etapa 6.**

Adicionar `if (i > 0) await new Promise(r => setTimeout(r, 4000));` no início de cada iteração (exceto a primeira) do loop de `GET /api/conteudo` (`server.js:859`), igual ao já existente em `server.js:1545`.

- *Por que:* reduz a chance de disparar rate-limit da OpenAI em primeiro lugar, complementando o timeout (que trata o caso em que o rate-limit já ocorreu).
- *Alternativa considerada:* pausa adaptativa baseada em uso de tokens/rate-limit headers da OpenAI. Rejeitada por adicionar complexidade não justificada — a pausa fixa de 4s já é o padrão aceito e testado no projeto (Etapa 6).

**4. Erro explícito ao cliente em caso de abort.**

Quando a chamada é abortada (por qualquer um dos dois timeouts), capturar a exceção de abort no loop de `GET /api/conteudo` e emitir `send(res, { type: 'error', message: 'Tempo limite excedido ao gerar a aula N. Tente novamente.' })` antes de encerrar a resposta, em vez de deixar a exceção genérica cair no `catch` externo com uma mensagem menos específica.

## Risks / Trade-offs

- [Risco] Escolher um `STALL_TIMEOUT_MS` (inatividade) baixo demais pode abortar streams legítimos que naturalmente têm pausas maiores entre deltas em picos de carga da OpenAI → Mitigação: usar um valor generoso (45s) — bem acima da latência típica entre deltas em operação normal, mas ainda muito menor que os minutos de silêncio observados no bug relatado.
- [Risco] `streamSkillToClient` é compartilhada por 3 endpoints; adicionar timeout nela afeta todos, incluindo Etapa 6 que já tem sua própria pausa → Mitigação: comportamento é estritamente aditivo (proteção a mais), sem mudança de comportamento em operação normal; validado manualmente nos 3 fluxos antes de finalizar.
- [Risco] Mensagem de erro genérica pode não deixar claro ao usuário que uma aula específica falhou e as demais não foram afetadas → Mitigação: incluir o número/título da aula na mensagem de erro emitida.

## Migration Plan

Mudança server-only, sem alteração de schema/sessão/API pública. Deploy como atualização normal de `server.js`; não há dado persistido a migrar. Rollback trivial: reverter o diff.

## Open Questions

- Vale adicionar heartbeat SSE (`res.write(':\n\n')` periódico) de forma genérica em `sseHeaders`/`send` para todas as conexões SSE do projeto, evitando que proxies/clientes considerem a conexão morta durante pausas longas legítimas? Levantado na investigação original, mas fica como melhoria candidata separada — não é necessário para resolver o cenário relatado, já que o stall timeout (Decisão 1) garante que a conexão nunca fica presa por mais que `STALL_TIMEOUT_MS` sem retorno ao cliente.
