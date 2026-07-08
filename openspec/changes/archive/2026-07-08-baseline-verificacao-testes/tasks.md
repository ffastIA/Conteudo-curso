# Tasks: baseline-verificacao-testes

> Referência detalhada (números de linha, formatos, STOP conditions):
> `plans/002-baseline-verificacao.md`

## 1. Extensão do mock (retrocompatível)

- [x] 1.1 Em `tests/__mocks__/openai.js`: adicionar fila `__setResponses([...])` consumida por chamada, com fallback para `_response` fixa
- [x] 1.2 Em `tests/__mocks__/openai.js`: adicionar `this.images = { generate }` resolvendo `{data:[{b64_json: '<png 1x1 base64>'}]}` + helper `__setImageError`
- [x] 1.3 Em `tests/__mocks__/openai.js`: adicionar `OpenAI.APIUserAbortError` (class extends Error) e gravação de `OpenAI.__lastOptions` no `mockCreate`
- [x] 1.4 Rodar `npm test` — os 164 testes existentes continuam verdes

## 2. Testes de integração — export e carregamento

- [x] 2.1 Em `tests/integration/api.test.js`: caso de `POST /api/export/plano-ensino` (pasta temp como `pastaProjeto`) — comportamento real: 200 + `{ok:true, saved:true, path}`, arquivo em disco > 1000 bytes com assinatura ZIP `PK` (a rota não faz download HTTP; salva em disco — desvio do plano registrado)
- [x] 2.2 Em `tests/integration/api.test.js`: caso de export de etapa sem conteúdo — 400 com `error`
- [x] 2.3 Em `tests/integration/api.test.js`: 3 casos de `POST /api/carregar-projeto` (válido com ementa; pasta inexistente → 404; projeto.json corrompido → 200 com `aviso`)

## 3. Testes de integração — contratos JSON e melhorias

- [x] 3.1 Ler `planLessons` em `server.js` (~:1521-1571) e confirmar o formato JSON esperado; em `tests/integration/sse.test.js`, caso de `GET /api/plano-aula` com `__setResponses` (JSON de aulas + prosa) — evento `done` presente e texto contém o título da aula
- [x] 3.2 Happy path do ciclo de melhorias: `GET /api/aplicar-melhorias/confirmar` com sessão populada e `__setResponses` devolvendo patch `<<<SECAO:...>>>` — evento `done`, nenhum `error` (fallback documentado no plano se o setup por upload for frágil)

## 4. Unit tests e fechamento do gate

- [x] 4.1 Verificar `module.exports` de `server.js` (:3289-3304); adicionar `slugify` (ou equivalente) ao exports se ausente e criar `tests/unit/slugify.test.js` (caracterização: espaços→`_`, acentos)
- [x] 4.2 Rodar `npm run test:coverage`; se linhas < 40%, adicionar o próximo teste mais barato da lista de faixas não cobertas do plano até cruzar o threshold
- [x] 4.3 Verificação final: `npm run test:coverage` exit 0, threshold em `jest.config.js` permanece `lines: 40`, `git status` sem mudanças fora de `tests/` (+ eventual linha no exports do `server.js`)
