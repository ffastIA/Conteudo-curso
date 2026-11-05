## 1. Backend

- [x] 1.1 `config/cambio.json` com `usdBrl: null`, `data` e observação
- [x] 1.2 `custo.js`: `carregarCambio` e `comReais`; `relatorioDeConsumo` aceita a cotação; exportar
- [x] 1.3 `server.js`: `GET /api/consumo` passa a cotação lida do arquivo

## 2. Interface

- [x] 2.1 `public/orcamento.js`: "US$ · R$" nos valores, no contador e na nota de rodapé

## 3. Testes e documentação

- [x] 3.1 `tests/unit/custo-consumo.test.js`: sem cotação, com cotação, modelo sem preço, `carregarCambio` válido e inválidos
- [x] 3.2 `docs/governanca-de-custo.md` (e README se citar o arquivo): como informar a cotação
- [x] 3.3 `npm test` e `openspec validate --all` verdes
