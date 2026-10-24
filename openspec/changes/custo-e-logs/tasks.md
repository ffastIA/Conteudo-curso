## 1. Logger (logger.js, server.js)

- [ ] 1.1 Criar `logger.js` (`log(nivel, msg, ctx)`, `LOG_LEVEL`, mascaramento de segredos)
- [ ] 1.2 Middleware `req.id` e propagação em eventos SSE
- [ ] 1.3 Substituir `console.*` nas rotas por `log(...)` (incremental, `LOG_LEVEL=silent` nos testes)

## 2. Custo

- [ ] 2.1 `config/precos-modelos.json` (compartilhado com Langfuse) e `calcularCusto(usage, modelo)`
- [ ] 2.2 `estimarCustoEtapa(etapa, sess)` para pesquisa por módulo, conteúdo e revisão
- [ ] 2.3 Soma por projeto em `addUsage` e persistência em `projeto.json`
- [ ] 2.4 `ORCAMENTO_USD`: trava e disjuntor com erro SSE claro
- [ ] 2.5 `public/app.js`: exibir estimativa antes de iniciar e custo real ao fim

## 3. Testes (última etapa)

- [ ] 3.1 Cálculo de custo = tabela × usage; estimativa dentro de faixa; trava de orçamento
- [ ] 3.2 Logger: JSON válido, níveis, id de requisição, sem segredos
- [ ] 3.3 `npm test` verde e `openspec validate --all`
