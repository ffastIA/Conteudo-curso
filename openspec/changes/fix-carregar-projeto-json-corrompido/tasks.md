## 1. Backend — carregamento tolerante

- [x] 1.1 `server.js` (`POST /api/carregar-projeto`): no `catch` do `JSON.parse`, marcar corrompido, renomear para `projeto.json.corrompido-<timestamp>.bak` (try/catch) e seguir o fluxo legado em vez de retornar
- [x] 1.2 `server.js`: incluir `aviso` (contendo "corrompido") e `backup` na resposta final

## 2. Backend — gravação atômica

- [x] 2.1 `server.js` (`saveProject`): gravar em `projeto.json.tmp-<pid>` + `renameSync`, removendo o temporário em caso de erro

## 3. Frontend

- [x] 3.1 `public/app.js` (`carregarProjetoPorPasta`): exibir `data.aviso` quando presente

## 4. Testes

- [x] 4.1 Ajustar `tests/integration/api.test.js` (teste "projeto.json corrompido") para a nova resposta
- [x] 4.2 Novo `tests/integration/carregar-projeto-corrompido.test.js`: corrompido + `.txt` → etapas carregadas, `.bak` criado, `aviso`; `projeto.json` válido inalterado; falha de rename não aborta
- [x] 4.3 Teste da gravação atômica: JSON válido após `saveProject`, sem `.tmp-*` residual
- [x] 4.4 `npm test` e `npm run test:coverage` verdes
