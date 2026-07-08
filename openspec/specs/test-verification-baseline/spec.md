## ADDED Requirements

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
