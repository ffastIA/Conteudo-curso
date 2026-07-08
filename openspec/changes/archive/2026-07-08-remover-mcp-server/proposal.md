# Proposal: remover-mcp-server

## Why

Auditoria de 2026-07-07 (commit `e61017a`) confirmou por leitura direta que `mcp-server.js` nunca funcionou como MCP server — as respostas não têm envelope JSON-RPC 2.0 (`jsonrpc`/`id`) nem handshake `initialize`, então o Claude Desktop não completa a conexão; e 3 das 8 tools (`gerar_metodologia`, `avaliar_qualidade`, `gerar_ppc`) sempre lançam `TypeError` (iteram com `for await` objetos planos retornados pelas skills; o arquivo nem importa o cliente OpenAI). Pior: a tool `execute_command` roda `execSync` com qualquer string recebida — superfície de execução arbitrária de comando sem nenhum uso que a justifique. As tools restantes duplicam o que o Claude Code (usado no desenvolvimento deste repo) já faz nativamente.

## What Changes

- **BREAKING** (nominal): remoção do arquivo `mcp-server.js`. Na prática nada quebra — o arquivo nunca completou uma conexão MCP e nada no repo o importa (verificado: sem referência em `package.json`, testes ou código).
- Remoção da linha correspondente no mapa de arquivos do `PROJECT.md §3.3` (linha ~68).
- Registro (nas notas da change) de como reconstruir um MCP server correto no futuro, se desejado: SDK oficial `@modelcontextprotocol/sdk` + helper `runSkill(skill)` sobre as skills existentes, sem tool de shell arbitrário.

## Non-goals

- Não consertar o servidor MCP (decisão registrada: custo M para superfície sem uso demonstrável; remover custa S e elimina o risco).
- Não tocar em `openspec/changes/archive/**` (menções históricas ao mcp-server são registro, não referência viva).
- Não alterar `skills.js` (as skills importadas pelo arquivo removido continuam usadas pelo `server.js`).
- Não editar a configuração do Claude Desktop na máquina do usuário (`%APPDATA%\Claude\claude_desktop_config.json`) — fora do repo; fica como aviso ao operador.

## Capabilities

### New Capabilities
- `mcp-integration`: postura do repositório quanto a integração agêntica — o projeto NÃO expõe servidor MCP próprio; integrações usam o Claude Code diretamente. (Spec registra a ausência como requisito verificável, prevenindo reintrodução acidental do padrão quebrado.)

### Modified Capabilities

(vazio — nenhuma capability existente cobre o mcp-server; ele nunca esteve nas specs canônicas)

## Impact

- **Código**: `mcp-server.js` deletado (289 linhas); `PROJECT.md` (1 linha).
- **APIs/dependências**: nenhuma — nada consome o arquivo.
- **Segurança**: elimina a superfície `execSync` sem guarda.
- **Referência detalhada**: `plans/005-remover-mcp-server.md`.
