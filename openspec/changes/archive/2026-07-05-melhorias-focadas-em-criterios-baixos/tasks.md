# Tasks: melhorias-focadas-em-criterios-baixos

## 1. Prompt da revisão (skills.js)

- [x] 1.1 `revisaoQualidadeSkill` — seção "### Resumo de Melhorias Propostas": derivar as melhorias prioritariamente do(s) 1-2 critério(s) com menor nota da rubrica desta aula; prefixar cada melhoria com o critério-alvo entre colchetes (ex.: `[Adequação a Nível/Público/Modalidade] ...`); com todos os critérios ≥ 9, declarar apenas "Nenhuma"

## 2. Linha de foco no relatório (server.js)

- [x] 2.1 Em `/api/revisao-qualidade`, quando `parseRubricaCriterios` tiver sucesso, identificar o critério de menor nota e anexar à análise da aula a linha "Foco sugerido desta rodada: <critério> (N/10)" (rótulos legíveis dos 5 critérios; rubrica não parseável = sem linha, sem erro)

## 3. Prompt da aplicação (skills.js)

- [x] 3.1 `aplicarMelhoriasSkill` — instrução: quando um item de melhoria começar com `[Critério]`, concentrar as mudanças nas seções relacionadas àquele critério e não tocar seções que já atendem critérios altos; item sem tag mantém comportamento atual

## 4. Testes

- [x] 4.1 Prompt da revisão contém: instrução de derivar do(s) critério(s) de menor nota, formato da tag `[...]`, e regra do "Nenhuma" com critérios ≥ 9
- [x] 4.2 Prompt da aplicação contém a instrução de foco pela tag `[Critério]`
- [x] 4.3 Item de melhoria com e sem tag `[Critério]` passa igual pelo parser estruturado existente (`parseMelhoriasEstruturadas`)
- [x] 4.4 Helper de critério mais baixo (se extraído como função) ou verificação da montagem da linha de foco
- [x] 4.5 `npx jest` completo verde + `node --check`

## 5. Fechamento

- [x] 5.1 Sync das specs (`content-quality-review`, `improvement-application-cycle`), arquivar o change, commit, push
