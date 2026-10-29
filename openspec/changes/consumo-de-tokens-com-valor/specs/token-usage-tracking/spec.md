## MODIFIED Requirements

### Requirement: Consulta do histórico de tokens do projeto
`GET /api/tokens` SHALL retornar, além do contador global da sessão, o campo `projeto` com o conteúdo de `token_usage.json` quando houver projeto identificável; o contador da interface SHALL exibir o acumulado do projeto ao lado do total da sessão e, quando o projeto tiver consumo valorado, o valor em US$ do projeto obtido de `GET /api/consumo` (`totalUsd`). Sem projeto, ou com `totalUsd` indisponível, o contador SHALL exibir só os tokens, como antes.

#### Scenario: Contador da UI com acumulado do projeto
- **WHEN** um projeto está carregado e `token_usage.json` registra 150.000 tokens totais
- **THEN** a resposta de `GET /api/tokens` inclui `projeto.total.total = 150000` e o contador exibe o valor formatado ao lado do total da sessão

#### Scenario: Contador com o valor em US$
- **WHEN** o projeto carregado tem consumo valorado de US$ 0,64 em `GET /api/consumo`
- **THEN** o contador exibe os tokens e, ao lado, "US$ 0,64"

#### Scenario: Sem projeto
- **WHEN** nenhum projeto está carregado
- **THEN** o contador exibe só os tokens da sessão e nenhum valor em US$
