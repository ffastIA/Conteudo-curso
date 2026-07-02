## Why

O relatório de Revisão de Qualidade (Etapa 6) já analisa cada aula individualmente contra plano de aula, plano de ensino, ementa e identifica deficiências — mas expressa tudo em texto qualitativo, sem nenhum indicador numérico rápido de comparação entre aulas. Um score objetivo de 0 a 1 por aula, resumido ao final do relatório, permite ao revisor identificar rapidamente quais aulas precisam de mais atenção antes de investir tempo lendo a análise completa de cada uma.

## What Changes

- `revisaoQualidadeSkill` passa a pedir, ao final da análise de cada aula, uma seção adicional `### Nota de Qualidade` com uma nota de 0 a 1 (0 = qualidade baixíssima, 1 = qualidade total), fundamentada na aderência ao plano de aula, plano de ensino, ementa e nas deficiências já identificadas na mesma análise.
- `GET /api/revisao-qualidade` extrai essa nota por regex do texto retornado de cada aula (mesmo padrão já usado para extrair "Melhorias Aplicadas" no ciclo de aplicar melhorias) e acumula uma lista ordenada por aula.
- Ao final do relatório, uma nova seção-resumo "Notas de Qualidade por Aula" é anexada como a última seção do texto, sempre em sua(s) página(s) final(is) do `.docx` gerado, listando cada aula e sua nota, em ordem crescente de número de aula.
- `buildDocx` ganha suporte a uma linha-sentinela genérica (`<!--PAGEBREAK-->`) que força quebra de página ao ser encontrada no conteúdo — mecanismo reutilizável por qualquer etapa futura, não específico desta feature.
- `renderMarkdown` (cliente) passa a ocultar essa sentinela da pré-visualização ao vivo no navegador, mantendo o `.docx` final com a quebra de página real.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `content-quality-review`: novo requisito aditivo — nota de qualidade por aula (0-1) e seção-resumo na última página do relatório. Nenhum requisito existente tem seu comportamento alterado.

## Impact

- `skills.js`: prompt de `revisaoQualidadeSkill` ganha uma seção adicional pedindo a nota, em formato fixo e extraível por regex.
- `server.js`: `GET /api/revisao-qualidade` extrai a nota de cada aula e monta a seção-resumo final antes de `persistStage`; `buildDocx` ganha reconhecimento da linha-sentinela de quebra de página.
- `public/app.js`: `renderMarkdown` oculta a linha-sentinela da pré-visualização.
- Nenhuma mudança em `POST /api/aplicar-melhorias`, `GET /api/aplicar-melhorias/confirmar`, ou no relatório `melhorias_aplicadas_{timestamp}.docx` — escopo restrito à geração da revisão de qualidade.
- Nenhuma nova dependência npm.

## Non-goals

- Não recalcula/atualiza a nota após o ciclo de "Aplicar Melhorias" — para uma nota atualizada, o usuário gera a Revisão de Qualidade novamente (fluxo cíclico já existente no produto).
- Não persiste a nota como dado estruturado separado em `sess` ou `projeto.json` — ela existe apenas como texto dentro do relatório, extraída por regex a cada geração.
- Não altera nenhuma das seções por aula já existentes no relatório (Compatibilidade com Plano de Aula, Sobreposições, BNCC, etc.) — apenas adiciona uma seção nova por aula e um resumo final.
- Não garante literalmente "uma única página física" para cursos com dezenas de aulas — garante que a seção-resumo é sempre a última do documento, o que na prática cabe em uma página para a grande maioria dos cursos.
