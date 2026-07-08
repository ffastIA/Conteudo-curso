# Plan 001: Tornar visíveis ao usuário os erros de pré-condição dos endpoints SSE

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e61017a..HEAD -- server.js tests/integration/sse.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e61017a`, 2026-07-07

## Why this matters

Seis rotas SSE (consumidas pelo frontend via `EventSource`) validam pré-condições
respondendo `res.status(400).json({...})`. O `EventSource` do navegador **não
consegue ler o corpo de uma resposta não-200**: ele apenas dispara `onerror`.
Resultado: mensagens acionáveis como "Conclua a Etapa 5 antes de gerar o
relatório de qualidade" nunca chegam ao usuário — ele vê sempre o genérico
"Erro de conexão com o servidor." e não sabe o que fazer. A correção converte
essas respostas em eventos SSE `{type:'error'}`, que o frontend **já renderiza
corretamente** — nenhuma mudança de frontend é necessária.

## Current state

Arquivos relevantes:

- `server.js` — todas as rotas e os helpers SSE.
- `public/app.js` — consumidor `EventSource`; **não modificar** (já trata `type:'error'`).
- `tests/integration/sse.test.js` — testes SSE existentes; usar como padrão.

Helpers SSE existentes (`server.js:809-818`):

```js
function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function send(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}
```

Os 6 sites com o bug — todos em rotas `app.get(...)` consumidas por `EventSource`:

| Rota (linha da rota) | Linha do bug | Código atual |
|---|---|---|
| `GET /api/qualidade` (`server.js:988`) | `server.js:991` | `return res.status(400).json({ error: 'Conclua ao menos a Etapa 5 antes de gerar o relatório de qualidade.' });` |
| `GET /api/ppc` (`server.js:1045`) | `server.js:1048` | `return res.status(400).json({ error: 'Conclua a Etapa 5 antes de gerar o PPC.' });` |
| `GET /api/slides` (`server.js:1155`) | `server.js:1159` | `return res.status(400).json({ error: 'Conclua a Etapa 5 antes de gerar os slides.' });` |
| `GET /api/slides` (mesma rota) | `server.js:1162` | `return res.status(400).json({ error: 'Escolha um estilo visual antes de gerar os slides.' });` |
| `GET /api/revisao-qualidade` (`server.js:2256`) | `server.js:2260` | `return res.status(400).json({ error: 'Conclua a Etapa 5 antes de gerar a revisão de qualidade.' });` |
| `GET /api/aplicar-melhorias/confirmar` (`server.js:2528`) | `server.js:2533` | `return res.status(400).json({ error: 'Sem conteúdo para melhorar. Conclua a Etapa 5.' });` |

Exemplo do contexto de um dos sites (`server.js:988-994`):

```js
app.get('/api/qualidade', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.conteudo && !sess.conteudoPorAula?.length) {
    return res.status(400).json({ error: 'Conclua ao menos a Etapa 5 antes de gerar o relatório de qualidade.' });
  }
  sseHeaders(res);
  send(res, { type: 'progress', message: 'Iniciando análise pedagógica...' });
```

O frontend já trata o evento de erro (`public/app.js:196-201`) — prova de que o
formato SSE `{type:'error', message}` é o contrato correto:

```js
} else if (msg.type === 'error') {
  cancelScheduledRender();
  errLog(logPanel, msg.message);
  es.close();
  refreshTokenCounter();
  if (onError) onError(msg.message);
}
```

**Importante — NÃO tocar**: os `res.status(400).json(...)` das rotas **POST**
(ex.: `server.js:904, 914, 955, 1145, 1251-1265, 1821, 1947-1949, 1981-1990,
2042, 2387-2395, 2997`) estão corretos — são consumidos por `fetch()`, que lê
JSON de respostas 400 normalmente. Só as 6 linhas da tabela acima mudam.

Convenções do repo: eventos SSE seguem `{type: 'progress'|'site'|'token'|'done'|'warning'|'error', ...}`
(PROJECT.md §4); commits em português.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` | exit 0 |
| Tests | `npm test` | 13 suites, 164+ testes, todos passam |
| Servidor manual | `node server.js` | "Servidor rodando em http://localhost:3000" |

## Scope

**In scope** (únicos arquivos que você deve modificar):
- `server.js` — apenas as 6 linhas da tabela + adição de 1 helper.
- `tests/integration/sse.test.js` — novos testes.

**Out of scope** (NÃO tocar, mesmo parecendo relacionado):
- `public/app.js` — já funciona; qualquer mudança lá é risco sem ganho.
- Os `status(400)` das rotas POST listados acima.
- Qualquer outra lógica das 6 rotas afetadas (só a resposta de pré-condição muda).

## Git workflow

- Branch: `advisor/001-erros-sse-visiveis` (a partir de `main`).
- Mensagem de commit em português, modo imperativo, sem prefixo de tipo — exemplo
  do histórico: "Corrige botão \"Gerar Nova Revisão\" que não fazia nada após aplicar melhorias".
  Sugestão: `Torna visíveis ao usuário os erros de pré-condição dos endpoints SSE`.
- NÃO fazer push nem abrir PR sem instrução do operador.

## Steps

### Step 1: Adicionar helper `sseError`

Em `server.js`, logo após a função `send` (após a linha 818), adicionar:

```js
// Erro de pré-condição em rota SSE: EventSource não lê corpo de resposta
// não-200, então a recusa precisa chegar como evento SSE.
function sseError(res, message) {
  sseHeaders(res);
  send(res, { type: 'error', message });
  res.end();
}
```

**Verify**: `node -e "require('./server.js')"` → sai sem erro de sintaxe
(o servidor não sobe porque `require.main !== module`, comportamento esperado).

### Step 2: Substituir os 6 sites

Em cada uma das 6 linhas da tabela em "Current state", substituir
`return res.status(400).json({ error: '<msg>' });` por
`return sseError(res, '<msg>');` — preservando a mensagem original byte a byte.

**Verify**: `grep -n "status(400)" server.js` → as linhas 991, 1048, 1159, 1162,
2260 e 2533 (números podem deslocar ±1 após o Step 1) **não** aparecem mais;
os sites das rotas POST continuam presentes.

### Step 3: Testes de regressão

Em `tests/integration/sse.test.js`, adicionar um `describe('pré-condições SSE')`
seguindo o padrão dos testes SSE existentes no mesmo arquivo (mesmo estilo de
requisição Supertest e parse de eventos `data:`). Casos mínimos:

1. `GET /api/qualidade` **sem** conteúdo na sessão → resposta 200, `Content-Type`
   contém `text/event-stream`, e o corpo contém um evento com
   `"type":"error"` e a mensagem `Conclua ao menos a Etapa 5`.
2. `GET /api/revisao-qualidade` sem conteúdo → idem com a mensagem correspondente.
3. `GET /api/slides` sem conteúdo → idem.

**Verify**: `npm test` → todos passam, incluindo os 3 novos.

## Test plan

- Novos testes: os 3 descritos no Step 3, em `tests/integration/sse.test.js`.
- Padrão estrutural: os testes SSE já existentes nesse arquivo (montam o app,
  fazem GET e inspecionam o stream de eventos).
- Verificação: `npm test` → 13 suites, 167+ testes, 0 falhas.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` sai com código 0; 3+ testes novos de pré-condição SSE existem e passam.
- [ ] `grep -c "sseError(res" server.js` → `7` (1 definição + 6 usos) ou mais.
- [ ] Nenhuma das 6 mensagens de pré-condição aparece mais junto a `status(400)`:
      `grep -n "Conclua.*Etapa 5" server.js` não mostra nenhuma linha com `status(400)`.
- [ ] `git status` não mostra arquivos modificados fora do escopo.
- [ ] Linha deste plano atualizada em `plans/README.md`.

## STOP conditions

Stop and report back (do not improvise) if:

- Os trechos em "Current state" não baterem com o código (drift desde `e61017a`).
- Alguma das 6 rotas NÃO for consumida por `EventSource` no `public/app.js`
  (confira: o helper genérico cria `new EventSource(url)` em `app.js:170` e a
  rota de slides em `app.js:859`) — nesse caso a conversão para SSE quebraria o
  consumidor; reporte em vez de converter.
- `npm test` falhar em teste que você não criou.

## Maintenance notes

- Toda **nova** rota SSE deve usar `sseError` para pré-condições — nunca
  `res.status(4xx).json(...)`. Vale adicionar essa regra ao PROJECT.md §8
  (padrão "Novo endpoint SSE") num follow-up de docs.
- Revisor: conferir que nenhuma mensagem foi alterada (o frontend e possíveis
  usuários dependem do texto) e que nenhuma rota POST foi tocada.
- Follow-up deferido: os handlers SSE também expõem `err.message` cru em eventos
  de erro (achado de segurança #5 da auditoria, não selecionado nesta rodada).
