## MODIFIED Requirements

### Requirement: Consulta e ajuste do orçamento
O sistema SHALL expor `GET /api/orcamento` com os tetos, o gasto por escopo, etapa e modelo, o saldo restante, o perfil ativo, os alertas, o estado de pausa ou de disjuntor, a calibração e, por papel, o modelo efetivo e a origem (`modelos` e `modelosOrigem`), a escolha do usuário (`modelosEscolhidos`) e os modelos permitidos (`modelosDisponiveis`), e `POST /api/orcamento` para ajustar tetos, trocar o perfil, escolher o modelo de cada papel (`modelos`, papel → modelo, `null` remove a escolha) e registrar a decisão após uma pausa ou um disparo do disjuntor. Os valores SHALL ser validados (números positivos; perfil conhecido; papel conhecido e modelo da lista permitida) e valores inválidos SHALL ser recusados com HTTP 400 e uma mensagem. Nenhuma das respostas SHALL conter chaves de API ou caminhos fora do projeto.

#### Scenario: Consulta
- **WHEN** a interface faz `GET /api/orcamento` com `ORCAMENTO_MAX_USD=5` e gasto de US$ 1,20
- **THEN** a resposta traz `projeto.tetoUsd = 5`, `projeto.gastoUsd = 1.2` e `projeto.restanteUsd = 3.8`

#### Scenario: Ajuste válido
- **WHEN** a interface envia `POST /api/orcamento` com um novo teto de projeto de US$ 10
- **THEN** o teto passa a valer, é gravado em `uso.json` e o estado de pausa é limpo

#### Scenario: Ajuste inválido
- **WHEN** a interface envia um teto negativo ou um perfil desconhecido
- **THEN** a resposta é HTTP 400 com a mensagem do erro e nada é alterado

#### Scenario: Escolha de modelo válida
- **WHEN** a interface envia `POST /api/orcamento` com `{ "modelos": { "pesquisa": "gpt-4o-mini" } }`
- **THEN** a escolha é gravada em `uso.json`, a resposta traz `modelosEscolhidos.pesquisa = "gpt-4o-mini"` e `modelosOrigem.pesquisa = "usuario"`

### Requirement: Painel e confirmação na interface
A interface SHALL exibir um painel com o saldo restante, o gasto por etapa, o perfil ativo e os alertas, atualizado pelos eventos SSE `alerta_orcamento`, `pausado_orcamento` e `perfil_alterado`, e uma área "Modelos" com um seletor por papel (opção "Padrão do perfil" mais os modelos permitidos), que indica o modelo efetivo e se ele está fixado pelo usuário e exibe o aviso de mistura de modelos quando o servidor o enviar. Antes de iniciar uma etapa pesada, quando a faixa máxima da estimativa for maior que o saldo restante de algum escopo, a interface SHALL pedir a confirmação do usuário, que pode cancelar, aumentar o teto ou continuar.

#### Scenario: Confirmação por estimativa acima do saldo
- **WHEN** o saldo restante é US$ 0,50 e a estimativa máxima da etapa de conteúdo é US$ 2,00
- **THEN** a interface exibe a confirmação antes de iniciar a etapa e nada é gerado até a resposta do usuário

#### Scenario: Estimativa dentro do saldo
- **WHEN** a estimativa máxima cabe no saldo restante
- **THEN** nenhuma confirmação extra é exibida

#### Scenario: Painel atualizado em tempo real
- **WHEN** um `alerta_orcamento` chega por SSE durante a geração
- **THEN** o painel destaca o escopo em alerta sem recarregar a página

#### Scenario: Seletores de modelo
- **WHEN** o usuário abre o painel de um projeto sem escolha de modelo
- **THEN** cada papel mostra "Padrão do perfil" selecionado, o modelo efetivo e as opções permitidas
