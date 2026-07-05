# Proposal: score-e-convergencia-melhorias

## Why

O ciclo "revisar → aplicar melhorias → revisar" nunca converge: a cada revisão o modelo sempre encontra algo a melhorar, e o score da aula às vezes **piora** depois de aplicar as melhorias. Causa raiz: a "Nota de Qualidade" atual (`skills.js`, seção `### Nota de Qualidade` de `revisaoQualidadeSkill`) é um número holístico único, autoatribuído pelo modelo, em **chamadas independentes** a cada ciclo — scores absolutos de chamadas de LLM separadas têm variância maior que o ganho real de uma melhoria pontual, então comparar "nota do ciclo N" com "nota do ciclo N+1" não é confiável. Além disso, hoje **nada avalia a melhoria antes de persisti-la** — o conteúdo revisado é sempre salvo, mesmo quando piora.

## What Changes

- **Fórmula de score explícita e documentada**: `Score = 0.7 × RubricaLLM + 0.3 × Determinístico`, onde `RubricaLLM` é a média ponderada de 5 critérios (aderência ao plano de aula, aderência a plano de ensino/ementa, adequação a nível/público/modalidade, qualidade didática, clareza/estrutura) e `Determinístico` combina cobertura de objetivos, penalidade de sobreposição Jaccard e completude estrutural — funções puras, sem chamada de API.
- **`revisaoQualidadeSkill`**: a seção "Nota de Qualidade" deixa de pedir um número holístico autoatribuído; passa a pedir os 5 critérios em linhas parseáveis (`Critério: N/10`). O servidor calcula a nota final pela fórmula acima (mesmo cálculo usado no gate abaixo).
- **Novo julgamento pareado antes de aplicar** (`scoreAulaSkill`, JSON estrito): dentro do ciclo de melhorias, depois de gerar o candidato revisado (patch já mesclado) e antes de persisti-lo, uma chamada compara **original × candidato lado a lado** nos mesmos 5 critérios. Julgamento pareado numa única chamada é mais estável que comparar dois scores absolutos de chamadas separadas — o viés de calibração do LLM se cancela.
- **Gate de aceite por aula**: candidato só é persistido se `scoreCandidato >= scoreOriginal + 0.02`. Caso contrário, o conteúdo anterior é preservado e o relatório registra os dois scores — mesma filosofia de "nunca persistir uma piora" já aplicada ao truncamento.
- **Convergência (early stopping)**: histórico de scores por ciclo persistido em `scr/score_historico.json`. Se o ganho médio do último ciclo for menor que 0.02, o próximo upload de revisão anotada exibe um aviso (mesmo padrão visual do banner de duplicata já existente) perguntando se o usuário realmente quer aplicar mais melhorias.
- Relatório de melhorias ganha seção `## Scores do Ciclo` (antes → depois, aceita/rejeitada, por aula).

## Capabilities

### New Capabilities

- `quality-scoring`: fórmula de score, funções determinísticas, julgamento pareado e histórico de convergência — mecanismo compartilhado entre revisão de qualidade e aplicação de melhorias.

### Modified Capabilities

- `content-quality-review`: a Nota de Qualidade passa a ser calculada pela fórmula de `quality-scoring` em vez de autoatribuída pelo modelo.
- `improvement-application-cycle`: novo gate de aceite por aula baseado em score; aviso de convergência no upload; seção de scores no relatório.

## Non-goals

- Não decompõe o gate por seção/por melhoria individual — a decisão é por aula (aceitar ou rejeitar o candidato inteiro). Granularidade mais fina fica para iteração futura.
- Não substitui a guarda de truncamento nem a verificação mecânica de inconsistências já existentes — o gate de score é uma camada adicional, não uma substituição.
- Não corrige retroativamente ciclos já executados sem histórico de score.
- Não introduz classificação automática de "essa melhoria é cosmética, ignore o score" — toda melhoria rejeitada por score fica visível no relatório para decisão humana.

## Impact

- **Código**: `skills.js` (nova `scoreAulaSkill`; `revisaoQualidadeSkill` com seção de Nota reformulada); `server.js` (`computeScoreDeterministico`, `computeScoreComposto`, `parseRubricaCriterios`, gate no loop de melhorias, leitura/escrita de `score_historico.json`, aviso de convergência no upload); `public/app.js` (banner de convergência, clone do padrão de duplicata).
- **Custo**: +1 chamada `gpt-4o-mini` por aula no ciclo de melhorias (o julgamento pareado) — barato, aceito pelo usuário como parte do trade-off.
- **Compatibilidade**: projetos sem `score_historico.json` (todos os existentes) seguem funcionando normalmente, sem aviso de convergência até que exista pelo menos um ciclo com histórico.
- **Testes**: funções determinísticas e a fórmula composta são puras e diretamente testáveis; parser de rubrica testável com textos fixos; prompts das duas skills testáveis pelo padrão já usado no projeto.
