# Tasks: corrigir-duplicacao-patch-secional

## 1. Reescrita de `mergeSecoesConteudo` (server.js)

- [x] 1.1 `parseSecoesFixas(texto)`: percorre `texto.split('\n')` uma vez; candidato a cabeçalho = linha não vazia, precedida por linha vazia (ou início do documento), seguida por linha vazia, `< 90` caracteres, começando por `[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ0-9#*]`, sem terminar em `.,:;!?`. Retorna lista ordenada `[{ titulo, tituloNorm, inicioHeading, inicioCorpo, fimCorpo }]` (fim = próximo candidato ou fim do texto)
- [x] 1.2 Extração e deduplicação dos blocos do patch: manter o regex atual `<<<SECAO:...>>>...<<<FIM_SECAO>>>`; agrupar por `tituloNorm`; se houver mais de um bloco com o mesmo título, manter só o último e registrar em `suspeitas` como `{ titulo, motivo: 'duplicado_no_patch' }`
- [x] 1.3 Correspondência exata contra `parseSecoesFixas(textoOriginal)` (não `.includes()`); título com múltiplas ocorrências na lista fixa → aplicar só à primeira e registrar `{ titulo, motivo: 'titulo_ambiguo', ocorrencias: N }` em `suspeitas`; título sem correspondência → fila de "seções novas"
- [x] 1.4 Reconstrução em passe único: iterar a lista fixa em ordem, emitindo corpo novo (se targeted) ou original; anexar seções novas ao final, na ordem do patch
- [x] 1.5 Preservar o cálculo de similaridade suspeita (`LIMIAR_SECAO_SUSPEITA`) para substituições normais, como hoje
- [x] 1.6 Rede de segurança pós-merge: contar ocorrências de cada `tituloNorm` no resultado; se exceder o esperado (original + novas), retornar `{ texto: textoOriginal, substituidas: [], novas: [], suspeitas: [{ motivo: 'merge_rejeitado_duplicacao' }] }` — nunca persistir o resultado inconsistente
- [x] 1.7 Manter a assinatura e o formato de retorno `{texto, substituidas, novas, suspeitas}` (compatibilidade com os chamadores existentes)

## 2. Ajuste no chamador (server.js, `/api/aplicar-melhorias/confirmar`)

- [x] 2.1 Tratar os novos motivos em `suspeitas` (`duplicado_no_patch`, `titulo_ambiguo`, `merge_rejeitado_duplicacao`) nas mensagens já enviadas para `inconsistenciasVerificacao` — mensagens claras por motivo, reaproveitando o padrão de texto já usado para o caso de similaridade suspeita
- [x] 2.2 Quando `merge_rejeitado_duplicacao` ocorrer, tratar a aula como as demais falhas de guarda (preservar `textoAntigo`, `similaridade: 1`, seguir para a próxima aula) — mesma política já usada para truncamento e rejeição por score

## 3. Reforço do prompt de continuação (server.js)

- [x] 3.1 Adicionar à instrução de continuação (guarda de truncamento, ciclo de melhorias): não reescrever nenhum bloco `<<<SECAO:>>>...<<<FIM_SECAO>>>` já fechado na tentativa anterior — continuar apenas o que ficou incompleto

## 4. Testes

- [x] 4.1 `parseSecoesFixas`: identifica cabeçalhos isolados por linha em branco; ignora frases de corpo que contêm o texto de um título como substring; ignora frases terminadas em pontuação mesmo se curtas
- [x] 4.2 `mergeSecoesConteudo` — caso feliz: substitui uma seção existente preservando as demais byte a byte
- [x] 4.3 `mergeSecoesConteudo` — não confunde menção em texto corrido com cabeçalho (regressão do bug relatado)
- [x] 4.4 `mergeSecoesConteudo` — blocos duplicados do mesmo título no mesmo patch: mantém só o último, sinaliza o descarte
- [x] 4.5 `mergeSecoesConteudo` — título ambíguo no original (2+ ocorrências): aplica só à primeira, sinaliza a ambiguidade
- [x] 4.6 `mergeSecoesConteudo` — seção nova é acrescentada ao final, como hoje
- [x] 4.7 `mergeSecoesConteudo` — rede de segurança: força um cenário onde o resultado teria título duplicado e confirma que o merge é rejeitado (texto original preservado)
- [x] 4.8 `npx jest` completo verde (153/153) + `node --check`

## 5. Script de limpeza (execução única)

- [x] 5.1 Script standalone (`scripts/limpar-duplicacoes-secao.js`) reaproveitando `parseSecoesFixas` e `textSimilarity` (exportadas de `server.js`): para cada uma das 3 aulas, identifica seções duplicadas comparando a similaridade de CONTEÚDO de cada ocorrência contra a última ocorrência mantida do mesmo título — não apenas o título isolado. Ajuste feito durante a implementação: a primeira versão deduplicava só por título globalmente, o que apagava conteúdo legítimo de objetivos/subtópicos diferentes que reusam o mesmo título genérico (ex.: "Fundamentação Técnica" por objetivo, na Aula 3); a versão corrigida usa `LIMIAR_DUPLICATA = 0.45` sobre `textSimilarity` do corpo para distinguir duplicata real de repetição legítima
- [x] 5.2 Regrava `scr/aulaNN_conteudo.txt` e reconstrói `aulaNN_conteudo.docx` na raiz do projeto usando `buildDocx` + `Packer.toBuffer` (mesmo padrão de `persistStage`), preservando o rótulo/título de cada aula
- [x] 5.3 Rodado sobre as 3 aulas reais do curso Capcut Oficina. Nota de execução: a primeira aplicação (algoritmo global-por-título) corrompeu Aula 3 apagando Objetivos 2 e 3; recuperado a partir de `scr/ciclo_015/` (penúltimo estado salvo, um ciclo antes do mais recente — a única perda é o que o último ciclo teria mudado, que pelo padrão observado era mais duplicação) e reaplicado com o algoritmo corrigido, com confirmação explícita do usuário antes de sobrescrever os arquivos pela segunda vez. Resultado final: Aula 1 13→10 seções, Aula 2 87→51, Aula 3 32→21, todo o conteúdo distinto por objetivo/subtópico preservado; validado visualmente nos `.docx` regenerados. Alguns pares de cabeçalho adjacentes ainda duplicados sobrevivem em casos de similaridade abaixo do limiar (principalmente na Aula 2, cujo histórico de corrupção é mais irregular) — resíduo cosmético aceito conscientemente em vez de arriscar um limiar mais agressivo

## 6. Fechamento

- [ ] 6.1 Sync das specs (`improvement-application-cycle`), arquivar o change, commit, push
