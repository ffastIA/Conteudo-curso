## 1. Smoke test de pesquisa

- [x] 1.1 Criar `scripts/smoke-pesquisa.js` com as 3 variantes e saída tabular + JSON
- [x] 1.2 Executar com a chave real e registrar o resultado em `docs/decisoes/pesquisa-api.md`

## 2. HeyGen v3

- [x] 2.1 Em `server.js`, `listarAvataresHeygen`: tentar `/v3/avatar_groups`, fallback v2 em 404
- [x] 2.2 Em `public/index.html` e `public/app.js`: aviso de legado e campo manual de `avatarId` na Etapa 10

## 3. Linha de base

- [x] 3.1 Gerar o curso de referência e salvar `docs/baseline/<curso>/metricas.json` (só o CapCut infantil, a pedido; o curso técnico fica opcional — `node scripts/gerar-baseline.js`)

## 4. Testes (última etapa)

- [x] 4.1 Teste de integração em `tests/integration/`: v3 ok, v3 404 → v2, ambos falham → entrada manual
- [x] 4.2 `npm test` verde e `openspec validate --all`
