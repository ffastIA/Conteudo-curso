## 1. Setup de Dependências e Configuração

- [x] 1.1 Instalar devDependencies em `package.json`: `jest`, `supertest` e `@types/jest` (via `npm install --save-dev jest supertest`)
- [x] 1.2 Criar `jest.config.js` na raiz com `testEnvironment: "node"`, `testMatch: ["**/tests/**/*.test.js"]`, `coverageThreshold: { global: { lines: 40 } }` e `moduleNameMapper` apontando `openai` para `tests/__mocks__/openai.js`
- [x] 1.3 Adicionar scripts em `package.json`: `"test": "jest"` e `"test:coverage": "jest --coverage"`

## 2. Refatoração de server.js para Testabilidade

- [x] 2.1 Separar `app.listen()` em `server.js`: envolver em `if (require.main === module) { app.listen(PORT, ...) }` ao final do arquivo
- [x] 2.2 Adicionar `module.exports = app` como última linha de `server.js`

## 3. Mock da SDK OpenAI

- [x] 3.1 Criar `tests/__mocks__/openai.js`: classe mock com `chat.completions.create()` retornando async generator configurável via `__setResponse(text)` e `__setError(err)`

## 4. Testes Unitários das Skills

- [x] 4.1 Criar `tests/unit/skills.test.js`: importar skills.js, usar `jest.mock('openai')` e verificar que `ementaSkill` emite chunks e finaliza (spec: unit-skills § skill emite chunks e finaliza)
- [x] 4.2 Adicionar ao `skills.test.js` caso de erro: mock OpenAI lança erro, skill propaga a exceção (spec: unit-skills § skill propaga erro da OpenAI)
- [x] 4.3 Adicionar ao `skills.test.js` teste de parâmetros pedagógicos opcionais: `planoEnsinoSkill` sem `metodologia`/`bnccContext` não lança erro (spec: unit-skills § chamada sem parâmetros pedagógicos)
- [x] 4.4 Adicionar ao `skills.test.js` teste de `metodologiaSkill` com perfil completo (spec: unit-skills § chamada com perfil completo do curso)
- [x] 4.5 Adicionar ao `skills.test.js` teste de `qualidadeSkill` com artefatos completos (spec: unit-skills § chamada com todos os artefatos)

## 5. Testes de Integração — Endpoints REST

- [x] 5.1 Criar `tests/integration/api.test.js`: importar `app` e `supertest`; suprimir `console.log` no `beforeAll`
- [x] 5.2 Adicionar teste de `POST /api/config` com payload completo → 200 (spec: integration-api § payload completo retorna 200)
- [x] 5.3 Adicionar teste de `POST /api/config` sem `modalidade` → 400 (spec: integration-api § campo obrigatório ausente retorna 400)
- [x] 5.4 Adicionar teste de `GET /api/bncc?nivel=ef1` → 200 com itens (spec: integration-api § busca por nível ef1)
- [x] 5.5 Adicionar teste de `GET /api/bncc?tipo=competencias` → 200 com C2 e C5 (spec: integration-api § busca por competências de adultos)
- [x] 5.6 Adicionar teste de `GET /api/bncc?nivel=invalido` → 400 (spec: integration-api § nível inválido retorna 400)
- [x] 5.7 Adicionar teste de `POST /api/bncc/selecionar` com itens válidos → 200 (spec: integration-api § seleção válida salva na sessão)
- [x] 5.8 Adicionar teste de `POST /api/bncc/selecionar` com `itens: []` → 400 (spec: integration-api § payload sem itens retorna 400)
- [x] 5.9 Adicionar teste de `POST /api/export/ementa` sem sessão → 400 (spec: integration-api § export sem sessão retorna 400)

## 6. Testes de Integração — Endpoints SSE

- [x] 6.1 Criar `tests/integration/sse.test.js` com helper `collectSSE(res)` que parseia chunks `data: {...}\n\n` em array de objetos
- [x] 6.2 Adicionar teste de `GET /api/ementa` sem config → 400 (spec: sse-streaming § chamada sem config retorna 400)
- [x] 6.3 Adicionar teste de `GET /api/ementa` com sessão válida: verificar sequência `progress → token → done` (spec: sse-streaming § stream completo emite progress → token → done)
- [x] 6.4 Adicionar teste de `GET /api/ementa` com mock de erro: verificar evento `error` emitido (spec: sse-streaming § falha na OpenAI emite evento error)
- [x] 6.5 Adicionar teste de `GET /api/qualidade` sem `conteudo` → 400 (spec: sse-streaming § chamada sem conteúdo retorna 400)
- [x] 6.6 Adicionar teste de `GET /api/ppc` sem `conteudo` → 400 (spec: sse-streaming § chamada sem conteúdo retorna 400)

## 7. Verificação Final

- [x] 7.1 Rodar `npm test` e confirmar que todos os testes passam (0 falhas)
- [x] 7.2 Rodar `npm run test:coverage` e confirmar que cobertura de linhas ≥ 40%
