# Tasks: aplicar-melhorias-sem-busca-web

## 1. Skill

- [x] 1.1 `aplicarMelhoriasSkill` (`skills.js`): trocar `model: MODEL_RESEARCH` por `model: MODEL_ECONOMY`, remover `web_search_options`
- [x] 1.2 Remover/reescrever trechos do prompt (system + fallback de observações) que instruíam ou sugeriam busca web

## 2. Integração

- [x] 2.1 Confirmar que `streamSkillToClient` despacha corretamente para o ramo de streaming real (sem `web_search_options`) sem exigir mudança de código
- [x] 2.2 Confirmar que a chamada de continuação (guarda de truncamento) permanece correta com `web_search_options: undefined`

## 3. Testes e validação

- [x] 3.1 `npx jest` completo verde + `node --check` em `server.js`/`skills.js`
- [x] 3.2 Confirmar que nenhum teste existente assume `model`/`web_search_options` de `aplicarMelhoriasSkill`
- [ ] 3.3 E2E manual (servidor reiniciado): rodar o ciclo de melhorias que antes falhava com 429 no projeto "Capcut Oficina" e confirmar que completa sem erro de rate limit

## 4. Fechamento

- [x] 4.1 Sync do spec (`improvement-application-cycle`), arquivar o change, commit, push
