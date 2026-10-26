## ADDED Requirements

### Requirement: Desconto de tokens de entrada em cache
O cálculo do custo de uma chamada SHALL cobrar os tokens de entrada atendidos em cache pelo preço `entradaEmCache` do modelo, definido em `config/precos-modelos.json` (por milhão de tokens), e os demais tokens de entrada pelo preço de entrada. Para um modelo sem `entradaEmCache` configurado, todos os tokens de entrada SHALL ser cobrados pelo preço de entrada. A estimativa prévia SHALL NOT presumir cache: o desconto só aparece no custo real, e a calibração (média móvel de real sobre estimado) absorve a diferença.

#### Scenario: Cobrança com cache
- **WHEN** uma chamada ao `gpt-4o-mini` tem 10.000 tokens de entrada, dos quais 8.000 em cache, e 1.000 de saída, com entrada a US$ 0,15, entrada em cache a US$ 0,075 e saída a US$ 0,60 por milhão
- **THEN** o custo é 2.000 × 0,15 + 8.000 × 0,075 + 1.000 × 0,60 dividido por 1.000.000, isto é, US$ 0,0015

#### Scenario: Modelo sem preço de cache
- **WHEN** o modelo não tem `entradaEmCache` no arquivo de preços
- **THEN** todos os tokens de entrada são cobrados pelo preço de entrada

#### Scenario: Estimativa prévia
- **WHEN** a estimativa prévia de uma etapa é calculada
- **THEN** ela não aplica desconto de cache

### Requirement: Bloco fixo de tokens da busca nos modelos mini
O sistema SHALL poder somar ao custo de uma chamada de busca web em modelo mini (`gpt-4o-mini`, `gpt-4.1-mini`) o bloco fixo de tokens de entrada que a OpenAI cobra por chamada, configurado em `config/precos-modelos.json` (`buscaWebBlocoTokensMini`, 8.000 pela página de preços de 2026-10-25), somente enquanto o `usage` da resposta não o incluir. A ativação SHALL depender de verificação com uma chamada real, registrada na documentação.

#### Scenario: Pesquisa com modelo mini
- **WHEN** a pesquisa usa um modelo mini e o `usage` não inclui o bloco fixo
- **THEN** o custo da chamada soma 8.000 tokens de entrada ao preço de entrada do modelo, além da tarifa por chamada

#### Scenario: Pesquisa com gpt-4o
- **WHEN** a pesquisa usa `gpt-4o`
- **THEN** nenhum bloco fixo é somado
