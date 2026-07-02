## Context

`GET /api/revisao-qualidade` (`server.js:1539-1607`) já itera uma vez por aula (`for (let i = 0; i < aulas.length; i++)`, linha 1568), monta `skills.revisaoQualidadeSkill({...})` (linha 1579) com `ementa`, `planoEnsino`, `planoAulaTrecho` (o trecho específico da aula), `aulaConteudo` e as sobreposições Jaccard já calculadas, e captura o texto completo retornado de cada aula individualmente via `const texto = await streamSkillToClient(res, skill)` (linha 1593) antes de concatená-lo em `fullText`. Esse texto por aula já é uma resposta livre (não-JSON) de `revisaoQualidadeSkill` (`skills.js:212-257`), que hoje pede exatamente estas seções fixas: Compatibilidade com o Plano de Aula, Compatibilidade com Plano de Ensino e Ementa, Adequação à Faixa Etária, Sobreposições Detectadas, Alinhamento BNCC (condicional), Deficiências e Melhorias Sugeridas, Observações do Revisor.

Os três documentos de referência exigidos pelo score (plano de aula, plano de ensino, ementa) e a seção de deficiências já identificadas estão, portanto, todos disponíveis dentro da mesma chamada — não é necessário nenhum dado novo.

`buildDocx` (`server.js:1386-1494`) converte a string final `fullText` em parágrafos `.docx` linha a linha. A única quebra de página hoje existente é hardcoded no código para a capa (`new Paragraph({ text: '', pageBreakBefore: true })`, linha 1411) — não há mecanismo para o conteúdo (`content`) disparar uma quebra de página a partir do próprio texto.

## Goals / Non-Goals

**Goals:**
- Nota 0-1 por aula, fundamentada nos mesmos critérios já analisados na chamada existente (plano de aula, plano de ensino, ementa, deficiências).
- Lista-resumo ordenada por aula, na última seção do relatório (e, na prática, na última página do `.docx`).
- Zero mudança de UX de streaming (o usuário continua vendo o texto sendo gerado ao vivo).
- Zero impacto no ciclo de "Aplicar Melhorias".

**Non-Goals:**
- Recalcular a nota automaticamente após aplicar melhorias.
- Persistir a nota como campo estruturado em `sess`/`projeto.json`.
- Garantir uma única página física para cursos com dezenas de aulas.

## Decisions

### Extração por regex de texto livre, não modo JSON

`revisaoQualidadeSkill` roda hoje via `streamSkillToClient` com `stream: true` (texto sendo exibido token a token no painel de log/resultado do navegador). Trocar para `response_format: 'json_object'` exigiria uma chamada não-streaming, matando essa UX ao vivo — mudança desproporcional para o que é pedido aqui.

Em vez disso, adiciona-se **uma seção a mais** ao prompt já existente, pedindo que a IA termine a análise de cada aula com uma linha fixa e facilmente extraível por regex:

```javascript
// skills.js — revisaoQualidadeSkill, dentro do template de seções pedidas,
// inserida depois de "### Deficiências e Melhorias Sugeridas" e antes de
// "### Observações do Revisor":
`### Nota de Qualidade\n` +
`Com base na aderência desta aula ao plano de aula, ao plano de ensino, à ` +
`ementa, e na gravidade das deficiências identificadas acima, atribua uma ` +
`nota de qualidade de 0 a 1 (0 = qualidade baixíssima, 1 = qualidade total). ` +
`Responda com uma frase curta de justificativa seguida OBRIGATORIAMENTE de ` +
`uma linha isolada no formato exato: "Nota: X.XX" (ex.: "Nota: 0.85").\n\n`
```

Isso segue exatamente o precedente já existente no ciclo de "Aplicar Melhorias" (`server.js` ~linha 1796), que já faz `texto.match(/### Melhorias Aplicadas.../i)` para extrair uma seção específica do texto retornado pela IA.

### Extração e acumulação no servidor

```javascript
// server.js — dentro do loop de GET /api/revisao-qualidade, logo após
// `const texto = await streamSkillToClient(res, skill); fullText += texto;`
const notaMatch = texto.match(/Nota:\s*([01](?:\.\d+)?)/i);
const nota = notaMatch ? Math.max(0, Math.min(1, parseFloat(notaMatch[1]))) : null;
notasPorAula.push({ numero: i + 1, titulo: aula.titulo, nota });
```

- `Math.max(0, Math.min(1, ...))` protege contra a IA eventualmente extrapolar a faixa (ex.: "1.2").
- Se a extração falhar (IA não seguiu o formato), `nota` fica `null` e a aula aparece na lista final como "N/A" em vez de quebrar a geração do relatório — falha de formatação da IA não deve derrubar todo o fluxo.
- `notasPorAula` é uma variável local ao request (não persistida em `sess`), consistente com a decisão de não introduzir estado estruturado novo.

### Seção-resumo final com quebra de página

Ao final do loop, antes de `persistStage`:

```javascript
notasPorAula.sort((a, b) => a.numero - b.numero); // já vem ordenado pelo loop; sort explícito por clareza/robustez
let resumoNotas = '\n\n<!--PAGEBREAK-->\n\n# Notas de Qualidade por Aula\n\n';
for (const n of notasPorAula) {
  resumoNotas += `- Aula ${n.numero}: ${n.titulo} — Nota: ${n.nota !== null ? n.nota.toFixed(2) : 'N/A'}\n`;
}
send(res, { type: 'token', text: resumoNotas });
fullText += resumoNotas;

sess.revisaoQualidade = fullText;
await persistStage(sess, 'revisao_qualidade', 'Revisão de Qualidade', fullText);
```

- `.toFixed(2)` força formatação uniforme (`0.85`, `1.00`, `0.00`) independente da precisão que a IA usar na resposta — atende ao pedido de "verificar cuidadosamente a formatação".
- A ordenação por número de aula é explícita e não depende apenas da ordem do loop, tornando a intenção robusta a qualquer refatoração futura do loop.
- O formato 0.XX (não porcentagem) mantém a nota visualmente distinta da similaridade Jaccard, que já é exibida como percentual arredondado (`Math.round(sim*100)}%`) em outra seção do mesmo relatório — evita confundir os dois conceitos.

### `buildDocx`: sentinela genérica de quebra de página

```javascript
// server.js — dentro do loop de parsing de buildDocx, antes dos demais `if`:
if (line.trim() === '<!--PAGEBREAK-->') {
  children.push(new Paragraph({ text: '', pageBreakBefore: true }));
  continue;
}
```

Adicionada como um caso genérico do parser (mesma técnica já usada para a quebra de página da capa), reaproveitável por qualquer etapa futura que precise forçar uma seção a começar em página nova — não é uma bifurcação especial só para este relatório.

*Ressalva:* como a seção-resumo é sempre o último conteúdo adicionado a `fullText`, ela sempre termina na(s) última(s) página(s) do documento. Para a grande maioria dos cursos (dezenas de linhas curtas, uma por aula) isso cabe em uma única página física — mas não há garantia absoluta de página única para cursos com um número muito grande de aulas; nesse caso, a lista continua sendo a seção final do documento, apenas ocupando mais de uma página.

### `renderMarkdown` (cliente): ocultar a sentinela da pré-visualização ao vivo

O mesmo `fullText` (agora contendo `<!--PAGEBREAK-->`) também é enviado via SSE (`token`/`done`) e renderizado ao vivo no navegador por `renderMarkdown()` (`public/app.js`). Sem tratamento, a sentinela apareceria como texto literal na tela. Correção mínima, no início da função, antes do escape de HTML:

```javascript
function renderMarkdown(text) {
  text = text.replace(/^<!--PAGEBREAK-->\n?/gm, '');
  // ... resto da função inalterado
}
```

Isso afeta apenas a exibição no navegador — o `content` bruto que chega a `buildDocx` no servidor não passa por `renderMarkdown`, então a quebra de página real no `.docx` não é afetada.

## Risks / Trade-offs

- [Risco] A IA pode ocasionalmente não seguir o formato exato "Nota: X.XX" → Mitigação: regex tolerante a variação de casas decimais, fallback para "N/A" sem quebrar a geração do relatório.
- [Risco] Cursos com muitíssimas aulas podem fazer a lista-resumo ultrapassar uma página física → Mitigação: aceito como trade-off documentado; a lista continua sendo a seção final do documento em qualquer caso.
- [Risco] Adicionar uma seção a mais no prompt de cada aula aumenta ligeiramente o tamanho da resposta/tempo de geração por aula → Mitigação: aumento marginal (poucas linhas), mesmo modelo (`MODEL_ECONOMY`), sem chamadas adicionais à API.

## Migration Plan

Mudança aditiva em um prompt e num parser de texto já existentes — nenhuma migração de dados. Relatórios de revisão gerados antes desta mudança simplesmente não têm a seção de notas; a próxima geração já inclui automaticamente. Rollback trivial: reverter o prompt e o trecho de extração/montagem no endpoint.
