# Tasks: remover-mcp-server

> Referência detalhada (evidências da auditoria, STOP conditions):
> `plans/005-remover-mcp-server.md`

## 1. Verificação prévia

- [x] 1.1 Rodar `git diff --stat e61017a..HEAD -- mcp-server.js` — se o arquivo mudou desde a auditoria, PARAR e reportar (decisão de remover precisa ser revalidada)
- [x] 1.2 Rodar `grep -rn "mcp-server" --include="*.js" --include="*.json" --include="*.md" . --exclude-dir=node_modules --exclude-dir=openspec --exclude-dir=plans` — únicas ocorrências aceitáveis: `PROJECT.md` (linha do mapa) e o próprio arquivo; qualquer outra → PARAR

## 2. Remoção

- [x] 2.1 `git rm mcp-server.js`
- [x] 2.2 Em `PROJECT.md` (~linha 68): remover a linha `mcp-server.js — MCP server para Claude Desktop (7 tools, JSON-RPC via stdin/stdout)` do bloco §3.3, sem tocar no resto

## 3. Verificação final

- [x] 3.1 `test -f mcp-server.js` → exit 1; `grep -n "mcp-server" PROJECT.md` → nenhum match; `npm test` → verde; `git status` → só a deleção + PROJECT.md
- [x] 3.2 Avisar o operador (no relato de conclusão): se `%APPDATA%\Claude\claude_desktop_config.json` na máquina apontar para o script removido, remover a entrada manualmente — fora do alcance do repo
