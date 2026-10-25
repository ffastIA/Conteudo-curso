## 1. Persistência da última pasta

- [x] 1.1 `server.js`: helpers `lerUltimaPasta()` / `gravarUltimaPasta(pasta)` (arquivo `.ultima-pasta.json` na raiz do app, sobrescrevível por `ULTIMA_PASTA_FILE`; try/catch com log)
- [x] 1.2 `.gitignore`: adicionar `.ultima-pasta.json`; `.env.example`: comentar `ULTIMA_PASTA_FILE` (opcional)

## 2. Seletor nativo

- [x] 2.1 `server.js` (`escolherPastaWindows`): aceitar pasta inicial, repassar via `env.PASTA_INICIAL` e usar `$env:PASTA_INICIAL` em `$f.SelectedPath` somente se existir
- [x] 2.2 `server.js` (`GET /api/escolher-pasta`): ler a última pasta (validar `fs.existsSync`), abrir o seletor e gravar o resultado não nulo

## 3. Testes

- [x] 3.1 Novo `tests/integration/escolher-pasta-persistencia.test.js` (supertest, `child_process.execFile` mockado, `ULTIMA_PASTA_FILE` em tmpdir): grava ao selecionar, não grava ao cancelar, repassa `PASTA_INICIAL`, ignora pasta inexistente, tolera arquivo corrompido
- [x] 3.2 `npm test` e `npm run test:coverage` verdes
