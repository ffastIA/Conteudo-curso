# cost-estimation Specification

## Purpose
TBD - created by archiving change custo-e-logs. Update Purpose after archive.
## Requirements
### Requirement: Estimativa prévia de custo
Antes de iniciar etapas pesadas (pesquisa por módulo, conteúdo, revisão), o sistema SHALL calcular e exibir na UI a estimativa de tokens e de custo usando a tabela de preços configurável.

#### Scenario: Estimativa exibida
- **WHEN** o usuário abre a Etapa 5 de um curso de 10 aulas
- **THEN** a UI mostra tokens e custo estimados antes de iniciar a geração

### Requirement: Soma de custo por projeto
O sistema SHALL somar o custo real por projeto a partir do `usage` de cada resposta, usando os mesmos números enviados à observabilidade.

#### Scenario: Soma consistente
- **WHEN** uma etapa termina
- **THEN** o custo acumulado do projeto aumenta pelo custo calculado do `usage` das chamadas da etapa

### Requirement: Trava de orçamento opcional
Quando algum teto de orçamento estiver definido (`ORCAMENTO_MAX_USD`, `ORCAMENTO_DIA_MAX_USD` ou `ORCAMENTO_ETAPA_MAX_USD`; `ORCAMENTO_USD` é aceita como sinônimo de `ORCAMENTO_MAX_USD`), o sistema SHALL barrar a chamada que ultrapassaria o teto, conforme `cost-budget` (reserva antes, acerto depois, alerta, pausa e retomada), e SHALL acionar um disjuntor após falhas consecutivas da API, conforme `cost-circuit-breaker`. Sem nenhum teto definido, nenhuma trava de orçamento SHALL ser aplicada.

#### Scenario: Teto atingido
- **WHEN** o custo acumulado mais a estimativa excede o teto de um escopo
- **THEN** a chamada não é feita, a etapa pausa com o evento `pausado_orcamento` informando custo e teto, e o trabalho já salvo é preservado

#### Scenario: Sem orçamento definido
- **WHEN** nenhum teto está definido
- **THEN** nenhuma trava é aplicada

### Requirement: Estimativa calibrada com o uso real
O sistema SHALL calibrar a estimativa por etapa multiplicando-a por um fator igual à média móvel da razão entre o custo real e o estimado, atualizada a cada chamada acertada, guardada em `scr/uso.json` e limitada à faixa de 0,5× a 3×. A reserva de orçamento SHALL somar ao estimado calibrado uma margem de segurança configurável (`ORCAMENTO_MARGEM_PCT`, padrão 15). A estimativa prévia (`GET /api/estimativa`) SHALL usar o mesmo fator e SHALL continuar rotulada como estimativa e apresentada em faixa.

#### Scenario: Fator ajustado pelo uso
- **WHEN** as últimas chamadas de uma etapa custaram em média 20% a mais que o estimado
- **THEN** a estimativa seguinte dessa etapa é multiplicada por um fator próximo de 1,2

#### Scenario: Fator limitado
- **WHEN** uma chamada atípica custa dez vezes o estimado
- **THEN** o fator de calibração não passa de 3×

#### Scenario: Margem na reserva
- **WHEN** a estimativa calibrada de uma chamada é US$ 0,10 e a margem é 15%
- **THEN** a reserva é de US$ 0,115

#### Scenario: Estimativa prévia coerente
- **WHEN** o usuário consulta `GET /api/estimativa?etapa=conteudo`
- **THEN** a faixa usa o fator calibrado da etapa e a resposta mantém o rótulo de estimativa

### Requirement: Tarifa da busca web configurável
O custo de uma chamada de pesquisa SHALL poder incluir a cobrança por chamada da ferramenta de busca web, definida em `config/precos-modelos.json` (`buscaWebPorChamadaUsd`). O valor padrão SHALL ser 0. Enquanto o valor for 0, o painel de orçamento SHALL avisar que a tarifa da busca web não está configurada e que o custo da pesquisa pode estar subestimado.

#### Scenario: Tarifa configurada
- **WHEN** `buscaWebPorChamadaUsd` vale 0,01 e a pesquisa de um módulo faz 4 chamadas de busca
- **THEN** o custo da pesquisa soma US$ 0,04 além do custo dos tokens

#### Scenario: Tarifa não configurada
- **WHEN** `buscaWebPorChamadaUsd` vale 0
- **THEN** o custo soma só os tokens e o painel exibe o aviso de custo possivelmente subestimado

#### Scenario: Mesma conta no Langfuse
- **WHEN** a tarifa está configurada
- **THEN** o custo enviado ao Langfuse e o do painel incluem o mesmo valor

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

