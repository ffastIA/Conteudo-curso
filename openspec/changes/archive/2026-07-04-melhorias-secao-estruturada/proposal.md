# Proposal: melhorias-secao-estruturada

## Why

O documento de revisão de qualidade existe para ser editado por um revisor humano, mas o parser do upload anotado (`POST /api/aplicar-melhorias`, `server.js:1855-1933`) é frágil: depende de N âncoras espalhadas pelo corpo ("Aula N" + "Observações do Revisor" por aula) e de uma heurística de fim de seção que pode truncar observações (linha só de letras iniciando com maiúscula é confundida com título). Qualquer edição do revisor que toque nessas âncoras quebra o processo silenciosamente. Além disso, o sistema só conta "aulas com observação" — não há contagem real de melhorias.

## What Changes

- O relatório de revisão passa a terminar com uma seção estruturada **"Melhorias a serem Aplicadas"**: para cada aula, a linha `Aula NN` seguida de uma melhoria por linha, com linha em branco entre aulas — **pré-preenchida** pelo sistema a partir do novo resumo de melhorias que a `revisaoQualidadeSkill` emitirá por aula (o revisor humano faz curadoria: apaga, edita, acrescenta itens).
- Linha de instrução fixa antes da seção: "Edite apenas os itens abaixo — uma melhoria por linha. O sistema aplicará exclusivamente o que estiver nesta seção."
- O upload passa a ler **somente** essa seção (última ocorrência da âncora, tolerante a acentos/caixa), mapeando blocos **pelo número da aula** e tratando **cada linha não vazia como uma melhoria** (o mammoth perde marcadores de lista do Word — prefixos `-`, `•`, `1.` são aceitos e removidos, nunca exigidos). Palavra reservada `Nenhuma` pula a aula explicitamente.
- **Fallback legado**: se a seção não existir no documento, o parser atual de "Observações do Revisor" é usado, com aviso na resposta.
- A confirmação passa a exibir **contagem real de melhorias por aula** ("Aula N: X melhorias").
- A `aplicarMelhoriasSkill` recebe as melhorias como **lista numerada** e a seção "### Melhorias Aplicadas" do resultado referencia cada número (aplicada ou "Não aplicado: motivo") — rastreabilidade 1-a-1 no relatório `melhorias_aplicadas_<ts>.docx`.
- O check de duplicata entre uploads continua funcionando (compara o texto dos itens).

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `content-quality-review`: o relatório gerado passa a incluir o resumo de melhorias por aula e a seção final consolidada "Melhorias a serem Aplicadas" com instrução ao revisor.
- `improvement-application-cycle`: novo parser da seção estruturada (com fallback legado), contagem por item na confirmação e aplicação numerada com rastreabilidade.

## Non-goals

- Não remove o parser legado (permanece como fallback — documentos antigos continuam funcionando).
- Não altera o ciclo de realinhamento de planos pós-melhorias (change `realinhar-planos-pos-melhorias`).
- Não muda o formato de arquivo (.docx via mammoth) nem o fluxo de confirmação existente.
- Não interpreta comentários/anotações nativas do Word (continuam invisíveis ao `extractRawText`).

## Impact

- **Gap relacionado**: nenhum do registro (G01–G07); robustez do ciclo humano-no-loop da Etapa 6.
- **Código**: `skills.js` (`revisaoQualidadeSkill` — subseção "Resumo de Melhorias Propostas"; `aplicarMelhoriasSkill` — lista numerada), `server.js` (montagem da seção consolidada no endpoint da revisão ~1750-1845; novo `parseMelhoriasEstruturadas` + fallback em ~1855-1933), `public/app.js` (contagem por aula no resumo pós-upload ~560-590).
- **Testes**: unitários do parser (linhas simples, prefixos, `Nenhuma`, aula fora de ordem, seção ausente → fallback) e de prompts.
- **Estimativa**: S/M — 4-6h. Risco principal (perda de marcadores de lista pelo mammoth) neutralizado pela regra "linha não vazia = item".
