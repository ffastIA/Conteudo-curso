# Tasks: melhorias-plano-aula-nao-so-conteudo

## 1. Skill

- [x] 1.1 Adicionar parâmetro `melhorias` a `realinharPlanoAulaSkill` (`skills.js:589`)
- [x] 1.2 Injetar a lista no prompt (mesma formatação numerada usada em `aplicarMelhoriasSkill`) e acrescentar instrução: corrigir diretamente na seção do plano qualquer melhoria que descreva atividade/dinâmica/recurso presente ali — mantendo as regras de saída já existentes (objetivos/título/escopo imutáveis, alerta de escopo para ementa/plano de ensino)

## 2. Integração

- [x] 2.1 Passar `melhorias: observacoes[i]?.melhorias` na chamada de `realinharPlanoAulaSkill` em `server.js` (~linha 2393)

## 3. Testes

- [x] 3.1 `tests/unit/`: prompt de `realinharPlanoAulaSkill` com `melhorias` inclui a lista numerada e a instrução de corrigir itens do plano; sem `melhorias`, comportamento idêntico ao atual (retrocompatível)

## 4. Validação e fechamento

- [x] 4.1 `npx jest` completo verde + `node --check`
- [ ] 4.2 E2E manual: rodar um novo ciclo de melhorias no projeto "Capcut Oficina" e confirmar que "Círculo de Histórias" deixa de constar em `plano_de_aula.txt`, e que a próxima revisão de qualidade não repete a observação
- [ ] 4.3 Sync do spec, arquivar o change, commit, push
