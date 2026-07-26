## Purpose

Documentar a decisão de não manter um servidor MCP próprio no repositório,
usando o Claude Code diretamente para integração agêntica com o projeto.

## Requirements

### Requirement: Repositório sem servidor MCP próprio
O repositório SHALL NOT conter servidor MCP próprio nem referências vivas a `mcp-server` em código, configuração ou documentação corrente (registro histórico em `openspec/changes/archive/` é permitido). Integração agêntica com o projeto usa o Claude Code diretamente. A reintrodução de um MCP server SHALL passar por nova change OpenSpec e usar o SDK oficial `@modelcontextprotocol/sdk`, sem tool de execução arbitrária de shell.

#### Scenario: Ausência do arquivo e de referências vivas
- **WHEN** se executa `test -f mcp-server.js` e `grep -rn "mcp-server" --include="*.js" --include="*.json" . --exclude-dir=node_modules`
- **THEN** o arquivo não existe e o grep não retorna nenhuma ocorrência

#### Scenario: Documentação corrente sem menção
- **WHEN** `grep -n "mcp-server" PROJECT.md README.md` é executado
- **THEN** nenhuma ocorrência é encontrada

#### Scenario: Suíte permanece verde após a remoção
- **WHEN** `npm test` é executado após a remoção
- **THEN** todas as suítes passam (nenhum teste dependia do arquivo)
