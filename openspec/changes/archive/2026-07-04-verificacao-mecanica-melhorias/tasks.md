# Tasks: verificacao-mecanica-melhorias

## 1. Similaridade de seção — conteúdo

- [x] 1.1 Estender `mergeSecoesConteudo` (`server.js:269`): capturar o texto antigo (`antes`/trecho da seção) antes de cada substituição, calcular `textSimilarity(antigo, corpo)` e acumular em `suspeitas: [{ titulo, similaridade }]` para similaridade ≥ `LIMIAR_SECAO_SUSPEITA = 0.85`; não aplicar a seções novas
- [x] 1.2 Atualizar o call site do loop de melhorias (`server.js` ~2327) para capturar `suspeitas` e acumulá-las por aula

## 2. Similaridade de seção — plano de aula

- [x] 2.1 No loop de realinhamento (`server.js` ~2400-2429): calcular `textSimilarity(planoAulaTrechoAtual, corpo)` antes de `replaceLessonBlock`; acumular sinalização quando ≥ 0.85, identificando a aula

## 3. Checagem de termo-chave

- [x] 3.1 Função pura `extrairTermosEsperados(melhoria)`: regex de termo entre aspas + regex de sigla maiúscula (2-8 letras); retorna lista de termos
- [x] 3.2 Função `termoAusente(termo, conteudoFinal, planoFinal)`: normalização tolerante a acento/caixa (reusar padrão de `normalizeTitulo`), retorna `true` se ausente dos dois textos
- [x] 3.3 Passo final do ciclo (após conteúdo e plano finalizados): para cada aula, para cada melhoria, extrair termos e checar ausência; acumular sinalizações

## 4. Relatório

- [x] 4.1 Montar a seção `## Verificação Automática — Possíveis Inconsistências` agregando as sinalizações de similaridade (conteúdo e plano) e de termo ausente, com aula e detalhe de cada item; acrescentar ao `reportSections`/relatório final somente se houver ao menos uma sinalização

## 5. Testes

- [x] 5.1 `mergeSecoesConteudo`: seção substituída idêntica → aparece em `suspeitas`; seção substituída com reescrita substancial → não aparece; seção nova → nunca aparece em `suspeitas`
- [x] 5.2 `extrairTermosEsperados`: termo entre aspas extraído; sigla maiúscula extraída; melhoria sem termo/sigla retorna lista vazia
- [x] 5.3 `termoAusente`: termo presente no conteúdo (não no plano) → não ausente; termo presente só no plano → não ausente; ausente dos dois → ausente; tolerante a acento/caixa
- [x] 5.4 `npx jest` completo verde + `node --check`

## 6. Validação e fechamento

- [ ] 6.1 E2E manual: rodar um ciclo de melhorias no projeto "Capcut Oficina" e confirmar que a seção de verificação aparece no relatório quando aplicável
- [ ] 6.2 Sync do spec, arquivar o change, commit, push
