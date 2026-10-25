## Purpose

Estabelecer e manter uma base mínima de testes automatizados: gate de
cobertura, mock da OpenAI compatível com os contratos reais das skills, e
cobertura de integração dos caminhos críticos.
## Requirements
### Requirement: Gate de cobertura executável e verde
O comando `npm run test:coverage` SHALL sair com código 0, com threshold global de linhas mantido em 40% no `jest.config.js`.

#### Scenario: Gate passa no estado atual do repositório
- **WHEN** `npm run test:coverage` é executado na raiz do repositório
- **THEN** o processo termina com exit 0 e reporta cobertura global de linhas ≥ 40%

### Requirement: Mock da OpenAI suporta os contratos reais das skills
O mock em `tests/__mocks__/openai.js` SHALL suportar: fila de respostas sequenciais (`__setResponses`), `images.generate` retornando `{data:[{b64_json}]}`, a classe de erro `OpenAI.APIUserAbortError` e a captura das options da última chamada (`__lastOptions`) — mantendo a API existente (`__setResponse`, `__setError`, `__reset`, `__getMock`) intacta.

#### Scenario: Fila de respostas heterogêneas
- **WHEN** um teste configura `__setResponses([jsonDeAulas, prosa])` e o endpoint faz duas chamadas
- **THEN** a primeira chamada recebe o JSON e a segunda recebe a prosa

#### Scenario: Retrocompatibilidade
- **WHEN** os testes preexistentes rodam sem usar os helpers novos
- **THEN** todos passam sem modificação

### Requirement: Caminhos críticos com cobertura de integração
Os fluxos de export (`POST /api/export/:step`), carregamento de projeto (`POST /api/carregar-projeto`) e o caminho JSON de `planLessons` SHALL ter testes de integração com asserts de conteúdo (não apenas de shape de evento).

#### Scenario: Export gera DOCX válido
- **WHEN** uma etapa com conteúdo é exportada via `POST /api/export/plano-ensino`
- **THEN** a resposta é 200 com `Content-Disposition` contendo `.docx` e corpo iniciando com a assinatura ZIP `PK`

#### Scenario: Projeto restaurado do disco
- **WHEN** `POST /api/carregar-projeto` aponta para pasta com `scr/projeto.json` válido e `scr/ementa.txt`
- **THEN** a resposta lista `ementa` em `etapasCarregadas`

#### Scenario: projeto.json corrompido não derruba o carregamento
- **WHEN** `POST /api/carregar-projeto` aponta para pasta com `scr/projeto.json` inválido
- **THEN** a resposta é 200 com campo `aviso` indicando corrupção

#### Scenario: planLessons consome JSON do modelo
- **WHEN** `GET /api/plano-aula` roda com o mock devolvendo JSON válido de aulas na primeira chamada
- **THEN** o stream termina com evento `done` e o texto contém o título da aula do JSON

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

