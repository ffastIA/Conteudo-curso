## ADDED Requirements

### Requirement: Consumo do projeto por modelo, com tarifa e valor
O sistema SHALL expor `GET /api/consumo` com o consumo do projeto agrupado por modelo: chamadas, tokens de entrada, tokens de entrada em cache, tokens de saída, a tarifa vigente de `config/precos-modelos.json` (US$ por 1 milhão de tokens: entrada, entrada em cache e saída) e o valor em US$ calculado a partir dessa tarifa. O valor SHALL ser `((entrada − emCache) × tarifaEntrada + emCache × tarifaEntradaEmCache + saída × tarifaSaída) / 1.000.000`, calculado no servidor a cada consulta com a tabela de preços atual; sem tarifa de entrada em cache, os tokens em cache SHALL ser cobrados pela tarifa de entrada. A resposta SHALL incluir a vigência da tabela de preços e o total do projeto.

#### Scenario: Valor calculado pela tabela
- **WHEN** o projeto usou 100.000 tokens de entrada (30.000 em cache) e 10.000 de saída com `gpt-4o`, cuja tabela é entrada 2,50, entrada em cache 1,25 e saída 10,00
- **THEN** `GET /api/consumo` devolve para `gpt-4o` o valor de US$ 0,3125 (70.000 × 2,50 + 30.000 × 1,25 + 10.000 × 10,00, divididos por 1.000.000) e a tarifa usada

#### Scenario: Dois modelos no mesmo projeto
- **WHEN** o projeto usou `gpt-4o` na pesquisa e `gpt-4o-mini` na redação
- **THEN** a resposta traz uma linha por modelo, cada uma com a sua tarifa, e `totalUsd` é a soma dos valores

#### Scenario: Tarifa alterada depois da geração
- **WHEN** o preço de `gpt-4o` em `config/precos-modelos.json` é alterado depois de o projeto gerar conteúdo
- **THEN** a consulta seguinte recalcula o valor com a tarifa nova e a vigência exibida acompanha a tabela

### Requirement: Busca web e modelo sem preço
O sistema SHALL incluir no relatório as chamadas de busca web (`buscasWeb`) por modelo, valoradas por `buscaWebPorChamadaUsd`, e SHALL somar o bloco fixo de tokens dos modelos mini apenas quando `buscaWebBlocoTokensMiniSomar` for `true`. Um modelo sem preço cadastrado SHALL aparecer com os tokens e com `tarifa` e `valorUsd` nulos, SHALL ser listado em `semPreco` e SHALL NOT entrar em `totalUsd`.

#### Scenario: Linha da busca web
- **WHEN** o projeto fez 31 chamadas de busca web e a tarifa é US$ 0,01 por chamada
- **THEN** o relatório traz `buscaWeb.chamadas = 31` e `buscaWeb.valorUsd = 0.31`, somados ao total

#### Scenario: Modelo sem preço
- **WHEN** o projeto registrou consumo de um modelo ausente da tabela de preços
- **THEN** o modelo aparece com os tokens, `valorUsd` nulo e consta em `semPreco`, e o total considera só os modelos com preço

### Requirement: Consumo por etapa e por dia
O sistema SHALL detalhar o mesmo consumo (tokens e valor em US$ pela tabela) por etapa e por dia, e cada quebra SHALL somar o mesmo total do projeto. Os contadores brutos SHALL ser gravados em `scr/uso.json` por etapa e por dia, por modelo, e o valor em US$ SHALL ser calculado na consulta, sem ser gravado.

#### Scenario: Quebra por etapa
- **WHEN** a pesquisa usou `gpt-4o-mini` e o conteúdo usou `gpt-4o`
- **THEN** `porEtapa` traz o valor de cada etapa calculado com a tarifa do modelo de cada uma, e a soma das etapas é igual a `totalUsd`

#### Scenario: Quebra por dia
- **WHEN** o projeto gerou conteúdo em dois dias diferentes
- **THEN** `porDia` traz os tokens e o valor de cada dia

### Requirement: Conciliação com o gasto registrado
O sistema SHALL devolver o gasto registrado pelo orçamento (soma do gasto por modelo em `uso.json`) ao lado do valor recalculado, com a diferença, e SHALL marcar `divergente` quando a diferença absoluta passar de 1% do valor registrado (mínimo de US$ 0,0001). Quando as chamadas registradas em `uso.json` forem mais numerosas que as detalhadas no consumo (projeto anterior a esta versão), a resposta SHALL marcar `parcial` e informar o gasto registrado ainda não detalhado. A conciliação SHALL NOT alterar o gasto registrado nem os tetos.

#### Scenario: Valores iguais
- **WHEN** a tabela de preços não mudou desde a geração
- **THEN** `divergente` é falso e a diferença é zero ou desprezível

#### Scenario: Divergência por mudança de preço
- **WHEN** o gasto registrado é US$ 1,00 e o recalculado pela tabela atual é US$ 1,30
- **THEN** a resposta traz `diferencaUsd = 0.3` e `divergente = true`, e o gasto usado pelos tetos continua US$ 1,00

#### Scenario: Projeto anterior à change
- **WHEN** o projeto tem `uso.json` com 40 chamadas registradas e nenhum detalhe de consumo
- **THEN** a resposta marca `parcial = true`, o consumo detalhado é zero e o gasto registrado aparece como não detalhado, sem erro

### Requirement: Seção de consumo na interface
A interface SHALL exibir, no painel 💲, a seção "Consumo do projeto" com a tabela por modelo (chamadas, tokens de entrada, em cache e de saída, tarifa por 1 milhão de tokens e valor em US$), a linha da busca web, o total, as quebras por etapa e por dia e os avisos de divergência, de consumo parcial e de modelo sem preço. A interface SHALL exibir os valores recebidos do servidor, sem calcular preço no navegador, e SHALL atualizar a seção sem recarregar a página quando uma etapa terminar.

#### Scenario: Tabela por modelo
- **WHEN** o usuário abre o painel 💲 de um projeto com consumo
- **THEN** a seção lista cada modelo com os tokens, a tarifa e o valor, e o total do projeto

#### Scenario: Projeto sem consumo
- **WHEN** o usuário abre o painel de um projeto sem nenhuma chamada registrada
- **THEN** a seção informa que ainda não há consumo e não exibe tabelas vazias

#### Scenario: Atualização ao fim da etapa
- **WHEN** uma etapa de geração termina com o painel aberto
- **THEN** a seção passa a mostrar os tokens e valores novos
