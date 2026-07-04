# Tasks: realinhar-planos-pos-melhorias

## 1. Skill de realinhamento

- [x] 1.1 Criar `realinharPlanoAulaSkill` em `skills.js` (MODEL_ECONOMY): recebe `{ nome, duracao, nivel, publico, aula, index, total, planoAulaTrechoAtual, conteudoMelhorado, ementa, planoEnsinoResumo, metodologia, bnccContext }`; instrução de manter objetivos/título/escopo, devolver SOMENTE o corpo da seção (sem heading `# Aula N:`), e sinalizar extrapolações com `> ⚠️ ALERTA DE ESCOPO:`; injetar `nivelBlock(nivel)` + `pedagCtxBlock`; exportar em `module.exports`
- [x] 1.2 Helper `replaceLessonBlock(fullText, index, novoBloco)` em `server.js` (contraparte de `extractLessonBlock`, `server.js:124`), preservando heading e demais seções; exportar para teste

## 2. Fase de realinhamento no endpoint

- [x] 2.1 Em `/api/aplicar-melhorias/confirmar` (`server.js`, após `sess.conteudoPorAula = novasPorAula`): selecionar aulas com `similaridade <= 0.90` em `metricasPorAula`
- [x] 2.2 Guarda de origem: ler `stages['plano_de_aula'].fonte` do `projeto.json`; se `usuario`, pular a fase e registrar no relatório
- [x] 2.3 Loop de realinhamento com pausa de 4s: progress `Realinhando plano da aula N...` → `extractLessonBlock` → skill (conteúdo truncado ~3000; ementa/plano de ensino ~1200) → extrair/remover linhas `> ⚠️ ALERTA DE ESCOPO` → `replaceLessonBlock`; falha em uma aula não aborta o ciclo (registrar e continuar)
- [x] 2.4 Persistir uma única vez: `sess.planoAula` + `persistStage(sess, 'plano_de_aula', 'Plano de Aula', novoTexto)`
- [x] 2.5 Acrescentar seção `## Realinhamento de Planos` ao `reportSections` (aulas realinhadas, puladas, alertas de escopo, plano de usuário pulado)
- [x] 2.6 Incluir `planoAula` no payload do evento `done`

## 3. Frontend

- [x] 3.1 No `onDone` do fluxo de aplicar melhorias (`public/app.js`): se o payload trouxer `planoAula`, re-renderizar `#resultAula` via `renderMarkdown` e chamar `atualizarBadgeOrigem('plano_de_aula', 'ia', ...)`; verificar como `streamSSE` entrega o objeto `done` ao callback

## 4. Testes

- [x] 4.1 `tests/unit/realinhar.test.js`: prompt contém seção atual, conteúdo melhorado, instrução de manter objetivos/escopo, formato do alerta, `nivelBlock`; sem nível/metodologia mantém comportamento neutro
- [x] 4.2 Testes de `replaceLessonBlock`: substitui aula do meio/primeira/última preservando as demais; índice inexistente retorna texto original; extração de linhas de alerta

## 5. Validação e documentação

- [x] 5.1 `npx jest` completo verde + `node --check` em server.js/skills.js/app.js
- [ ] 5.2 E2E manual (com servidor reiniciado): curso de 2-3 aulas → revisão → observações que mudem atividades de uma aula → aplicar melhorias → conferir seção realinhada, demais intactas, relatório com `## Realinhamento de Planos`, e nova revisão sem apontar descompasso
- [ ] 5.3 E2E manual: plano de aula importado pelo usuário → realinhamento pulado com aviso no relatório
- [x] 5.4 Atualizar `PROJECT.md` (nota sobre a fase de realinhamento no ciclo da Etapa 6)
