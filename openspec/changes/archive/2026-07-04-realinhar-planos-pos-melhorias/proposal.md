# Proposal: realinhar-planos-pos-melhorias

## Why

Na Etapa 6, `/api/aplicar-melhorias/confirmar` (`server.js:1932-2064`) reescreve apenas o conteúdo das aulas (`sess.conteudoPorAula`, `aulaNN_conteudo.txt`) e não toca no plano de aula, plano de ensino nem ementa. Cada ciclo de melhorias cria descompasso entre o plano de aula e o conteúdo — e a própria revisão de qualidade (que compara conteúdo × `extractLessonBlock` do plano na seção "Compatibilidade com o Plano de Aula") passa a apontar, no ciclo seguinte, incoerências que o ciclo anterior criou.

## What Changes

- Nova fase de **realinhamento automático** ao final do ciclo de melhorias: para cada aula efetivamente alterada (similaridade ≤ 0.90, limiar já usado no código), a seção correspondente do plano de aula é atualizada via nova `realinharPlanoAulaSkill` (gpt-4o-mini), mantendo objetivos, título e escopo da aula.
- **Ementa e plano de ensino não são alterados** — a skill sinaliza extrapolações de escopo com linhas `> ⚠️ ALERTA DE ESCOPO`, extraídas para o relatório (hierarquia curricular preservada: escopo oficial não deriva do conteúdo).
- **Guarda de origem**: se o plano de aula for versão do usuário (`fonte === 'usuario'` no `projeto.json`), o realinhamento automático é pulado e sinalizado no relatório (coerente com o spec `stage-import`, que exige confirmação para regenerar artefato do usuário).
- Relatório `melhorias_aplicadas_<ts>.docx` ganha seção `## Realinhamento de Planos` (aulas realinhadas, puladas e alertas de escopo).
- Novo helper `replaceLessonBlock` (contraparte de `extractLessonBlock`, `server.js:124`) para substituir a seção `# Aula N:` preservando as demais.
- Frontend: ao concluir, `#resultAula` é re-renderizado com o plano atualizado e o badge de origem atualizado.

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `improvement-application-cycle`: o ciclo de aplicação de melhorias passa a incluir a fase de realinhamento do plano de aula, com guarda de origem do usuário e sinalização de escopo no relatório.

## Non-goals

- Não altera ementa nem plano de ensino automaticamente (apenas sinaliza impactos no relatório).
- Não realinha aulas com similaridade > 0.90 (sem mudança relevante de conteúdo).
- Não adiciona etapa/botão novo na UI — o realinhamento ocorre dentro do fluxo SSE existente da Etapa 6.
- Não regenera plano de aula importado pelo usuário (apenas sinaliza; o usuário decide regenerar manualmente).

## Impact

- **Gap relacionado**: nenhum do registro (G01–G07); melhora a coerência do ciclo iterativo de revisão (capability `improvement-application-cycle`).
- **Código**: `skills.js` (nova `realinharPlanoAulaSkill` + export), `server.js` (`replaceLessonBlock`, fase de realinhamento no endpoint, campo `planoAula` no evento `done`), `public/app.js` (re-render `#resultAula` no `onDone`).
- **Custo**: +1 chamada gpt-4o-mini por aula efetivamente alterada; pausa de 4s entre chamadas (padrão do arquivo).
- **Testes**: novos testes unitários (skill e `replaceLessonBlock`).
- **Consistência com specs.yaml**: nenhuma mudança de modelo de dados nem de API pública (campo opcional adicional no payload `done` do SSE).
