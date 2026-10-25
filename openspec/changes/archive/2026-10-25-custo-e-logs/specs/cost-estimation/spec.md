## ADDED Requirements

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
Quando `ORCAMENTO_USD` estiver definido, o sistema SHALL abortar a etapa com erro SSE claro caso o custo acumulado somado à estimativa da próxima chamada ultrapasse o teto, e SHALL acionar um disjuntor após falhas consecutivas.

#### Scenario: Teto atingido
- **WHEN** o custo acumulado mais a estimativa excede `ORCAMENTO_USD`
- **THEN** a etapa é abortada com mensagem informando custo e teto

#### Scenario: Sem orçamento definido
- **WHEN** `ORCAMENTO_USD` não está definido
- **THEN** nenhuma trava é aplicada
