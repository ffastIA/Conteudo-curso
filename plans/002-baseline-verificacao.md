# Plan 002: Restabelecer o baseline de verificação — gate de cobertura verde, mock JSON e testes dos caminhos críticos

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e61017a..HEAD -- server.js jest.config.js tests/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (testes aditivos; nenhuma mudança de comportamento em produção)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `e61017a`, 2026-07-07

## Why this matters

Medido em `e61017a`: `npm run test:coverage` **falha hoje** (exit 1) — cobertura
de linhas global 38,62% contra threshold de 40% (`jest.config.js:6-8`). Um gate
que está vermelho e não bloqueia nada é pior que nenhum gate. Pior: os caminhos
que o app existe para entregar têm ~0% de cobertura — export `.docx`/`.pptx`
(`server.js:2013-2250`), o ciclo completo de melhorias
(`/api/aplicar-melhorias*`, `server.js:2384-2987`), o carregamento de projeto do
disco (`server.js:1819-1906`) e a importação (`server.js:1946-2008`). Além
disso, o mock da OpenAI só devolve prosa fixa, então as skills cujo contrato é
**JSON** (`planLessonsSkill` → `LessonMeta[]`, slides) são estruturalmente
impossíveis de testar hoje. Este plano deixa o gate verde com cobertura real
nos caminhos perigosos — pré-requisito declarado para os refactors futuros
(split do server.js, migração do SDK). Fecha a parte mais aguda do gap G07 do
PROJECT.md §9.

## Current state

Arquivos relevantes:

- `jest.config.js` — threshold e escopo de cobertura (arquivo completo abaixo).
- `tests/__mocks__/openai.js` — mock global do SDK (mapeado em `moduleNameMapper`).
- `tests/integration/api.test.js` e `tests/integration/sse.test.js` — padrões a seguir.
- `server.js` — alvo da cobertura; exporta funções puras para teste em
  `server.js:3289-3304` (confira o bloco `module.exports` no fim do arquivo).

`jest.config.js` completo hoje:

```js
'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coverageThreshold: {
    global: { lines: 40 }
  },
  collectCoverageFrom: [
    'server.js',
    'skills.js'
  ],
  moduleNameMapper: {
    '^openai$': '<rootDir>/tests/__mocks__/openai.js'
  }
};
```

Números medidos em `e61017a` (saída real de `npm run test:coverage`):

```
All files  | 38.83 stmts | 40.19 branch | 45.71 funcs | 38.62 lines  ← gate 40 FALHA (exit 1)
server.js  | 36.27       | 33.66        | 40.34       | 36.41
skills.js  | 87.20       | 58.99        | 73.52       | 87.87
```

Maiores faixas não cobertas de `server.js` (da mesma saída):
`1294-1384` (search), `1583-1655` (streamSkillToClient), `1662-1741` (conteúdo),
`1819-1906` (carregar-projeto), `1946-2008` (importar), `2045-2055` e
`2179-2250` (export/DOCX/PPTX), `2257-2375` (revisão de qualidade),
`2384-2523` e `2529-2987` (ciclo de melhorias), `3025-3272` (builder DOCX).

Mock atual (`tests/__mocks__/openai.js`, arquivo completo tem 54 linhas —
resposta fixa `'mock response text'`, helpers `__setResponse`, `__setError`,
`__getMock`, `__reset`; o `mockCreate` já suporta `stream: true` devolvendo um
async generator palavra a palavra). Limitações concretas:

1. Sem `images.generate` — a rota `/api/slides` chama
   `openai.images.generate(...)` (`server.js:2239-2248`); com o mock atual isso
   lança `TypeError` (propriedade inexistente).
2. Sem a classe `OpenAI.APIUserAbortError` — referenciada em `server.js:1716`
   (`err instanceof OpenAI.APIUserAbortError`); se um teste fizer um erro
   chegar ali, `instanceof undefined` lança `TypeError`.
3. `__setResponse` com uma única resposta fixa — endpoints que fazem N chamadas
   com contratos diferentes (ex.: `/api/conteudo` chama `planLessonsSkill`
   esperando JSON e depois `conteudoSkill` esperando prosa) não são testáveis.

Padrão dos testes existentes: `tests/integration/api.test.js` usa Supertest
contra o app exportado, com `OpenAI.__setResponse(...)` antes das chamadas;
`tests/integration/sse.test.js` faz GET e parseia eventos `data:` do corpo.
Siga esses arquivos como exemplar estrutural.

Persistência em disco: as rotas gravam em `sess.config.pastaProjeto`. Nos testes,
use uma pasta temporária (`fs.mkdtempSync(path.join(os.tmpdir(), 'gc-test-'))`)
como `pastaProjeto` para não sujar `saídas/`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` | exit 0 |
| Tests | `npm test` | todos passam |
| Cobertura + gate | `npm run test:coverage` | **exit 0** e lines ≥ 40% (hoje: exit 1) |

## Scope

**In scope**:
- `tests/__mocks__/openai.js` — estender (sem quebrar a API existente do mock).
- `tests/integration/api.test.js`, `tests/integration/sse.test.js` — novos casos.
- `tests/unit/` — novos arquivos de teste unitário (ex.: `slugify.test.js`).
- `jest.config.js` — somente se precisar ajustar `collectCoverageFrom` (NÃO
  baixar o threshold; ver STOP conditions).

**Out of scope** (NÃO tocar):
- `server.js`, `skills.js` — **nenhuma linha de produção muda neste plano.**
  Exceção única e cirúrgica: se uma função pura necessária ao teste não estiver
  no `module.exports` do fim do `server.js`, você pode ADICIONÁ-LA ao objeto de
  exports (sem alterar a função em si).
- `public/` — sem testes de frontend nesta rodada (decisão registrada; ver índice).
- CI/GitHub Actions — deferido: o repo não tem remote GitHub configurado
  (verifique com `git remote -v`; se um remote existir, apenas reporte ao final).

## Git workflow

- Branch: `advisor/002-baseline-verificacao`.
- Commits em português, imperativo — ex. do histórico: "Adiciona verificação
  mecânica das melhorias autorrelatadas pelo modelo". Um commit por step é razoável.
- NÃO fazer push nem abrir PR sem instrução do operador.

## Steps

### Step 1: Estender o mock da OpenAI (retrocompatível)

Em `tests/__mocks__/openai.js`:

1. Adicionar fila de respostas: `OpenAI.__setResponses([...textos])` — cada
   chamada a `create` consome a próxima; quando a fila esvazia, volta ao
   comportamento de `_response` fixa. Manter `__setResponse`/`__reset` intactos.
2. Adicionar `this.images = { generate: mockImagesGenerate }` no construtor,
   onde `mockImagesGenerate` resolve
   `{ data: [{ b64_json: '<png 1x1 em base64>' }] }` e tem helper
   `OpenAI.__setImageError(err)`.
3. Adicionar `OpenAI.APIUserAbortError = class APIUserAbortError extends Error {}`.
4. Fazer `mockCreate` gravar o último argumento de opções em
   `OpenAI.__lastOptions` (necessário para o plano 003 testar abort — capture
   `(args, options)`).

**Verify**: `npm test` → os 164 testes existentes continuam passando (mudança retrocompatível).

### Step 2: Testes do export (`POST /api/export/:step`)

Em `tests/integration/api.test.js`, novos casos:

1. Fluxo: configurar sessão via `POST /api/config` (com `pastaProjeto` numa
   pasta temp), popular a etapa via rota geradora ou gravando o `.txt` esperado,
   então `POST /api/export/plano-ensino` → status 200, header
   `Content-Disposition` contém `.docx`, corpo com tamanho > 1000 bytes e
   assinatura ZIP (primeiros 2 bytes `PK`).
2. Export de etapa inexistente → 400 com `error` (`server.js:2042`).

**Verify**: `npm test -- --testPathPatterns=api` → novos casos passam.
(Jest 30: a flag é `--testPathPatterns`, não `--testPathPattern`.)

### Step 3: Testes do carregamento de projeto (`POST /api/carregar-projeto`)

Novos casos (padrão: montar uma pasta temp com `scr/projeto.json` + `scr/*.txt`
e chamar a rota):

1. Pasta com `projeto.json` válido + `ementa.txt` → 200, `etapasCarregadas`
   contém `ementa`, e a sessão reflete a config (verificável por uma chamada
   subsequente, ex. `GET /api/tokens` ou repetindo o carregamento).
2. Pasta inexistente → 404 (`server.js:1824`).
3. `projeto.json` corrompido (conteúdo `{{{`) → 200 com `aviso` de corrompido
   (`server.js:1848`).

**Verify**: `npm test -- --testPathPatterns=api` → passam.

### Step 4: Teste de caminho JSON (`planLessons`) e um happy path do ciclo de melhorias

1. **planLessons**: usando `__setResponses`, fazer `GET /api/plano-aula` (rota
   `server.js:1448`) com 1ª resposta = JSON válido de aulas
   (`[{"titulo":"Aula X","modulo":"M1","objetivos":"..."}]` — confira o formato
   exato esperado lendo a função `planLessons` em `server.js`, região ~1521-1571)
   e respostas seguintes = prosa. Assert: stream termina com `done` e o texto
   contém `Aula X`.
2. **Melhorias**: teste do fluxo `POST /api/aplicar-melhorias` (upload de um
   `.docx` de revisão gerado com a lib `docx` já disponível no repo — veja
   `scripts/gerar-docx-teste.js` como exemplar de geração) seguido de
   `GET /api/aplicar-melhorias/confirmar` com `__setResponses` devolvendo um
   patch `<<<SECAO: Título>>>...<<<FIM_SECAO>>>`. Assert mínimo: evento `done`
   presente e nenhum evento `error`. Se o setup do upload se mostrar frágil,
   é aceitável cobrir só a metade `confirmar` populando a sessão via
   `carregar-projeto` (Step 3) — registre a escolha no commit.

**Verify**: `npm test` → tudo verde.

### Step 5: Unit tests de `slugify`/`courseRootDir` e fechamento do gate

1. Verificar o `module.exports` no fim de `server.js` (região `3289-3304`); se
   `slugify` (ou equivalente) estiver exportada, testar: espaços→`_`,
   preservação de acentos conforme comportamento atual (caracterização — o
   teste documenta o que É, não o que deveria ser). Se não exportada,
   adicioná-la ao exports (exceção permitida no Scope).
2. Rodar `npm run test:coverage`. Se lines ainda < 40%, adicionar o próximo
   teste mais barato da lista de faixas não cobertas (ex.: `GET /api/metodologia`
   ou `POST /api/importar` com texto simples) até cruzar 40%.

**Verify**: `npm run test:coverage` → **exit 0**, lines ≥ 40%.

## Test plan

Este plano É o test plan. Resumo do que deve existir ao final:
- Mock estendido (fila de respostas, `images.generate`, `APIUserAbortError`, `__lastOptions`).
- Export: 2+ casos. Carregar-projeto: 3 casos. JSON/planLessons: 1 caso.
  Melhorias: 1 happy path. Slugify: 1 arquivo unit.
- Padrões: `tests/integration/api.test.js` (Supertest+fetch de JSON),
  `tests/integration/sse.test.js` (parse de eventos SSE).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exit 0; total de testes > 175.
- [ ] `npm run test:coverage` **exit 0** (gate verde), lines global ≥ 40%.
- [ ] Threshold em `jest.config.js` continua `40` (não foi rebaixado):
      `grep -n "lines: 40" jest.config.js` → 1 match.
- [ ] `grep -n "images" tests/__mocks__/openai.js` → mock de imagens presente.
- [ ] `git status` limpo fora do escopo (nenhuma mudança em `server.js`/`skills.js`
      além de, no máximo, linhas adicionadas ao `module.exports` do `server.js`).
- [ ] Linha deste plano atualizada em `plans/README.md`.

## STOP conditions

Stop and report back (do not improvise) if:

- A tentação for **baixar o threshold** para passar o gate — isso inverte o
  objetivo do plano; pare e reporte se 40% se mostrar inalcançável com ~6-8
  testes novos.
- Os testes existentes quebrarem com a extensão do mock (o mock novo deve ser
  estritamente aditivo).
- O formato JSON esperado por `planLessons` não corresponder ao descrito
  (leia a função antes de escrever o teste; se divergir muito, reporte).
- Algum teste novo exigir mudança de comportamento em `server.js` para passar.

## Maintenance notes

- O plano 003 (abort em desconexão) depende do `__lastOptions` e do
  `APIUserAbortError` criados no Step 1.
- Follow-ups deferidos e registrados no índice: CI (sem remote GitHub hoje),
  testes de frontend (`public/app.js`), testes do builder DOCX em profundidade
  (fonte/estilos), cobertura de `mcp-server.js` (arquivo será removido pelo plano 005).
- Revisor: atenção a testes que passam por acaso com a resposta fixa do mock —
  os novos casos devem usar `__setResponses`/asserts de conteúdo, não só de shape.
