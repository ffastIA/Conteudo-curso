## ADDED Requirements

### Requirement: Valor em reais por cotação configurada
O sistema SHALL mostrar o consumo também em reais quando `config/cambio.json` trouxer `usdBrl` numérico maior que zero, usando essa cotação única para todo o consumo. `GET /api/consumo` SHALL então acrescentar `cambio` (`usdBrl` e `data`), `totalBrl`, `registradoBrl` e `valorBrl` em cada modelo, na busca web, em cada etapa e em cada dia, calculados no servidor como o valor em US$ vezes a cotação, em 2 casas decimais. Os valores em US$, os tetos e o `uso.json` SHALL NOT mudar, e o valor em reais SHALL NOT ser gravado em disco. O arquivo SHALL ser lido a cada consulta, de modo que editá-lo vale sem reiniciar o servidor. Sem cotação válida (`usdBrl` ausente, não numérico ou menor ou igual a zero, ou arquivo ausente ou inválido) a resposta SHALL manter o formato anterior, sem campos em reais e sem erro. A tela SHALL mostrar o valor em US$ e em reais lado a lado, o valor em reais no contador do cabeçalho e, na nota de rodapé do painel, a cotação e sua data.

#### Scenario: Com cotação
- **WHEN** `config/cambio.json` tem `usdBrl: 5` e o consumo do projeto vale US$ 2,51
- **THEN** `GET /api/consumo` devolve `totalUsd` 2,51, `totalBrl` 12,55 e `cambio` com `usdBrl` 5, e a tela mostra "US$ 2,51 · R$ 12,55"

#### Scenario: Sem cotação
- **WHEN** `usdBrl` é `null`
- **THEN** a resposta não tem `cambio` nem campos `valorBrl` e a tela mostra só US$

#### Scenario: Cotação inválida
- **WHEN** `usdBrl` é 0, negativo ou texto, ou o arquivo não é JSON
- **THEN** o sistema trata como sem cotação, sem erro

#### Scenario: Modelo sem preço
- **WHEN** um modelo não tem preço (valor em US$ nulo)
- **THEN** o valor em reais dele também é nulo e ele continua fora do total

#### Scenario: Cotação editada com o servidor ligado
- **WHEN** o usuário altera `usdBrl` e consulta o painel de novo
- **THEN** os valores em reais refletem a nova cotação sem reiniciar o servidor
