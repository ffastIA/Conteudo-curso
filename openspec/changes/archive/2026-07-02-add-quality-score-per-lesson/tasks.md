## 1. Prompt da skill

- [x] 1.1 Em `skills.js`, adicionar ao prompt de `revisaoQualidadeSkill` (entre "### Deficiências e Melhorias Sugeridas" e "### Observações do Revisor") a seção "### Nota de Qualidade", pedindo uma nota de 0 a 1 fundamentada na aderência ao plano de aula/plano de ensino/ementa e nas deficiências identificadas, com instrução explícita para terminar com uma linha isolada no formato exato "Nota: X.XX".

## 2. Extração e montagem do resumo

- [x] 2.1 Em `server.js`, dentro do loop de `GET /api/revisao-qualidade`, logo após capturar `texto` de cada aula, extrair a nota via `texto.match(/Nota:\s*([01](?:\.\d+)?)/i)`, aplicar `Math.max(0, Math.min(1, ...))` e acumular `{ numero, titulo, nota }` numa lista local (`notasPorAula`); se a extração falhar, registrar `nota: null`.
- [x] 2.2 Após o loop, ordenar `notasPorAula` por `numero` e montar a string de resumo: `\n\n<!--PAGEBREAK-->\n\n# Notas de Qualidade por Aula\n\n` seguida de uma linha `- Aula {numero}: {titulo} — Nota: {nota.toFixed(2) ou 'N/A'}` por aula.
- [x] 2.3 Enviar essa string via `send(res, { type: 'token', text: resumoNotas })` e concatenar em `fullText` antes de `persistStage`.

## 3. Suporte a quebra de página em `buildDocx`

- [x] 3.1 No loop de parsing de `buildDocx` (`server.js`), adicionar reconhecimento da linha-sentinela `<!--PAGEBREAK-->`: ao encontrá-la, inserir `new Paragraph({ text: '', pageBreakBefore: true })` em vez de tratá-la como texto comum.

## 4. Cliente — ocultar sentinela da pré-visualização

- [x] 4.1 Em `public/app.js`, no início de `renderMarkdown()`, adicionar `text = text.replace(/^<!--PAGEBREAK-->\n?/gm, '');` antes do escape de HTML, para que a sentinela não apareça como texto visível durante o streaming ao vivo.

## 5. Validação

- [x] 5.1 `node -c server.js` e `node --check public/app.js`: sintaxe OK.
- [x] 5.2 Testado via curl contra o servidor real (sessão `/api/dev/seed`, 4 aulas): cada aula retornou a seção "### Nota de Qualidade" com uma linha isolada "Nota: 0.XX" corretamente extraída (notas 0.75/0.80/0.75/0.75); a lista-resumo "Notas de Qualidade por Aula" apareceu ao final do `fullText`, em ordem crescente (Aula 1→4), no formato `- Aula N: Título — Nota: 0.XX`.
- [x] 5.3 Descompactado o `.docx` gerado (`revisao_qualidade.docx`) e inspecionado `word/document.xml` diretamente: 2 ocorrências de `pageBreakBefore` — a primeira é a quebra pré-existente da capa, a segunda é a nova, imediatamente seguida do heading H1 "Notas de Qualidade por Aula" e da lista em formato de bullet real do Word (`ListParagraph`/`numPr`), confirmando que a seção de notas está de fato na página final do documento.
- [x] 5.4 Confirmado por leitura estática (nenhuma linha de `POST /api/aplicar-melhorias`/`GET /api/aplicar-melhorias/confirmar` foi tocada nesta mudança) e por smoke-test ao vivo: `POST /api/aplicar-melhorias` sem arquivo retornou o mesmo erro de validação de sempre (`{"error":"Arquivo .docx inválido ou não enviado."}`, HTTP 400) — comportamento idêntico ao pré-existente.
- [x] 5.5 `npm test`: 33/33 passando, sem necessidade de ajustar nenhum teste existente.
