## 1. Base (server.js)

- [ ] 1.1 `estimarTokens` e decisão chamada única × map-reduce
- [ ] 1.2 Remover `truncate(` de revisão (~3300), relatório (~1490), PPC (~1576-1585), score (~3553-3554, 3765-3767) e realinhamento (~3871-3888)

## 2. Revisão e relatório

- [ ] 2.1 Map por seção na `/api/revisao-qualidade` e reduce com formato compatível com `extractResumoMelhorias`
- [ ] 2.2 `/api/qualidade` em duas etapas (por módulo + síntese) com referências completas
- [ ] 2.3 Log de seções lidas por aula

## 3. Gate de score

- [ ] 3.1 Juiz pareado por seções alteradas + checagem global; agregação por seção quando não couber
- [ ] 3.2 `score_historico.json`: `secoesVistas` e `formulaVersao`; não comparar ciclos de versões diferentes

## 4. Fundamentação e PPC

- [ ] 4.1 Componente determinístico de fundamentação (só em `web`) e alerta de citação fraca (skills.js/server.js)
- [ ] 4.2 `infraestruturaSkill` e `ppcAssemblySkill` com resumo por aula, recursos e achados

## 5. Testes (última etapa)

- [ ] 5.1 Teste estático: nenhum `truncate(` nas rotas de avaliação
- [ ] 5.2 Revisão lê todas as seções de aula longa; gate vê melhoria na última seção; componente de fundamentação no score
- [ ] 5.3 `npm test` verde e `openspec validate --all`
