# Design: remover-mcp-server

## Context

`mcp-server.js` (289 linhas, raiz) foi criado para o Claude Desktop manipular o projeto via JSON-RPC/stdio e ampliado pela change arquivada `pedagogical-foundation` (tasks 10.1–10.3). Em algum momento as skills mudaram de generators para factories de objetos `{model, system, user}` e o arquivo nunca foi atualizado — as 3 tools de geração quebraram silenciosamente, e o protocolo nunca teve envelope JSON-RPC válido. Referências vivas hoje: apenas a linha do mapa de arquivos em `PROJECT.md:68`. Referências históricas: changes arquivadas (intocáveis).

## Goals / Non-Goals

**Goals:**
- Eliminar código morto que aparenta funcionalidade que não existe.
- Eliminar a superfície `execSync(args.command)` sem guarda.

**Non-Goals:**
- Prover substituto MCP — o Claude Code cobre o caso de uso no fluxo atual.
- Limpar menções históricas em `openspec/changes/archive/`.

## Decisions

1. **Remover em vez de consertar.** Alternativas: (a) consertar protocolo + injetar cliente OpenAI (custo M, exige o SDK oficial como dependência nova — barrado pelo PROJECT.md §8 sem aprovação — ou reimplementação manual do protocolo, que foi exatamente o que falhou); (b) manter como está (risco de alguém confiar nas tools "documentadas"). A remoção custa S, não pode regredir nada que funcione, e o caminho de reconstrução fica registrado.
2. **`git rm` + 1 linha do PROJECT.md, nada mais.** O diff mínimo torna a change trivialmente revisável e reversível (`git revert`).
3. **Guard rail via spec (`mcp-integration`)**: a spec registra como requisito que o repo não expõe MCP server próprio — se alguém quiser reintroduzir, o workflow OpenSpec força uma change explícita revisitando esta decisão.

## Risks / Trade-offs

- [Config do Claude Desktop do usuário ainda apontar para o script] → Fora do repo; aviso explícito ao operador nas notas. Sintoma inofensivo: o Desktop registra erro de conexão (que já acontecia — o handshake nunca completou).
- [Alguém passou a usar o arquivo depois de `e61017a`] → STOP condition: drift check no arquivo + grep de referências vivas antes do `git rm`.
- [Perda do histórico de intenção] → Preservado: o arquivo permanece no histórico git e as changes arquivadas documentam a motivação original.

## Migration Plan

Deploy: nenhum (ferramenta local). Rollback: `git revert` do commit de remoção restaura arquivo e linha do PROJECT.md.
