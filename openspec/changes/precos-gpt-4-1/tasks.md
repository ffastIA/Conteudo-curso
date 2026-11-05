## 1. Preços

- [x] 1.1 `config/precos-modelos.json`: adicionar `gpt-4.1` e `gpt-4.1-mini`; atualizar `vigencia` e a `observacao` (fonte e data)

## 2. Testes e documentação

- [x] 2.1 `tests/integration/selecao-de-modelo.test.js`: lista esperada com os quatro modelos; teste de que `gpt-4.1-mini` não casa com a tarifa de `gpt-4.1`
- [x] 2.2 `docs/governanca-de-custo.md` e `PROJECT.md`: citar os quatro modelos; atualizar contagens
- [x] 2.3 `npm test` e `openspec validate --all` verdes

## 3. Verificação real (gasto autorizado)

- [x] 3.1 Uma pesquisa com `gpt-4.1` e uma com `gpt-4.1-mini` pela Responses API; registrar se a busca web funciona e se o `usage` do mini inclui o bloco de busca
- [x] 3.2 Ajustar `buscaWebBlocoTokensMiniSomar` e `modelos-capacidades.json` conforme o resultado

Resultado da verificação real (2026-11-05, custo total ≈ US$ 0,06): `gpt-4.1-mini` → 1 busca, entrada 8.174, saída 91; `gpt-4.1` → 1 busca, entrada 17.382, saída 143. Ambos aceitam `web_search`; o mini já inclui o bloco de busca no `usage`, então `buscaWebBlocoTokensMiniSomar` segue `false` e `modelos-capacidades.json` não muda.
