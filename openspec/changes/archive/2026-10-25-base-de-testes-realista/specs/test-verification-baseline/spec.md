## ADDED Requirements

### Requirement: Mock da OpenAI com classes de erro reais
O mock da OpenAI SHALL exportar `AuthenticationError`, `BadRequestError` e `RateLimitError` com `status` e `headers`, de modo que `isRetriable` e o tratamento de 429 possam ser testados sem `TypeError`.

#### Scenario: isRetriable com chave inválida
- **WHEN** o mock lança `AuthenticationError`
- **THEN** `isRetriable` retorna `false` sem lançar exceção

#### Scenario: 429 com retry-after
- **WHEN** o mock lança `RateLimitError` com `headers['retry-after']`
- **THEN** o cabeçalho está acessível ao código sob teste

### Requirement: Mock valida parâmetros como a API real
O mock SHALL rejeitar o que a API real rejeita, conforme a regra confirmada na verificação real (`docs/decisoes/pesquisa-api.md`): `web_search_options` em `chat.completions` com `BadRequestError` (400) e modelos `*-search-preview` com `NotFoundError` (404, descontinuados). Para que regressões como a do commit `dbc35cc` sejam detectadas pela suíte, a Responses API SHALL exigir `model` e `input` e recusar parâmetros do chat.

#### Scenario: Modelo sem suporte
- **WHEN** `chat.completions.create` recebe `model: 'gpt-4o'` com `web_search_options`
- **THEN** o mock lança `BadRequestError`

#### Scenario: Modelo descontinuado
- **WHEN** `chat.completions.create` recebe um modelo terminado em `-search-preview`
- **THEN** o mock lança `NotFoundError` (404), como a API real

#### Scenario: Responses API incompleta
- **WHEN** `responses.create` é chamado sem `input`
- **THEN** o mock lança `BadRequestError`

### Requirement: Mock simula a Responses API de busca
O mock SHALL oferecer `responses.create` com a ferramenta `web_search`, retornando texto de saída, anotações `url_citation` e, em streaming, eventos de busca e de texto.

#### Scenario: Busca com citações
- **WHEN** `responses.create` é chamado com `tools: [{ type: 'web_search' }]`
- **THEN** a resposta contém anotações `url_citation`

### Requirement: Truncamento simulável
O mock SHALL permitir respostas com `finish_reason: 'length'` para testar continuação e bloqueio de aula incompleta.

#### Scenario: Resposta cortada
- **WHEN** o teste configura `finish_reason: 'length'`
- **THEN** a chamada retorna esse `finish_reason`

### Requirement: Cobertura acompanha o nível real
O gate de cobertura de linhas SHALL subir para 60% após a change `pesquisa-web-real` e para 70% ao fim do plano, e o trecho de `/api/search` SHALL estar coberto por testes.

#### Scenario: Gate em 60%
- **WHEN** `npm run test:coverage` é executado após a pesquisa-web-real
- **THEN** o gate exige no mínimo 60% de linhas

### Requirement: Verificação real fora da suíte
O repositório SHALL manter `scripts/smoke-pesquisa.js` para verificação com a chave real, executado manualmente antes de releases que toquem a Etapa 2, sem fazer parte da suíte nem da CI.

#### Scenario: Suíte isolada de rede
- **WHEN** `npm test` é executado
- **THEN** nenhuma chamada real à OpenAI é feita
