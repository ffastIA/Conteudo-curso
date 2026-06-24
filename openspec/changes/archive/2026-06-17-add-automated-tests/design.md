## Context

`server.js` atual chama `app.listen()` diretamente no módulo e não exporta o `app`. `skills.js` usa async generators que delegam chamadas à SDK da OpenAI. Não existe nenhuma infra de testes — sem `jest.config.js`, sem pasta `tests/`, sem devDependencies de teste em `package.json`.

## Goals / Non-Goals

**Goals:**
- Instalar Jest + Supertest com configuração mínima
- Refatorar `server.js` para separar criação do app de `app.listen()`, exportando `app` para testes
- Criar mock de módulo para `openai` (SDK) reutilizável em todos os testes
- Cobrir happy path e casos de erro críticos de cada skill e dos principais endpoints

**Non-Goals:**
- Cobertura 100% — threshold inicial de 40% de linhas
- Testes E2E de browser
- Testes de `public/app.js` (requer jsdom/Playwright)
- Alterar comportamento de qualquer endpoint

## Decisions

### 1. Jest como test runner (não Vitest ou Mocha)
Jest é a escolha padrão para Node.js sem bundler, suporta `jest.mock()` com hoisting automático e tem cobertura nativa via V8. Mocha exigiria chai + nyc separados; Vitest requer ESM. **Jest ganha em simplicidade de setup.**

### 2. Exportar `app` sem quebrar o servidor de produção
Padrão `require.main === module`: o `app.listen()` só executa quando o arquivo é rodado diretamente (`node server.js`). Quando importado por `require('./server')` no teste, apenas `app` é exportado — sem efeito colateral de porta. **Não altera comportamento em produção.**

```js
// ao final de server.js
if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
}
module.exports = app;
```

### 3. Mock da SDK OpenAI no nível de módulo
`jest.mock('openai')` é definido em `tests/__mocks__/openai.js` e ativado automaticamente via `moduleNameMapper` no `jest.config.js`. O mock expõe um `__setResponse(text)` para controlar o texto retornado e um `__setError(err)` para simular falhas. Isso isola os testes de chamadas reais à API.

### 4. Supertest para integração HTTP
Supertest envolve o `app` Express sem necessidade de subir o servidor em porta real. Permite testar status codes, headers, cookies e payload JSON. Para SSE, usa o modo raw (`.buffer(false)`) para ler chunks do stream.

### 5. Estrutura de pastas
```
tests/
  __mocks__/
    openai.js        ← mock da SDK (automático via jest.config)
  unit/
    skills.test.js   ← testa cada skill isoladamente
  integration/
    api.test.js      ← testa endpoints REST (config, bncc, metodologia, export)
    sse.test.js      ← testa endpoints SSE (search, ementa, qualidade, ppc)
jest.config.js
```

## Risks / Trade-offs

- **[Risk] `server.js` usa `console.log` no `require('bncc-data')` ao importar** → Mitigation: suprimir com `jest.spyOn(console, 'log').mockImplementation(() => {})` no `beforeAll` dos testes de integração.
- **[Risk] Endpoints SSE usam `EventSource` nativo do browser** → Mitigation: nos testes Node.js, consumir o stream via `supertest` com `.buffer(false)` e parsear os chunks manualmente; sem necessidade de `EventSource`.
- **[Risk] Skills com streaming retornam async generators** → Mitigation: o mock deve retornar um async generator que produz o texto configurado por `__setResponse()`.
- **[Trade-off] Threshold 40%** → Cobre os caminhos críticos sem exigir mocks de cada ramificação. Pode ser aumentado incrementalmente.
