# Design: docs-dx-claude-md-readme

## Context

Três docs de entrada, três estados: `README.md` (público, errado — 5 etapas/6 endpoints/gpt-4o), `PROJECT.md` (canônico, correto e mantido, mas não auto-carregado por agentes), `CLAUDE.md` (inexistente). O `.gitignore` ignora `.env` e `.claude/`, mas não `CLAUDE.md` nem `.env.example` na raiz — ambos serão versionados normalmente.

## Goals / Non-Goals

**Goals:**
- Uma única fonte de verdade (PROJECT.md) com dois pontos de entrada finos (README para humanos, CLAUDE.md para agentes).
- Setup reprodutível: `cp .env.example .env` + preencher a chave.

**Non-Goals:**
- Gerar a tabela de endpoints por script (follow-up registrado; nesta change ela é regenerada manualmente por grep).
- Reorganizar o PROJECT.md.

## Decisions

1. **CLAUDE.md fino que aponta, não copia.** Alternativa: duplicar as seções relevantes do PROJECT.md. Rejeitada: cria segunda fonte de verdade que diverge — o histórico deste repo mostra exatamente esse modo de falha (README divergiu do código).
2. **Tabela de endpoints regenerada por `grep -nE "^app\.(get|post)\(" server.js` no momento da execução**, não copiada cegamente do plano — o README nasce sincronizado com o código real, e a change fica robusta a drift entre planejamento e execução.
3. **`.env.example` criado do zero, nunca derivado do `.env`.** Elimina por construção qualquer risco de vazamento de chave num arquivo versionado.
4. **README não menciona mcp-server.js** mesmo que a change `remover-mcp-server` ainda não tenha rodado — documentar superfície condenada seria re-desatualizar o README no ciclo seguinte.

## Risks / Trade-offs

- [Tabela de endpoints volta a desatualizar com o tempo] → Mitigação parcial: fonte de regeneração (o grep) documentada no próprio plano; automação fica como follow-up.
- [Ordem relativa com `remover-mcp-server`] → Sem conflito de arquivo (esta change não toca a linha do mcp-server no PROJECT.md); consistência total só com as duas aplicadas.
- [Executor abrir `.env` por engano] → STOP condition explícita no plano: nenhum passo requer ler `.env`.
