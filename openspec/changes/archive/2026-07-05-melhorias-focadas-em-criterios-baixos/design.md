# Design: melhorias-focadas-em-criterios-baixos

## Context

O sistema de score (capability `quality-scoring`) estabeleceu rubrica de 5 critérios pesados (0.30/0.25/0.20/0.15/0.10) e um gate de aceite de +0.02 no composto. A geração de melhorias (`revisaoQualidadeSkill`, seção "Resumo de Melhorias Propostas") é anterior a esse sistema e não conhece a rubrica — produz sugestões genéricas cuja maioria não tem espaço matemático para passar no gate.

## Goals / Non-Goals

**Goals**: alinhar a geração de melhorias com o gate (sugerir o que tem chance real de elevar o score); acelerar a convergência por nivelamento; manter o contrato da seção estruturada intacto.

**Non-Goals**: filtrar melhorias na aplicação; mudar fórmula/pesos/gate; garantir que o LLM sempre respeite o direcionamento (o gate já cobre o caso de desobediência).

## Decisions

### 1. Direcionamento no prompt da revisão, com tag orientativa `[Critério]`

O "Resumo de Melhorias Propostas" é o que pré-preenche a seção "Melhorias a serem Aplicadas" do documento que o revisor edita. É o ponto único onde o direcionamento tem efeito sem quebrar contrato nenhum: a lista sugerida nasce focada, e o humano segue livre para editar. A tag `[Critério]` no início de cada item serve para (a) o revisor entender o porquê de cada sugestão e (b) `aplicarMelhoriasSkill` saber onde concentrar o patch — e viaja dentro do texto do item, então o parser estruturado existente não precisa de nenhuma mudança.

A instrução pede foco nos 1-2 critérios de menor nota (não só o mínimo): empates e quase-empates são comuns (ex.: três critérios em 8/10), e restringir a exatamente um critério jogaria fora sugestões de mesmo potencial. Com todos os critérios ≥ 9, o resumo declara "Nenhuma" — pelos pesos, nenhum ganho a partir de 9 passa no gate com folga, e declarar "Nenhuma" reforça o sinal de convergência para o usuário antes mesmo do banner de early stopping.

### 2. Linha de foco no relatório, calculada pelo servidor (não pelo LLM)

O servidor já parseia a rubrica (`parseRubricaCriterios`) para calcular a nota. Reusar esse resultado para imprimir "Foco sugerido desta rodada: <critério> (N/10)" custa ~10 linhas e dá ao revisor uma âncora mecânica (independente do LLM ter respeitado ou não o direcionamento no resumo). Quando a rubrica não for parseável (fallback para nota holística), a linha simplesmente não aparece — sem erro.

### 3. `aplicarMelhoriasSkill` lê a tag do próprio texto da melhoria

Nenhum campo novo trafega entre upload e aplicação: a tag `[Critério]` está dentro do texto do item da lista, que já chega à skill via o parâmetro `melhorias` existente. O prompt só ganha a instrução de interpretar a tag quando presente e concentrar o patch nas seções pertinentes àquele critério. Melhoria sem tag = comportamento atual, sem penalidade.

### 4. Gate permanece o árbitro

Nada nesta mudança decide aceite/rejeição. O julgamento pareado já pondera os critérios; uma melhoria que realmente eleve o critério baixo produz delta maior e passa. Se o modelo ignorar o direcionamento e gerar melhoria genérica, o gate a rejeita como hoje — o desenho é fail-safe por construção.

## Risks / Trade-offs

- [LLM pode ignorar a priorização ou tagear errado] → tag orientativa + gate mecânico a jusante; pior caso = status quo.
- [Nota baixa por ruído do juiz aponta o foco para o lugar errado] → custo de uma rodada de baixo efeito, recuperável no ciclo seguinte.
- [Melhorias legítimas de critério alto deixam de ser sugeridas automaticamente] → seguem possíveis via edição manual da seção estruturada (contrato existente e documentado).

## Migration Plan

Sem migração — mudanças de prompt e uma linha de relatório. Efeito imediato na próxima revisão de qualidade gerada.

## Open Questions

Nenhuma.
