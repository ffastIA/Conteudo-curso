## Context

`tests/__mocks__/openai.js` expõe `__setError`, `__setImageError` e `APIUserAbortError`. Os testes atuais passam (27 suítes, 317 testes) mesmo com `MODEL_RESEARCH='gpt-4o'` e `web_search_options`, porque o mock aceita qualquer parâmetro.

## Goals / Non-Goals

**Goals:** o mock rejeitar o que a API real rejeita; cobrir `/api/search`, continuações e erros.
**Non-Goals:** reproduzir toda a API da OpenAI.

## Decisions

- **D1**: classes de erro herdam de `Error` com `status` e `headers`; `OpenAI.AuthenticationError`, `BadRequestError`, `RateLimitError` exportadas como no SDK.
- **D2**: `chat.completions.create` segue a regra confirmada na API real (`docs/decisoes/pesquisa-api.md`): `web_search_options` → `BadRequestError` (400) e modelos `*-search-preview` → `NotFoundError` (404, descontinuados). Desvio da versão inicial, que aceitaria `*-search-preview`: esse modelo não existe mais na API.
- **D3**: `responses.create` simula `web_search` retornando `output_text`, anotações `url_citation` e, em streaming, eventos de busca e texto.
- **D4**: `__setFinishReason('length')` (e `__setFinishReasons([...])` para filas) para testar continuação e bloqueio de aula incompleta.
- **D5**: gate sobe em dois passos (60% e 70%) em `jest.config.js`, após medir a cobertura real com `npm run test:coverage`.

## Risks / Trade-offs

- Mock realista pode quebrar testes existentes que dependiam de permissividade → ajustar caso a caso.
- Regra de modelos suportados muda → centralizada em uma função do mock.
