## Why

A spec canônica `web-search-resilience` descreve o comportamento anterior à change `pesquisa-web-real`: modelo `gpt-4o-search-preview` (descontinuado), timeout de 45 s, uma única retentativa de 30 s e fallback automático para `gpt-4o-mini`. O código atual usa a Responses API com `web_search` e `OPENAI_RESEARCH_MODEL`, timeout de 90 s, até 2 retentativas de 60 s, e só cai para o modelo sem busca por decisão explícita do usuário, com selo.

## What Changes

- Requisito de timeout: 90 s na primeira tentativa; modelo vindo de `OPENAI_RESEARCH_MODEL` (padrão `gpt-4o`) pela Responses API com `web_search`.
- Requisito de retry: até 2 novas tentativas com timeout de 60 s e aviso `Reconectando...`; HTTP 400 vira "configuração de pesquisa inválida", sem retry.
- Requisito de fallback automático removido e substituído por "Falha persistente não grava pesquisa", em que o fallback só roda por decisão do usuário.
- Requisito de orientação ao usuário: acrescenta os botões "Tentar novamente" e "Continuar sem pesquisa web".

## Non-goals

- Nenhuma mudança de código: a spec passa a descrever o que o código já faz.

## Impact

- Apenas `openspec/specs/web-search-resilience/spec.md` (via delta). Há sobreposição intencional e limitada com `web-research`, que detalha estados e selo.
