## Context

`modelosPermitidos` (`orcamento.js`) cruza as duas tabelas a cada consulta. O custo casa o modelo por prefixo, com a chave mais longa vencendo, então `gpt-4.1-mini` não é capturado por `gpt-4.1`. `custo.js` identifica modelo mini por `/mini/i`, o que já cobre `gpt-4.1-mini`.

## Goals / Non-Goals

**Goals:** cadastrar os dois modelos com preço e validar o comportamento real da busca web neles.
**Non-Goals:** ver Proposal.

## Decisions

- **D1 — Só dados, sem código.** A lista é derivada das tabelas; adicionar preço basta.
- **D2 — Preços:** `gpt-4.1` 2,00 / 0,50 / 8,00 e `gpt-4.1-mini` 0,40 / 0,10 / 1,60 (entrada / cache / saída, US$ por 1M), conforme agregadores de preço consultados em 2026-11-05, pois a página oficial não foi lida; o usuário confere na página de preços da OpenAI.
- **D3 — Bloco de busca do mini:** `buscaWebBlocoTokensMiniSomar` fica `false` até a chamada real mostrar se o `usage` do `gpt-4.1-mini` inclui o bloco (como ocorre no `gpt-4o-mini`).
- **D4 — Busca web no gpt-4.1:** a capacidade já está como `true` na tabela, mas só a chamada real confirma; se a API recusar, `busca_web` do modelo vira `false` e ele sai da lista da pesquisa.

## Risks / Trade-offs

- Preço de fonte secundária → conferência do usuário; o valor é informativo e a tabela é editável.
- Mudança de modelo no meio do curso mistura estilos → já tratada com aviso em `model-selection`.

## Migration Plan

Nenhuma migração: edição de configuração; reverter é remover as duas entradas.

## Open Questions

Nenhuma.
