## Why

O projeto não possui nenhum teste automatizado (Gap G07), tornando difícil detectar regressões nas skills, nos endpoints e na lógica de sessão ao evoluir o sistema. A adição de testes com Jest + Supertest cria uma rede de segurança mínima antes de iterar sobre novas features.

## What Changes

- Instalar dependências de teste: `jest`, `supertest` e `jest-environment-node`
- Criar suite de testes unitários para `skills.js` (mock da chamada OpenAI)
- Criar suite de testes de integração para os endpoints Express em `server.js` (mock da OpenAI, sessão in-memory real)
- Adicionar script `npm test` e `npm run test:coverage` em `package.json`
- Criar arquivo `jest.config.js` configurando environment, cobertura e exclusões
- Criar helpers de mock reutilizáveis em `tests/__mocks__/`

## Capabilities

### New Capabilities

- `unit-skills`: Testes unitários das funções de skill em `skills.js` — verifica que cada skill monta o prompt correto e propaga erros da OpenAI
- `integration-api`: Testes de integração dos endpoints HTTP — verifica status codes, payload de resposta, validação de campos obrigatórios e comportamento de sessão
- `sse-streaming`: Testes do padrão SSE — verifica que endpoints de streaming emitem os eventos esperados (`progress`, `token`, `done`, `error`) na ordem correta

### Modified Capabilities

_(nenhuma — sem alteração de requisitos em specs existentes)_

## Impact

- **`package.json`**: novas devDependencies (`jest`, `supertest`), scripts `test` e `test:coverage`
- **`jest.config.js`** (novo): configuração de environment, coverage thresholds, testMatch
- **`tests/`** (nova pasta): `unit/skills.test.js`, `integration/api.test.js`, `integration/sse.test.js`, `__mocks__/openai.js`
- **`server.js`**: nenhuma alteração; testado via Supertest importando o app como módulo
- **`skills.js`**: nenhuma alteração; testado com mock da SDK OpenAI

## Non-goals

- Testes E2E de browser (Playwright/Cypress) — fora do escopo
- Testes de carga ou performance
- 100% de cobertura — alvo é cobrir o happy path e os casos de erro mais críticos de cada skill e endpoint
- Testes do frontend (`app.js`) — sem jsdom nesta iteração
