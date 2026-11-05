## Why

O consumo do projeto aparece só em US$ (`consumo-de-tokens-com-valor`). Para quem acompanha o orçamento em reais, a conta exige converter de cabeça. A cotação não deve vir de serviço externo (sem dependência nem chamada de rede nova) nem ser digitada a cada uso: fica fixada em um arquivo de configuração, editável e versionado. Referência: gap G08 (UX de custo).

## What Changes

- Novo `config/cambio.json` com `usdBrl` (reais por US$ 1,00), `data` da cotação e uma observação. Entra com `usdBrl: null` na proposta; o usuário estimou 5,2 em 2026-11-05: sem cotação válida, nada muda na tela.
- Com cotação válida, `GET /api/consumo` acrescenta `cambio` (`usdBrl`, `data`), `totalBrl`, `registradoBrl` e `valorBrl` em cada modelo, na busca web, em cada etapa e em cada dia. Os valores em US$ não mudam.
- O painel 💲 mostra "US$ X · R$ Y" nos valores e a nota de rodapé cita a cotação e a data; o contador do cabeçalho mostra também o valor em reais.

**Non-goals:** buscar a cotação em serviço externo; guardar reais em `uso.json`; tetos ou alertas em reais (continuam em US$); outras moedas; cotação por dia (uma cotação única vale para todo o consumo).

## Capabilities

### New Capabilities
(nenhuma)

### Modified Capabilities
- `token-cost-report`: novo requisito de valor em reais por cotação configurada.

## Impact

- **Código:** `custo.js` (`carregarCambio`, `comReais`, parâmetro `cambio` em `relatorioDeConsumo`), `server.js` (rota `/api/consumo`), `public/orcamento.js`.
- **Dados:** novo `config/cambio.json`; `uso.json` e os tetos não mudam.
- **APIs:** campos novos e opcionais em `GET /api/consumo`; formato antigo preservado sem cotação.
- **Dependências:** nenhuma.
- **Riscos:** cotação desatualizada distorce o valor em reais (a tela mostra a data da cotação); a conversão é informativa, a cobrança é em dólar.
