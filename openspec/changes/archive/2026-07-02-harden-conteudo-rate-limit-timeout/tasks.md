## 1. Pausa entre aulas em /api/conteudo

- [x] 1.1 Em `server.js`, no loop de `GET /api/conteudo` (~linha 859), adicionar `if (i > 0) await new Promise(r => setTimeout(r, 4000));` no início de cada iteração, replicando o padrão de `server.js:1545` (Etapa 6).

## 2. Timeout de inatividade no branch de streaming de streamSkillToClient

- [x] 2.1 Em `server.js`, definir constante `STALL_TIMEOUT_MS` (ex.: 45000) próxima às constantes existentes `SEARCH_TIMEOUT_MS`/`SEARCH_RETRY_TIMEOUT_MS` (~linhas 26-27).
- [x] 2.2 Em `streamSkillToClient`, branch de streaming (~linhas 812-830): criar um `AbortController` próprio para a chamada, passar `{ signal: controller.signal }` em `openai.chat.completions.create`.
- [x] 2.3 Implementar o temporizador de inatividade: armar um `setTimeout(() => controller.abort(), STALL_TIMEOUT_MS)` antes do `for await`; a cada `delta` recebido, cancelar o temporizador anterior e rearmar um novo com o mesmo `STALL_TIMEOUT_MS`.
- [x] 2.4 Garantir que o temporizador seja limpo (`clearTimeout`) ao final do loop (sucesso) e também em caso de exceção/abort, para não deixar timers pendentes.

## 3. Timeout fixo no branch web_search_options de streamSkillToClient

- [x] 3.1 Em `server.js`, definir constante `CONTEUDO_SEARCH_TIMEOUT_MS` (ex.: 90000) junto às demais constantes de timeout.
- [x] 3.2 Em `streamSkillToClient`, branch `web_search_options` (~linhas 788-810): adicionar `{ signal: makeAbortSignal(CONTEUDO_SEARCH_TIMEOUT_MS) }` na chamada `openai.chat.completions.create`, reaproveitando o helper `makeAbortSignal` já existente (~linha 35).

## 4. Tratamento de erro explícito ao cliente

- [x] 4.1 Em `GET /api/conteudo` (e demais chamadores de `streamSkillToClient`, se aplicável sem esforço extra), capturar o erro de abort (`err.name === 'AbortError'` ou equivalente da SDK OpenAI) e emitir `send(res, { type: 'error', message: 'Tempo limite excedido ao gerar a aula ${i+1}: ${titulo}. Tente novamente.' })` antes de encerrar a resposta.
- [x] 4.2 Confirmar que o `catch` genérico existente em `GET /api/conteudo` (~linha 899-901) não duplica a mensagem de erro quando o abort já foi tratado especificamente.

## 5. Validação manual

- [ ] 5.1 Gerar conteúdo para um curso com múltiplas aulas em condição normal e confirmar que a pausa de 4s entre aulas é observável nos logs/tempo de execução, sem quebrar o fluxo.
- [ ] 5.2 Simular uma chamada travada (ex.: mockar/forçar um delay artificial maior que `STALL_TIMEOUT_MS` sem emitir deltas) e confirmar que a chamada é abortada, um evento `error` claro é emitido ao cliente, e a conexão SSE é encerrada corretamente.
- [ ] 5.3 Confirmar que uma geração de conteúdo legítima e longa (várias dezenas de segundos, com deltas chegando continuamente) NÃO é interrompida pelo timeout de inatividade.
- [ ] 5.4 Smoke test em `GET /api/revisao-qualidade` e no ciclo de aplicação de melhorias (Etapa 6) para confirmar que a adição do `signal` em `streamSkillToClient` não introduziu regressão nesses dois fluxos que também a utilizam.
