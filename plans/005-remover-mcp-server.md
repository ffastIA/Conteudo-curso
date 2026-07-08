# Plan 005: Remover o mcp-server.js (morto, quebrado e com superfície de execução arbitrária)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e61017a..HEAD -- mcp-server.js PROJECT.md`
> Se `mcp-server.js` mudou desde `e61017a` (alguém tentou consertá-lo?), STOP —
> a decisão de remover foi tomada sobre o estado em `e61017a`.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (o arquivo nunca funcionou como MCP server; nada no app o importa)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `e61017a`, 2026-07-07

## Why this matters

Auditoria em `e61017a` confirmou por leitura direta que `mcp-server.js` (289
linhas) está morto E é um risco:

1. **Nunca funcionou como MCP server.** As respostas não têm o envelope
   JSON-RPC 2.0 (`jsonrpc: "2.0"`, `id`) — `mcp-server.js:282` faz
   `console.log(JSON.stringify(response))` com payloads crus — e não há
   handshake `initialize`. Um cliente MCP real (Claude Desktop) não consegue
   sequer completar a conexão.
2. **3 das 8 tools sempre lançam `TypeError`.** `gerar_metodologia`
   (`:228`), `avaliar_qualidade` (`:236`) e `gerar_ppc` (`:245-251`) fazem
   `for await (const chunk of metodologiaSkill(args))`, mas as skills de
   `skills.js` retornam objetos planos `{model, system, user}` — não são
   iteráveis. O arquivo nunca importa o cliente OpenAI, então mesmo "consertado"
   não geraria nada.
3. **Superfície de risco sem uso.** A tool `execute_command` (`:212-224`) roda
   `execSync(args.command)` com qualquer string recebida — execução arbitrária
   de comando para qualquer processo que fale com o stdio deste script.
4. **Redundante.** As tools que funcionariam (`read_file`, `write_file`,
   `list_directory`, `get_project_info`) duplicam o que o Claude Code (usado
   neste repo) já faz nativamente e com permissões.

Decisão do advisor (registrada na auditoria de 2026-07-07): **remover**, não
consertar. Consertar custaria M (protocolo + cliente OpenAI + testes) para uma
superfície sem uso demonstrável.

## Current state

- `mcp-server.js` — o arquivo a remover (raiz do repo, 289 linhas, shebang
  `#!/usr/bin/env node`, começa com o comentário "MCP Server para Claude Desktop").
- Referências existentes a `mcp-server` no repo (grep em `e61017a`):
  - `PROJECT.md:68` — linha do mapa de arquivos:
    `mcp-server.js      — MCP server para Claude Desktop (7 tools, JSON-RPC via stdin/stdout)`
  - `openspec/changes/archive/2026-06-24-pedagogical-foundation/tasks.md:75-77`,
    `proposal.md:39` e `openspec/changes/archive/2026-07-04-propagar-modalidade-curso/proposal.md:45`
    — **histórico arquivado; NÃO tocar.**
- `package.json` — nenhum script referencia `mcp-server` (verificado).
- Nenhum teste referencia `mcp-server` (verificado; `jest.config.js` nem o
  inclui em `collectCoverageFrom`).
- Nenhum `.mcp.json` ou `claude_desktop_config.json` existe no repo (verificar
  novamente no Step 1 — configuração do Claude Desktop fica fora do repo, em
  `%APPDATA%\Claude\claude_desktop_config.json` na máquina do usuário; está
  fora do alcance deste plano, ver Maintenance notes).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Testes | `npm test` | 13 suites, todos passam |
| Buscar referências | `grep -rn "mcp-server" --include="*.js" --include="*.json" --include="*.md" . --exclude-dir=node_modules --exclude-dir=openspec --exclude-dir=plans` | ver Step 1 |

## Scope

**In scope**:
- `mcp-server.js` — deletar.
- `PROJECT.md` — remover a linha 68 (apenas ela).

**Out de scope** (NÃO tocar):
- `openspec/changes/archive/**` — registro histórico; menções a mcp-server lá
  são fatos do passado, não referências vivas.
- `skills.js` — as skills importadas pelo mcp-server são usadas pelo
  `server.js`; nada nelas muda.
- `README.md` — o plano 004 já o reescreve sem mencionar mcp-server.

## Git workflow

- Branch: `advisor/005-remover-mcp-server`.
- Commit em português, imperativo. Sugestão: `Remove mcp-server.js morto
  (protocolo incompleto, tools quebradas e execSync sem guarda)`.
- NÃO fazer push nem abrir PR sem instrução do operador.

## Steps

### Step 1: Confirmar que não há referências vivas

Rodar o grep de referências (tabela acima).

**Verify**: as únicas ocorrências fora de `openspec/changes/archive/` e
`plans/` são `PROJECT.md` (linha do mapa) e o próprio `mcp-server.js`.
Se aparecer QUALQUER outra (um script novo, um `.mcp.json`, um import) → STOP.

### Step 2: Deletar o arquivo e a linha do mapa

1. `git rm mcp-server.js`
2. Em `PROJECT.md`, remover a linha
   `mcp-server.js      — MCP server para Claude Desktop (7 tools, JSON-RPC via stdin/stdout)`
   (linha ~68, dentro do bloco de código do §3.3). Não renumerar nem tocar no resto.

**Verify**: `test -f mcp-server.js` → exit 1;
`grep -n "mcp-server" PROJECT.md` → nenhum match.

### Step 3: Sanidade

**Verify**: `npm test` → todos passam (nenhum teste dependia do arquivo);
`git status` mostra somente a deleção + PROJECT.md.

## Test plan

Sem testes novos — a remoção é coberta pela suíte existente continuar verde
(nada importava o arquivo) e pelos greps dos steps.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test -f mcp-server.js` → exit 1 (arquivo não existe).
- [ ] `grep -rn "mcp-server" --include="*.js" --include="*.json" . --exclude-dir=node_modules` → nenhum match.
- [ ] `grep -n "mcp-server" PROJECT.md` → nenhum match.
- [ ] `npm test` exit 0.
- [ ] `git status` limpo fora do escopo (deleção + 1 linha de PROJECT.md).
- [ ] Linha deste plano atualizada em `plans/README.md`.

## STOP conditions

Stop and report back (do not improvise) if:

- O Step 1 encontrar uma referência viva fora do esperado — alguém pode ter
  passado a usar o arquivo depois de `e61017a`.
- `mcp-server.js` tiver mudado desde `e61017a` (drift check) — a decisão
  "remover em vez de consertar" precisa ser revalidada pelo operador.
- `npm test` falhar após a remoção (não deveria — nada o importa; se falhar,
  algo mudou).

## Maintenance notes

- **Aviso ao operador (fora do repo)**: se o `claude_desktop_config.json` da
  máquina ainda apontar para este script, remover a entrada manualmente —
  o executor não deve tocar em arquivos fora do repositório.
- **Se um MCP server for desejado no futuro**: reimplementar do zero com o SDK
  oficial `@modelcontextprotocol/sdk` (handshake, envelopes e stdio corretos),
  reusando as skills de `skills.js` + um helper `runSkill(skill)` que chame a
  API OpenAI a partir do objeto `{model, system, user}` — e SEM uma tool de
  shell arbitrário. Lembrete: PROJECT.md §8 exige aprovação para dependência nova.
- Revisor: conferir que `openspec/changes/archive/` não foi tocado.
