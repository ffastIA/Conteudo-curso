# Design: score-e-convergencia-melhorias

## Context

Hoje, `revisaoQualidadeSkill` pede ao modelo uma nota holística `Nota: X.XX`, extraída por regex (`server.js`, `/api/revisao-qualidade`) e listada em "# Notas de Qualidade por Aula" ao final do relatório. No ciclo de melhorias (`/api/aplicar-melhorias/confirmar`), o candidato revisado é sempre persistido, sem avaliação prévia — a única proteção existente é a guarda de truncamento e a verificação mecânica de inconsistências (comparação de similaridade + termo-chave), que detectam "não mudou" ou "termo ausente", mas não avaliam se a mudança foi uma **melhora real**.

## Goals / Non-Goals

**Goals:** score comparável entre chamadas (não apenas holístico e absoluto); só persistir melhorias que de fato elevem a qualidade; sinalizar convergência ao usuário antes de mais um ciclo de baixo ganho.

**Non-Goals:** gate por seção/melhoria individual; eliminar completamente a necessidade de revisão humana; garantir que o LLM-juiz nunca erre (mitigado, não eliminado).

## Decisions

1. **Julgamento pareado numa única chamada, não comparação de dois scores absolutos.**
   É a mudança estrutural central. Comparar `scoreAntes` (de uma chamada) com `scoreDepois` (de outra chamada, minutos depois, com o modelo "sem memória" do que julgou antes) é exatamente o padrão que já falha hoje. Colocar original e candidato **no mesmo prompt, no mesmo contexto**, pedindo os dois julgamentos lado a lado, faz o viés de calibração do LLM ser compartilhado pelos dois — o que sobra é o delta real. É o desenho padrão de LLM-as-judge para comparação A/B, mais confiável que scoring absoluto independente.

2. **Rubrica decomposta (5 critérios 0–10) em vez de nota holística 0–1.**
   Pedir "dê uma nota" produz respostas mais ruidosas que pedir "avalie separadamente estes 5 aspectos". Os pesos (30/25/20/15/10) refletem a ordem de prioridade pedida pelo usuário: aderência ao plano de aula primeiro (é o contrato mais imediato da aula), depois plano de ensino/ementa (escopo do curso), depois nível/público/modalidade (já são eixos existentes no sistema — reusar `nivelBlock`/bloco de modalidade como contexto do julgamento), depois qualidade didática e clareza.

3. **Score = 0.7 × RubricaLLM + 0.3 × Determinístico — a parte determinística é uma âncora contra ruído do LLM, não um substituto.**
   Três componentes, todos funções puras e baratas (zero chamada de API):
   - **Cobertura de objetivos**: fração dos termos significativos de `aula.objetivos` (tokenizados, normalizados como `normalizeTitulo`) presentes no texto da aula.
   - **Penalidade de sobreposição**: reusa o Jaccard já calculado em `sobreposicoesPorAula` (revisão) ou recalculado sob demanda (melhorias) — `1 - max(0, similaridadeMáxima - 0.55)`, mesmo limiar de sobreposição já usado no sistema.
   - **Completude estrutural**: fração de seções esperadas (fundamentação/exemplos/erros comuns/síntese) detectáveis por título tolerante — mesmo padrão de busca de título usado em `mergeSecoesConteudo`/`normalizeTitulo`.
   Pesos 70/30: a rubrica do LLM captura nuance que o determinístico não alcança (é a maior parte do peso), mas sozinha é vulnerável a viés de calibração — o componente determinístico não muda entre chamadas, então ele estabiliza o score composto mesmo que a rubrica LLM oscile um pouco.

4. **Mesma fórmula, duas skills diferentes — não uma reaproveitando a outra.**
   `revisaoQualidadeSkill` já gera um relatório narrativo longo lido por humanos (Compatibilidade, Adequação, Sobreposições, Deficiências, Observações) — não faz sentido pedir JSON estrito ali, quebraria o formato de documento. Só a subseção "Nota de Qualidade" muda (de holística para os 5 critérios em linhas parseáveis); o resto do relatório continua texto livre.
   `scoreAulaSkill` (nova) é machine-only: sem prosa, `response_format: json_object`, existe só para alimentar o gate do ciclo de melhorias. As duas convergem na mesma função pura `computeScoreComposto(rubricaLLM, determ)` — a fórmula é uma só, a origem dos 5 critérios crus é que difere (uma vem de um relatório humano-legível parseado, a outra de um JSON estrito).

5. **Parser da rubrica com fallback para o formato antigo.**
   `parseRubricaCriterios(texto)`: regex por rótulo fixo (`Aderência ao Plano de Aula:\s*(\d+(?:\.\d+)?)\s*/\s*10`, etc.) para os 5 critérios. Se nenhum critério for encontrado (o modelo ignorou o formato pedido), cai no regex antigo `Nota:\s*([01](?:\.\d+)?)` como nota direta (sem componente determinístico aplicado, já que não há rubrica para compor) — nunca pior que o comportamento atual, e nunca deixa a nota como "N/A" só porque o formato mudou.

6. **Gate por aula, delta absoluto (não percentual) com epsilon 0.02.**
   `scoreCandidato >= scoreOriginal + 0.02`. Epsilon absoluto é mais simples de explicar e calibrar que um percentual (que se comporta mal perto de zero). O valor 0.02 replica o mesmo usado para convergência — mesma ordem de grandeza de "ganho insignificante" em ambos os contextos, decisão consistente.

7. **Convergência: aviso no upload, não bloqueio no clique de aplicar.**
   O aviso aparece no `POST /api/aplicar-melhorias` (upload do documento anotado), reusando exatamente o padrão visual e de fluxo do `bannerDuplicata` já existente (`public/app.js`) — o usuário já está acostumado a esse tipo de confirmação nesse ponto do fluxo. Ganho médio do último ciclo (`score_historico.json`) abaixo de 0.02 dispara o aviso; usuário decide se aplica mesmo assim.

8. **`score_historico.json` guarda deltas reais, não previsões.**
   `ganhoMedio` de um ciclo é a média de `(scoreCandidato - scoreOriginal)` sobre todas as aulas avaliadas naquele ciclo (aulas rejeitadas contam delta zero, aulas puladas por truncamento não entram na média — não há score para elas). Isso mede o que o ciclo **realmente** entregou, não o que era esperado.

## Risks / Trade-offs

- [Juiz pareado ainda é um LLM, pode errar] → rubrica decomposta + componente determinístico + epsilon de 0.02 absorvem parte do ruído; erro residual é assimétrico por design (rejeitar uma melhoria boa é recuperável no próximo ciclo; aceitar uma piora é o que o gate existe para evitar).
- [Melhoria pedagogicamente necessária mas neutra em score, ex.: correção factual pontual, pode ser rejeitada] → fica registrada no relatório com os dois scores; o revisor pode reaplicá-la manualmente editando a seção estruturada do próximo ciclo (fluxo já existente, sem mudança necessária).
- [+1 chamada por aula no ciclo de melhorias] → custo aceito explicitamente pelo usuário.
- [Mudança na "Nota de Qualidade" pode alterar números vistos pelo usuário em relatórios já vistos antes] → esperado e desejado — o número passa a ser mais confiável, não apenas diferente.

## Migration Plan

Sem migração de dados — `score_historico.json` nasce vazio no primeiro ciclo pós-mudança; projetos existentes simplesmente não têm aviso de convergência até acumularem histórico. Rollback = revert do commit.

## Open Questions

Nenhuma — pesos, fórmula e limiares definidos com o usuário na fase de planejamento.
