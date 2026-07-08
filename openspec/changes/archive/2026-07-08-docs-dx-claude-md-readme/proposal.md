# Proposal: docs-dx-claude-md-readme

## Why

O README está concretamente errado (descreve 5 etapas, 6 endpoints e modelo `gpt-4o`; o app tem etapas 0–8 com slides, ~25 rotas e usa `gpt-4o-mini`) — doc desatualizada é pior que ausente. Além disso, o repo é desenvolvido via agentes (workflow OpenSpec) mas não tem `CLAUDE.md` na raiz, então o guia canônico `PROJECT.md` não é carregado automaticamente em cada sessão; e a única variável de ambiente obrigatória (`OPENAI_API_KEY`) não tem `.env.example`.

## What Changes

- Criar `CLAUDE.md` na raiz: arquivo fino (≤ 40 linhas) apontando para `PROJECT.md`, com comandos verificados (`npm test`, `test:coverage`, `node server.js`) e o resumo das regras §8 e non-goals §10.
- Criar `.env.example` com placeholder vazio (`OPENAI_API_KEY=`) — nunca copiar valor do `.env`.
- Reescrever `README.md`: pipeline real (etapas 0–8), tabela de ~25 endpoints regenerada por grep das rotas, modelos corretos (`gpt-4o-mini` + `gpt-4o-search-preview`), estrutura de pastas real, persistência dupla documentada.
- Corrigir a contagem "17 endpoints" no `PROJECT.md §3.3`.

## Non-goals

- Não alterar nenhum arquivo `.js` — zero código.
- Não editar `PROJECT.md` além da linha da contagem (é o doc canônico com dono humano).
- Não mencionar `mcp-server.js` no novo README (a change `remover-mcp-server` o elimina; a linha dele no PROJECT.md é removida por aquela change).
- Não corrigir o drift `MODEL_SEARCH`→`MODEL_RESEARCH` nas specs (registrado como achado DOCS-02, fora desta change).
- Não abrir/ler `.env` em nenhuma hipótese.

## Capabilities

### New Capabilities
- `project-documentation`: exatidão mínima da documentação de entrada do projeto — README fiel ao pipeline/endpoints reais, `.env.example` presente e sem segredos, `CLAUDE.md` apontando para o guia canônico.

### Modified Capabilities

(vazio — nenhum comportamento do sistema muda)

## Impact

- **Arquivos**: `CLAUDE.md` (novo), `.env.example` (novo), `README.md` (reescrito), `PROJECT.md` (1 linha).
- **Código/APIs/dependências**: nenhum impacto.
- **DX**: sessões de agente passam a carregar contexto automaticamente; onboarding humano deixa de ser enganado pelo README.
- **Referência detalhada**: `plans/004-dx-claude-md-env-example-readme.md` (inclui a tabela de rotas base e o esqueleto do CLAUDE.md).
