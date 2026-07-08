# Implementation Plans

Gerados pela skill improve em 2026-07-07, sobre o commit `e61017a`. Execute na
ordem abaixo, salvo indicação contrária nas dependências. Cada executor: leia o
plano inteiro antes de começar, respeite as STOP conditions e atualize sua
linha ao terminar.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Tornar visíveis os erros de pré-condição dos endpoints SSE | P1 | S | — | TODO |
| 002 | Baseline de verificação: gate de cobertura verde + mock JSON + testes críticos | P1 | M | — | TODO |
| 003 | Abortar chamadas OpenAI quando o cliente desconecta | P1 | M | 002 | TODO |
| 004 | CLAUDE.md + .env.example + README atualizado | P2 | S | — | TODO |
| 005 | Remover mcp-server.js (morto e com execSync sem guarda) | P2 | S | — | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (com motivo em 1 linha) | REJECTED (com justificativa em 1 linha)

## Dependency notes

- **003 requer 002**: o teste de abort usa `OpenAI.__lastOptions` e
  `OpenAI.APIUserAbortError`, adicionados ao mock no Step 1 do plano 002.
- 001, 004 e 005 são independentes entre si e dos demais; podem rodar em
  qualquer ordem/paralelo (001 e 003 tocam `server.js` — evitar simultâneos
  para não gerar conflito de merge).
- 004 e 005 tocam ambos em documentação: 004 reescreve `README.md` (sem
  mencionar mcp-server); 005 remove a linha do mcp-server do `PROJECT.md`.
  Sem conflito de arquivo, mas o resultado só fica consistente com os dois aplicados.

## Findings considered and rejected

Registrado para não ser re-auditado nas próximas rodadas:

- **Imagens de slides sem prefixo `data:` (server.js:2250)**: falso positivo —
  a própria mensagem de erro do PptxGenJS documenta `'image/png;base64,...'`
  (sem `data:`) como formato esperado; o código está correto.
- **Advisory moderado do `uuid` v9**: caminho vulnerável (`buf` em v3/v5/v6)
  não é usado — o repo só chama `uuidv4()` sem argumentos. Ruído de audit.
- **Jaccard O(n²) re-tokenizando aulas**: real, mas custo limitado pelo cap de
  120 palavras e N de aulas em dígito único; não vale plano isolado.
- **`fs.*Sync` em handlers**: real, mas irrelevante com concorrência ~1
  (ferramenta local mono-usuário); só reavaliar se o app for hospedado.
- **`extractLessonBlock`/`replaceLessonBlock` indexam por posição, não pelo
  número capturado da aula (server.js:149-168)**: latente — só dispara com
  plano de aula importado com headings fora de ordem. Nota de investigação,
  não de correção.
- **Migração Express 4→5**: custo maior que o benefício enquanto o v4 tiver
  suporte.

## Findings confirmed but not selected this run

Vetados e válidos; o operador optou por não os planejar em 2026-07-07:

- **#1 Endurecer fronteira de rede local** (bind `127.0.0.1`, `SameSite` no
  cookie, checagem de `Origin`, limites do multer) — o achado de segurança de
  maior alavancagem da auditoria; `server.js:3280, :103, :26, :1823`.
- **#7 Paralelizar as 4 chamadas do PPC** com `Promise.all`
  (`server.js:1057-1077`) — validar rate limit antes.
- **#8 Casos de borda do merge de melhorias** (aula sem seções detectáveis
  vira apêndice duplicado, `server.js:377-410`; linha "Aula N ..." engolida
  pelo parser, `:221-231`) — fazer após 002 (exige caracterização).
- **#9 Lint/`checkJs`** (`jsconfig.json` + ESLint).
- **#10 Split do `server.js`** (3.312 linhas) em `docx.js`/`persistence.js`/
  `merge.js`/`sse.js` — fazer somente após 002.
- **#11 Migração SDK `openai` v4→v6** (resolve advisory HIGH transitivo do
  `form-data`; alternativa mínima: `npm audit fix`) — fazer somente após 002.
- **Direção A**: estimativa de custo pré-execução (gap G08).
- **Direção B**: generalizar timeout/retry da pesquisa web para todas as
  etapas (gap G05) — combina com a infraestrutura de signals do plano 003.
- **Direção C**: reconciliar registro OpenSpec (`bncc-alignment-step` consta
  "sem implementação" mas está entregue e testado; specs citam `MODEL_SEARCH`
  inexistente — código usa `MODEL_RESEARCH`).

## Escopo da auditoria de 2026-07-07

Auditados: `server.js`, `skills.js`, `mcp-server.js`, `bncc-data.js`,
`public/app.js`, `tests/`, `jest.config.js`, docs (`README.md`, `PROJECT.md`,
`openspec/specs/`), deps (`npm audit`/`npm outdated`), nível `standard`.
**Não auditados**: `public/index.html`/`style.css` em profundidade,
`bncc-data.js` conteúdo pedagógico, `openspec/changes/archive/` (histórico),
`scripts/` (só superficialmente), frontend em execução real (sem testes de UI).
