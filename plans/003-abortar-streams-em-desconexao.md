# Plan 003: Abortar chamadas OpenAI quando o cliente desconecta do stream SSE

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e61017a..HEAD -- server.js tests/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Nota: os planos 001 e 002 tocam
> `server.js` (6 linhas de pré-condição) e `tests/` — esse drift é esperado e
> não é motivo de parada; qualquer outro drift em `server.js` é.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (toca o caminho de streaming de todas as etapas; exige cuidado
  para não abortar gerações legítimas)
- **Depends on**: plans/002-baseline-verificacao.md (usa `__lastOptions` e
  `APIUserAbortError` adicionados ao mock)
- **Category**: bug
- **Planned at**: commit `e61017a`, 2026-07-07

## Why this matters

Não existe **nenhum** handler `req.on('close')`/`res.on('close')` em
`server.js` (verificado por grep em `e61017a`). Quando o usuário fecha a aba,
dá refresh ou a conexão cai no meio de uma geração, o servidor continua
consumindo o stream da OpenAI até o fim — e, nos loops multi-aula
(`/api/conteudo`, `/api/aplicar-melhorias/confirmar`), continua para as aulas
seguintes, pagando tokens e gravando arquivos para uma requisição que ninguém
está ouvindo. Em um curso de 10 aulas com teto de 10.000 tokens/aula, um
refresh na aula 1 desperdiça potencialmente ~90.000 tokens de saída. O timer de
inatividade existente (`STALL_TIMEOUT_MS`) não ajuda: ele detecta stream
*parado*, não cliente ausente — um stream saudável roda até o fim.

## Current state

Arquivo relevante: `server.js` (tudo neste plano acontece nele, mais testes).

**1. `streamSkillToClient` (`server.js:1582-1656`)** — função central de
streaming usada por todas as etapas geradoras. Dois ramos:

- Ramo web-search (`:1583-1611`): chamada não-streaming com
  `{ signal: makeAbortSignal(CONTEUDO_SEARCH_TIMEOUT_MS) }` (`:1594`), depois
  reemite o texto em chunks para o cliente.
- Ramo streaming (`:1612-1655`): **já tem um `AbortController`** para o timer
  de inatividade:

```js
// server.js:1615-1631
const controller = new AbortController();
let stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
const resetStallTimer = () => {
  clearTimeout(stallTimer);
  stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
};

const stream = await openai.chat.completions.create({
  model: skill.model,
  stream: true,
  stream_options: { include_usage: true },
  max_tokens: MAX_TOKENS_AULA,
  messages: [...]
}, { signal: controller.signal });
```

**2. `makeAbortSignal` (`server.js:47-52`)** — helper de timeout puro:

```js
function makeAbortSignal(ms) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ac = new AbortController();
  setTimeout(() => ac.abort(), ms);
  return ac.signal;
}
```

**3. Loops multi-aula** que continuam após desconexão:

- `/api/conteudo` (`server.js:1684-1728`): `for (let i = 0; i < aulas.length; i++)`
  com `await new Promise(r => setTimeout(r, 4000))` entre aulas (`:1689`),
  chamada a `streamSkillToClient` (`:1714`) e persistência em disco (`:1727`).
- `/api/aplicar-melhorias/confirmar` (`server.js:2582-2987`): mesmo padrão
  (`:2586` pausa de 4s; `:2611` stream; `:2625-2646` chamadas de continuação
  com `makeAbortSignal(CONTEUDO_SEARCH_TIMEOUT_MS)`).
- `/api/ppc` (`server.js:1055-1085`): 4 chamadas `await openai.chat.completions.create`
  sequenciais sem signal de desconexão.
- `/api/revisao-qualidade` (`server.js:2257-2375`) e `/api/slides`
  (`server.js:1156-1231`, inclui `openai.images.generate` com
  `makeAbortSignal(90000)` em `:2247`).

**4. Tratamento de abort existente** (`server.js:1713-1721`):

```js
try {
  texto = await streamSkillToClient(res, baseSkill, sess);
} catch (err) {
  if (err instanceof OpenAI.APIUserAbortError) {
    send(res, { type: 'error', message: `Tempo limite excedido ao gerar a aula ${i + 1}: ${titulo}. Tente novamente.` });
    err.alreadyReported = true;
  }
  throw err;
}
```

Ou seja: hoje um abort é interpretado como *timeout* e reportado como erro ao
cliente. Com o abort por desconexão, é preciso **distinguir** os dois casos —
numa desconexão não há ninguém para receber o erro, e o correto é encerrar
silenciosamente (log no servidor apenas).

Fatos úteis do runtime: em Node/Express, o evento `'close'` de `res` dispara
quando a conexão encerra (inclusive desconexão prematura do cliente);
`res.writableEnded` é `true` se o servidor já chamou `end()`. Portanto
"desconexão prematura" = evento `close` com `res.writableEnded === false`.
`send()` (`server.js:816-818`) escreve num socket morto sem lançar — por isso
nada quebra hoje, só desperdiça.

Mock de teste: após o plano 002, `tests/__mocks__/openai.js` grava as options
da última chamada em `OpenAI.__lastOptions` e expõe `OpenAI.APIUserAbortError`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` | exit 0 |
| Tests | `npm test` | todos passam |
| Cobertura | `npm run test:coverage` | exit 0 (gate verde após plano 002) |

## Scope

**In scope**:
- `server.js` — `streamSkillToClient`, os handlers SSE listados acima, um
  helper novo, e `module.exports` (se precisar exportar o helper para teste).
- `tests/unit/` — teste unitário do helper.
- `tests/integration/sse.test.js` — teste de integração da desconexão.

**Out of scope** (NÃO tocar):
- `public/app.js` — o frontend já fecha o `EventSource` corretamente.
- A lógica de continuação/truncamento das melhorias (`isRespostaMelhoriasCompleta`
  etc.) — área sensível; só o *signal* das chamadas muda.
- `STALL_TIMEOUT_MS` e o comportamento do timer de inatividade — preservar.
- `mcp-server.js` — será removido pelo plano 005.

## Git workflow

- Branch: `advisor/003-abort-em-desconexao`.
- Commits em português, imperativo. Sugestão: `Aborta chamadas OpenAI quando o
  cliente desconecta do stream SSE`.
- NÃO fazer push nem abrir PR sem instrução do operador.

## Steps

### Step 1: Helper de contexto de desconexão

Adicionar em `server.js`, perto de `makeAbortSignal` (`:47-52`):

```js
// Rastreia desconexão prematura do cliente numa rota SSE e expõe um signal
// combinável com timeouts. 'close' com writableEnded=false = cliente sumiu.
function clientAbort(res) {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ac.abort();
  });
  return {
    signal: ac.signal,
    get disconnected() { return ac.signal.aborted; }
  };
}

// Combina o signal de desconexão com um timeout (AbortSignal.any existe no
// Node 20+; fallback manual para Node 18).
function combineSignals(a, b) {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b]);
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return ac.signal;
}
```

Adicionar ambos ao `module.exports` no fim do arquivo (região `:3289-3304`).

**Verify**: `npm test` → tudo verde (nada usa os helpers ainda).

### Step 2: Ligar a desconexão em `streamSkillToClient`

Mudar a assinatura para aceitar o contexto: `streamSkillToClient(res, skill,
sess, meta = {}, clientCtx = null)`.

- Ramo streaming: após criar o `controller` (`:1615`), se `clientCtx`, registrar
  `clientCtx.signal.addEventListener('abort', () => controller.abort(), { once: true })`.
- Ramo web-search: trocar `{ signal: makeAbortSignal(CONTEUDO_SEARCH_TIMEOUT_MS) }`
  por `{ signal: clientCtx ? combineSignals(clientCtx.signal, makeAbortSignal(CONTEUDO_SEARCH_TIMEOUT_MS)) : makeAbortSignal(CONTEUDO_SEARCH_TIMEOUT_MS) }`.
  No loop de reemissão em chunks (`:1606-1609`), sair cedo se
  `clientCtx?.disconnected`.

Compatibilidade: chamadas existentes sem o 5º argumento continuam funcionando
exatamente como hoje (comportamento nulo preservado).

**Verify**: `npm test` → tudo verde (chamadas existentes não passam `clientCtx`).

### Step 3: Adotar nos handlers SSE, com saída silenciosa

Para cada handler: criar `const client = clientAbort(res);` logo após
`sseHeaders(res)`, passar `client` às chamadas de `streamSkillToClient`, e:

1. **Loops multi-aula** (`/api/conteudo` `:1684`; `/api/aplicar-melhorias/confirmar`
   `:2582`): no topo de cada iteração, `if (client.disconnected) break;`.
   Nas chamadas diretas a `openai.chat.completions.create` dentro desses
   handlers (continuações em `:2625-2646`), combinar o signal:
   `{ signal: combineSignals(client.signal, makeAbortSignal(CONTEUDO_SEARCH_TIMEOUT_MS)) }`.
2. **Distinguir abort de desconexão vs timeout** no catch existente
   (`:1713-1721` e equivalentes): se o erro for de abort
   (`err instanceof OpenAI.APIUserAbortError` ou `err.name === 'AbortError'`)
   **e** `client.disconnected`, então `console.warn('[sse] cliente desconectou —
   geração interrompida')` e `return` limpo do handler (sem `send` de erro, sem
   rethrow). Caso contrário, manter o comportamento atual (é timeout real).
3. **Persistência parcial**: nos loops multi-aula, as aulas JÁ concluídas antes
   da desconexão permanecem persistidas (comportamento desejado — não desfazer).
   A aula interrompida no meio NÃO deve ser persistida.
4. Aplicar também em `/api/ppc` (`:1055-1085`): `if (client.disconnected) ...`
   entre as 4 chamadas sequenciais + signal combinado em cada uma; em
   `/api/revisao-qualidade` e `/api/slides` (incluindo o
   `openai.images.generate` `:2247`), mesmo padrão.

Handlers de etapa única (`/api/search`, `/api/plano-ensino`, `/api/plano-aula`,
`/api/qualidade`, `/api/metodologia`): basta passar `client` ao
`streamSkillToClient` e tratar o abort silencioso no catch.

**Verify**: `npm test` → tudo verde. `grep -c "clientAbort(res)" server.js` → ≥ 10.

### Step 4: Testes

1. **Unit** (`tests/unit/client-abort.test.js`): com mocks de `res`
   (EventEmitter + `writableEnded`), verificar: (a) `close` antes de `end` →
   signal abortado e `disconnected === true`; (b) `close` após `writableEnded = true`
   → NÃO aborta; (c) `combineSignals` aborta quando qualquer um dos dois aborta.
2. **Integração** (`tests/integration/sse.test.js`): iniciar um GET SSE (ex.
   `/api/plano-ensino` com sessão configurada), destruir a conexão no meio do
   stream (`req.abort()`/`res.destroy()` do lado do teste Supertest) e então
   verificar que `OpenAI.__lastOptions.signal.aborted === true` (dê um tick de
   `setImmediate` antes do assert). Se o timing se mostrar flaky após 2
   tentativas de estabilização, mantenha apenas o teste unitário + um teste de
   que `streamSkillToClient` aborta o stream quando `clientCtx.signal` dispara
   (chamando a função exportada diretamente com um `res` fake) — registre a troca.

**Verify**: `npm test` → todos passam, incluindo os novos.

## Test plan

- `tests/unit/client-abort.test.js`: 3 casos (acima).
- 1 teste de integração (ou o substituto direto de `streamSkillToClient`).
- Padrão estrutural: `tests/unit/token-usage.test.js` (unit sobre função
  exportada de server.js) e `tests/integration/sse.test.js`.
- Verificação final: `npm test` exit 0; `npm run test:coverage` exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "res.on('close'" server.js` → ≥ 1 (dentro de `clientAbort`).
- [ ] `grep -c "clientAbort(res)" server.js` → ≥ 10 (todos os handlers SSE).
- [ ] `grep -n "disconnected) break" server.js` → ≥ 2 (os dois loops multi-aula).
- [ ] `npm test` exit 0 com os novos testes.
- [ ] `npm run test:coverage` exit 0 (gate continua verde).
- [ ] `git status` limpo fora do escopo.
- [ ] Linha deste plano atualizada em `plans/README.md`.

## STOP conditions

Stop and report back (do not improvise) if:

- O plano 002 ainda não foi executado (o mock não tem `__lastOptions` /
  `APIUserAbortError`) — este plano depende dele.
- Os trechos de `streamSkillToClient` não baterem com "Current state" além das
  mudanças esperadas dos planos 001/002.
- Testes existentes de SSE começarem a falhar com abort inesperado — sinal de
  que o `clientAbort` está disparando com `close` normal pós-`end()`; NÃO
  contorne com try/catch, reporte.
- A distinção timeout×desconexão exigir mudar o formato dos eventos SSE
  (contrato com o frontend) — fora de escopo.
- Node < 18 aparecer como alvo (o fallback de `AbortSignal.any` assume 18+).

## Maintenance notes

- Toda nova rota SSE deve criar `clientAbort(res)` e propagar o signal — vale
  registrar no PROJECT.md §8 junto com a regra do `sseError` (plano 001).
- Revisor: o ponto crítico é o item 2 do Step 3 — um abort por desconexão
  reportado como "Tempo limite excedido" (ou vice-versa) é o bug a caçar.
  Conferir também que a pausa de 4s entre aulas (`:1689`, `:2586`) vem *depois*
  do check de `disconnected` (não desperdiçar 4s num loop morto é bônus; manter
  a ordem `check → sleep → gerar` ou `sleep → check → gerar` é aceitável, mas o
  check deve existir antes da chamada cara).
- Follow-up deferido: retry automático em falhas transitórias da OpenAI para
  todas as etapas (achado de direção B da auditoria, G05) — combina com esta
  infraestrutura de signals, mas é mudança de comportamento separada.
