## 1. Mock (pode ser antecipado — pré-requisito de geracao-retomavel)

- [x] 1.1 `tests/__mocks__/openai.js`: `AuthenticationError`, `BadRequestError`, `RateLimitError` (com `status`/`headers`)
- [x] 1.2 Validação de `web_search_options` por modelo; `responses.create` com `web_search`, `url_citation` e eventos de streaming
- [x] 1.3 `__setFinishReason('length')`
- [x] 1.4 Ajustar testes existentes que dependiam de permissividade

## 2. Testes de busca

- [x] 2.1 Teste de integração de `/api/search` (web, sem citações, 400 sem fallback, fallback por decisão)

## 3. Cobertura

- [x] 3.1 `npm run test:coverage`; subir gate para 60% após `pesquisa-web-real` e 70% no fim (`jest.config.js`)
- [x] 3.2 Documentar `scripts/smoke-pesquisa.js` no README como verificação manual pré-release

## 4. Verificação final

- [ ] 4.1 Reexecutar a linha de base (2 cursos) ao fim de cada fase
- [x] 4.2 `npm test` verde e `openspec validate --all`
