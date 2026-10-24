## 1. Rede e cookie (server.js)

- [ ] 1.1 `app.listen(PORT, HOST)` com `HOST` default `127.0.0.1`; atualizar `.env.example` e README (caso Docker)
- [ ] 1.2 Cookie `sessionId` com `sameSite: 'lax'`
- [ ] 1.3 Registrar `/api/dev/seed` só com `ENABLE_DEV_SEED=true`

## 2. Origem, pasta e upload (server.js)

- [ ] 2.1 Middleware `verificarOrigem` nas rotas POST/com efeito
- [ ] 2.2 Restringir `/api/escolher-pasta` a loopback
- [ ] 2.3 `validarPastaProjeto` em `carregar-projeto` e `pastaProjeto`, com log
- [ ] 2.4 `multer` com `limits` e `fileFilter`
- [ ] 2.5 `ultimoAcesso` + limpeza periódica de sessões

## 3. Decisão

- [ ] 3.1 Registrar em `PROJECT.md` a decisão sobre `.env.encrypted` no git

## 4. Testes (última etapa)

- [ ] 4.1 Testes de integração: bind/host, SameSite, seed 404, Origin 403, loopback, pasta inválida, limite de upload, expiração de sessão
- [ ] 4.2 `npm test` verde e `openspec validate --all`
