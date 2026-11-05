## Context

O relatório de consumo é calculado a cada consulta pela tabela de preços (`relatorioDeConsumo`). A conversão é uma camada final sobre os valores em US$.

## Goals / Non-Goals

**Goals:** mostrar reais com uma cotação fixa em arquivo, sem alterar o cálculo em US$.
**Non-Goals:** ver Proposal.

## Decisions

- **D1 — Arquivo próprio `config/cambio.json`**, separado da tabela de preços (que é da OpenAI), porque a cotação muda com outra frequência e outra fonte. Lido a cada consulta, como a tabela de preços, então editar o arquivo vale sem reiniciar.
- **D2 — Sem cotação, sem reais:** `usdBrl` ausente, não numérico ou ≤ 0, ou arquivo ausente/inválido, vale como "sem cotação". Nenhum erro, e a resposta mantém o formato anterior.
- **D3 — Conversão no servidor** (`comReais`), nunca na tela, em 2 casas. O US$ não é alterado, e o reais não é gravado em disco.
- **D4 — Cotação única** para todo o consumo, com a data exibida, para o usuário julgar se está desatualizada.
- **D5 — Valor inicial `null`:** o sistema não traz cotação embutida, porque ela envelhece; o usuário informa a dele.

## Risks / Trade-offs

- Cotação velha → data visível na nota de rodapé.
- Valor em reais é aproximação; tetos seguem em US$.

## Migration Plan

Nenhuma: arquivo novo, campos opcionais. Reverter é apagar `config/cambio.json`.

## Open Questions

Nenhuma.
