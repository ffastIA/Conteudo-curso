# Proposal: aplicar-melhorias-sem-busca-web

## Why

Em produção, um ciclo de melhorias falhou com `HTTP 429 Request too large for gpt-4o-search-preview... TPM: Limit 6000, Requested 6276`. Diferente do rate-limit já tratado pelo sistema (`maxRetries: 6` + pausa de 4s entre aulas, que resolve estouro por *frequência*), este é um estouro de *tamanho de uma única requisição*: o teto de tokens-por-minuto da conta para `gpt-4o-search-preview` (6.000) é menor que uma única chamada de `aplicarMelhoriasSkill` para uma aula densa (conteúdo integral da aula + metodologia + BNCC + melhorias + instruções de patch). Nenhuma quantidade de retry resolve isso — a mesma requisição do mesmo tamanho falha sempre.

Some-se a isso o achado da investigação anterior (`verificacao-mecanica-melhorias`): testes empíricos mostraram que `gpt-4o-search-preview` não é mais confiável que `gpt-4o-mini` para esta tarefa — os dois declaram melhorias como aplicadas sem mudança real no texto. Ou seja, a busca web não trazia vantagem de confiabilidade que justificasse manter um modelo com teto de TPM tão mais restritivo.

## What Changes

- `aplicarMelhoriasSkill` passa a usar `MODEL_ECONOMY` (`gpt-4o-mini`) em vez de `MODEL_RESEARCH` (`gpt-4o-search-preview`), sem `web_search_options`.
- Prompt ajustado para não referenciar pesquisa web como capacidade disponível (system e instrução de fallback sem observações).
- Nenhuma mudança na guarda de truncamento/continuação nem na verificação mecânica (`verificacao-mecanica-melhorias`) — ambas continuam válidas e agora têm muito mais margem de tokens, tornando o acionamento da guarda de truncamento bem mais raro na prática.

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `improvement-application-cycle`: o requisito de acesso à web durante a aplicação de melhorias é removido; a aplicação de melhorias passa a operar sem busca web, com o modelo econômico.

## Non-goals

- Não remove a busca web de outras skills (`pesquisaWebSkill`, `pesquisaFallbackSkill` continuam com `gpt-4o-search-preview` — a Etapa 2 tem finalidade e perfil de uso diferentes).
- Não resolve o teto de TPM da conta para `gpt-4o-search-preview` em si (fica menor pressão sobre ele, já que deixa de ser usado nas melhorias, mas o limite da conta continua o mesmo caso o usuário volte a precisar desse modelo em outro fluxo).
- Não reavalia a decisão anterior sobre confiabilidade de auto-relato (já coberta e mitigada por `verificacao-mecanica-melhorias`).

## Impact

- **Código**: `skills.js` (`aplicarMelhoriasSkill`).
- **Custo**: `gpt-4o-mini` é mais barato que `gpt-4o-search-preview`, e o teto de TPM da conta para modelos econômicos costuma ser muito mais alto — este erro específico deixa de ocorrer nesta etapa.
- **Efeito colateral positivo**: como a skill deixa de ter `web_search_options`, o loop de melhorias passa a usar o ramo de streaming real de `streamSkillToClient` (token a token) em vez do ramo simulado por chunks usado para modelos de busca — a experiência de acompanhamento ao vivo melhora.
- **Spec**: `improvement-application-cycle` — cenário "Acesso à web durante aplicação" removido.
