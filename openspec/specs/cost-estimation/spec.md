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

