## ADDED Requirements

### Requirement: Verificação manual da API de busca web
O repositório SHALL conter `scripts/smoke-pesquisa.js`, executável manualmente com a chave real, que testa as três variantes de busca (Chat Completions `gpt-4o` + `web_search_options`, Chat Completions `*-search-preview`, Responses API `web_search`) e registra para cada uma: status HTTP, presença de anotações `url_citation`, número de fontes e latência.

#### Scenario: Variante aceita a busca
- **WHEN** uma variante responde 2xx com ao menos uma anotação `url_citation`
- **THEN** o script marca a variante como `web` e imprime nº de fontes e latência

#### Scenario: Variante rejeita o parâmetro
- **WHEN** uma variante responde 400 por parâmetro de busca não suportado
- **THEN** o script marca a variante como `rejeitada` e imprime a mensagem de erro

#### Scenario: Resposta sem citações
- **WHEN** uma variante responde 2xx sem nenhuma `url_citation`
- **THEN** o script marca a variante como `sem_web` (resposta de memória)

### Requirement: Decisão registrada sobre a API de pesquisa
O resultado da verificação SHALL ser registrado em `docs/decisoes/pesquisa-api.md` com a variante escolhida e o valor padrão de `OPENAI_RESEARCH_MODEL`.

#### Scenario: Decisão disponível para a fase seguinte
- **WHEN** a verificação termina
- **THEN** existe o documento de decisão referenciado pela change `pesquisa-web-real`

### Requirement: Linha de base de referência
O projeto SHALL salvar a saída de 2 cursos de referência (um técnico para adultos, um para público infantil) com métricas de tamanho das aulas, nº de fontes, aulas truncadas e nota média da revisão.

#### Scenario: Baseline criada
- **WHEN** os dois cursos são gerados com o código atual
- **THEN** `docs/baseline/<curso>/metricas.json` existe para cada um
