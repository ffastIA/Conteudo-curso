## Why

A lista de modelos da tela (`selecao-de-modelo-na-tela`) é a interseção entre `config/precos-modelos.json` e `config/modelos-capacidades.json`. Hoje só `gpt-4o` e `gpt-4o-mini` têm preço, embora `gpt-4.1` e `gpt-4.1-mini` já estejam na tabela de capacidades. O usuário só tem duas opções reais, e o `gpt-4.1-mini` (US$ 0,40 / 1,60 por 1M) é um degrau intermediário entre o mini atual e o `gpt-4o`. Referência: gap G08 (UX de custo), pelo lado da escolha.

## What Changes

- `config/precos-modelos.json` ganha `gpt-4.1` (entrada 2,00, cache 0,50, saída 8,00) e `gpt-4.1-mini` (entrada 0,40, cache 0,10, saída 1,60), em US$ por 1M de tokens; `vigencia` e `observacao` atualizadas com a fonte e a data.
- A lista `modelosDisponiveis` passa a ter quatro modelos para os papéis sem exigência extra e para a pesquisa (todos com `busca_web`), sem mudança de código.
- Verificação real, com a chave do projeto: uma pesquisa com `gpt-4.1` e uma com `gpt-4.1-mini`, para confirmar que a Responses API aceita `web_search` nos dois e conferir se o `usage` do `gpt-4.1-mini` já inclui o bloco fixo de busca (define `buscaWebBlocoTokensMiniSomar`).
- Testes e documentação ajustados para quatro modelos.

**Non-goals:** modelos de raciocínio (o-series, gpt-5), que rejeitam `max_tokens` e `temperature`; mudar o modelo padrão de qualquer perfil; mudar código de `chamarOpenAI`.

## Capabilities

### New Capabilities
(nenhuma)

### Modified Capabilities
- `model-selection`: o exemplo do requisito "Lista de modelos permitidos" deixa de usar `gpt-4.1` como modelo sem preço, e a lista da pesquisa passa a trazer os quatro modelos.

## Impact

- **Código:** nenhum (`orcamento.js` já calcula a lista a cada consulta).
- **Dados:** `config/precos-modelos.json` (e `.env.encrypted` não muda).
- **Testes:** `tests/integration/selecao-de-modelo.test.js` (lista esperada); demais testes usam tabelas próprias.
- **Docs:** `docs/governanca-de-custo.md`, `PROJECT.md` se citar a lista.
- **Dependências:** nenhuma.
- **Riscos:** preços de fonte secundária (a página oficial não foi lida); a verificação real e a conferência do usuário na página de preços da OpenAI mitigam. Preço desatualizado só distorce o valor mostrado, nunca bloqueia chamada.
