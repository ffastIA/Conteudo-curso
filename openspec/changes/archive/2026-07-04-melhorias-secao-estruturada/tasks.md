# Tasks: melhorias-secao-estruturada

## 1. Skill de revisão — resumo por aula

- [x] 1.1 Adicionar subseção obrigatória `### Resumo de Melhorias Propostas` ao final do prompt da `revisaoQualidadeSkill` (`skills.js`): bullets curtos, uma melhoria por bullet, sem prosa (espelho enxuto de "Deficiências e Melhorias Sugeridas")
- [x] 1.2 Teste de prompt: a skill exige a subseção de resumo

## 2. Geração do relatório — seção consolidada

- [x] 2.1 No endpoint da revisão (`server.js` ~1750-1845): extrair os bullets de `### Resumo de Melhorias Propostas` de cada aula (função exportável, tolerante à ausência da subseção → bloco vazio)
- [x] 2.2 Montar ao final do relatório (tela e export .docx) o parágrafo de instrução fixa + `## Melhorias a serem Aplicadas` com blocos `Aula NN` + itens, linha em branco entre aulas

## 3. Parser do upload

- [x] 3.1 Criar `parseMelhoriasEstruturadas(texto, totalAulas)` em `server.js` (exportar para teste): última ocorrência da âncora (normalização de acentos/caixa), blocos por linha iniciando com `Aula NN` mapeados pelo número, cada linha não vazia = 1 melhoria (remover prefixos `-`, `*`, `•`, `1.`, `1)`), `Nenhuma` = pular aula, números fora do intervalo ignorados com aviso
- [x] 3.2 Integrar em `POST /api/aplicar-melhorias` (`server.js:1855-1933`): seção presente → usar somente ela e preencher `sess.observacoesMelhorias` com `{ titulo, observacoes, melhorias: [] }`; ausente → parser legado + `modoLegado: true` e aviso na resposta
- [x] 3.3 Incluir contagem de melhorias por aula na resposta do upload; preservar o check de duplicata juntando o texto dos itens

## 4. Aplicação numerada

- [x] 4.1 `aplicarMelhoriasSkill` (`skills.js`): aceitar `melhorias: []`; quando presente, montar lista numerada no prompt e exigir que `### Melhorias Aplicadas` referencie cada número (ação ou `Não aplicado: <motivo>`); sem lista, manter comportamento atual com `observacoesRevisor`
- [x] 4.2 Passar `melhorias` no call site de `/api/aplicar-melhorias/confirmar` (`server.js`)

## 5. Frontend

- [x] 5.1 No resumo pós-upload (`public/app.js` ~560-590): exibir "Aula N: X melhoria(s)" por aula quando o modo estruturado for usado, e o aviso de modo legado quando `modoLegado: true`

## 6. Testes e validação

- [x] 6.1 `tests/unit/` — parser: linhas sem marcador, com prefixos variados, `Nenhuma`, blocos fora de ordem/ausentes, âncora repetida no corpo (usa a última), seção ausente → null (fallback)
- [x] 6.2 Testes de prompts: lista numerada na `aplicarMelhoriasSkill` e resumo na `revisaoQualidadeSkill`; asserts existentes revisados
- [x] 6.3 `npx jest` completo verde + `node --check` nos arquivos alterados
- [ ] 6.4 E2E manual: gerar revisão → conferir seção consolidada pré-preenchida no .docx → editar itens no Word (lista nativa) → upload → contagens corretas na confirmação → aplicar → seção "Melhorias Aplicadas" numerada no resultado
- [ ] 6.5 E2E manual: enviar relatório antigo (sem a seção) → fallback legado com aviso
