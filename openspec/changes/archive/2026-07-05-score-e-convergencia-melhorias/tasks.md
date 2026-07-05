# Tasks: score-e-convergencia-melhorias

## 1. Funções puras de score (server.js)

- [x] 1.1 `computeScoreDeterministico(texto, aula, sobreposicaoMaxima)`: cobertura de objetivos (normalização tolerante, reusar padrão de `normalizeTitulo`), penalidade de sobreposição (`1 - max(0, sobreposicaoMaxima - 0.55)`), completude estrutural (títulos esperados detectáveis, mesmo padrão de busca de `mergeSecoesConteudo`) — retorna média dos 3 e os componentes individuais
- [x] 1.2 `computeScoreComposto(rubricaLLM0a10, determ0a1, pesos)`: `PESOS_RUBRICA = { planoAula: 0.30, planoEnsinoEmenta: 0.25, nivelPublicoModalidade: 0.20, qualidadeDidatica: 0.15, clarezaEstrutura: 0.10 }`; converte rubrica 0-10 para 0-1, calcula média ponderada, compõe `0.7 × rubrica + 0.3 × determ`, clamp [0,1], arredonda a 2 casas
- [x] 1.3 `parseRubricaCriterios(texto)`: regex por rótulo fixo para os 5 critérios (`Critério:\s*(\d+(?:\.\d+)?)\s*/\s*10`); retorna `{ criterios, rubricaLLM }` ou `null` se nenhum critério for encontrado
- [x] 1.4 Exportar as 4 funções + constantes de peso/limiar (`EPSILON_ACEITE = 0.02`, `EPSILON_CONVERGENCIA = 0.02`) para teste

## 2. Nota de qualidade pela fórmula (revisão de qualidade)

- [x] 2.1 `revisaoQualidadeSkill` (`skills.js`): reformular a seção "### Nota de Qualidade" para pedir os 5 critérios em linhas parseáveis (`Critério: N/10`) em vez da nota holística "Nota: X.XX"
- [x] 2.2 `/api/revisao-qualidade` (`server.js`): após `streamSkillToClient`, tentar `parseRubricaCriterios(texto)`; se sucesso, calcular `computeScoreDeterministico` a partir de `aula.texto`/`aula.objetivos`/maior similaridade em `sobreposicoesPorAula[i]`, compor a nota final via `computeScoreComposto`; se falhar, fallback para o regex antigo `Nota:\s*([01](?:\.\d+)?)`; se ambos falharem, nota `null` ("N/A", comportamento atual)

## 3. Julgamento pareado (novo)

- [x] 3.1 Nova `scoreAulaSkill` (`skills.js`, MODEL_ECONOMY, `response_format: json_object`): recebe original + candidato + trecho do plano de aula + ementa/plano de ensino truncados + nível/modalidade/público; retorna JSON `{ original: {5 critérios 0-10}, candidato: {5 critérios 0-10} }`, sem prosa
- [x] 3.2 Exportar a skill

## 4. Gate de aceite no ciclo de melhorias

- [x] 4.1 `/api/aplicar-melhorias/confirmar` (`server.js`): hoistar leitura de `ementa`/`planoEnsino`/`planoAula` para antes do loop principal de aulas (hoje só carregadas na fase de realinhamento, mais tarde)
- [x] 4.2 Após `mergeSecoesConteudo` produzir `textoMesclado`: chamar `scoreAulaSkill` (original=`textoAntigo`, candidato=`textoMesclado`), parsear JSON, calcular `computeScoreComposto` para as duas versões (rubrica do JSON + determinístico calculado a partir de cada texto)
- [x] 4.3 Gate: se `scoreCandidato >= scoreOriginal + EPSILON_ACEITE`, persistir como hoje; senão, preservar `textoAntigo`, registrar no relatório os dois scores, manter a aula na lista para o filtro de realinhamento (via melhorias pendentes, já existente)
- [x] 4.4 Falha na chamada do julgamento: log de erro, tratar como não avaliada (preserva o anterior), não interrompe o loop

## 5. Histórico e convergência

- [x] 5.1 `scr/score_historico.json`: helpers `readScoreHistorico(sess)`/`persistScoreHistorico(sess, registro)` (tolerantes a ausência/corrupção, padrão de `readTokenUsage`/`persistTokenUsage`); gravar ao final do ciclo de melhorias com `{ ciclo, dataHora, porAula, ganhoMedio }`
- [x] 5.2 `POST /api/aplicar-melhorias` (upload): ler o histórico; se `ganhoMedio` do último ciclo `< EPSILON_CONVERGENCIA`, incluir `avisoConvergencia` na resposta
- [x] 5.3 `public/app.js`: banner de convergência no resumo pós-upload, clonando o padrão visual/fluxo do `bannerDuplicata` existente (botões "Aplicar mesmo assim"/"Cancelar")

## 6. Relatório

- [x] 6.1 Seção `## Scores do Ciclo` no relatório de melhorias (antes/depois/aceita ou rejeitada, por aula avaliada)
- [x] 6.2 `meta.json` do ciclo (`ciclo_NNN/meta.json`): incluir os campos de score por aula ao lado das métricas já existentes

## 7. Testes

- [x] 7.1 `computeScoreDeterministico`: cobertura de objetivos (presente/ausente/parcial), penalidade de sobreposição (abaixo/acima do limiar), completude estrutural (todas/algumas/nenhuma seção presente)
- [x] 7.2 `computeScoreComposto`: pesos corretos, clamp [0,1], arredondamento
- [x] 7.3 `parseRubricaCriterios`: 5 critérios completos; parcial (menos de 5) → null; ausente → null; tolerante a variação de espaço/quebra de linha
- [x] 7.4 Prompt de `scoreAulaSkill`: contém original, candidato, referências (plano/ementa/nível/modalidade), instrução de JSON estrito com os 5 critérios para as duas versões
- [x] 7.5 Prompt de `revisaoQualidadeSkill`: contém as 5 linhas de critério pedidas, não mais a instrução de nota holística única
- [x] 7.6 `npx jest` completo verde + `node --check`

## 8. Validação e fechamento

- [ ] 8.1 E2E manual (servidor reiniciado): rodar um ciclo de melhorias e conferir a seção "Scores do Ciclo" no relatório, `score_historico.json` criado, e pelo menos uma decisão de aceite/rejeição coerente com os números
- [ ] 8.2 E2E manual: rodar um segundo ciclo com melhorias de baixo impacto e confirmar que o banner de convergência aparece no upload
- [ ] 8.3 Sync dos specs (nova capability `quality-scoring`; deltas em `content-quality-review` e `improvement-application-cycle`), arquivar o change, commit, push
