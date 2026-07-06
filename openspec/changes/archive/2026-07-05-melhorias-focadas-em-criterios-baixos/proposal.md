# Proposal: melhorias-focadas-em-criterios-baixos

## Why

As notas por critério de uma mesma revisão variam bastante (exemplo real da Aula 1 do Capcut Oficina: Plano de Aula 8/10, Plano de Ensino/Ementa 9/10, Nível/Público/Modalidade 7/10, Qualidade Didática 8/10, Clareza 8/10), mas o "Resumo de Melhorias Propostas" é gerado sem nenhum vínculo com a rubrica — o modelo sugere melhorias genéricas, muitas tocando critérios que já estão em 8-9/10.

Isso colide matematicamente com o gate de aceite (+0.02 no score composto): elevar um critério de peso 0.25 de 9→10 rende só +0.0175 no composto (rejeitado), enquanto elevar o critério mais baixo (7→9, peso 0.20) rende +0.028 (aceito). Melhorias em critérios já altos são incapazes de passar no gate — o resultado observado é o ciclo rejeitando tudo ("score não melhorou 0.87 → 0.87"). Direcionar as melhorias para o(s) critério(s) mais baixo(s) de cada aula é a única forma sistemática de gerar melhorias que passem no gate, e o nivelamento resultante acelera a convergência natural (tudo alto e nivelado → nada passa → early stopping).

## What Changes

- `revisaoQualidadeSkill`: o "Resumo de Melhorias Propostas" passa a ser derivado prioritariamente do(s) 1-2 critério(s) com menor nota da rubrica da própria aula; cada melhoria vem prefixada com o critério-alvo entre colchetes (ex.: `[Adequação a Nível/Público/Modalidade] Reescrever a definição de edição avançada com exemplo concreto`); com todos os critérios ≥ 9, o resumo declara "Nenhuma".
- `/api/revisao-qualidade`: o relatório ganha, por aula, a linha "Foco sugerido desta rodada: <critério mais baixo> (N/10)", calculada a partir da rubrica já parseada (`parseRubricaCriterios`).
- `aplicarMelhoriasSkill`: instrução para concentrar as mudanças nas seções relacionadas ao critério-alvo indicado na tag `[Critério]` de cada melhoria (quando presente), evitando tocar seções que já atendem critérios altos — efeito colateral positivo: patches menores, menos truncamento, menos tokens.
- A tag `[Critério]` é **orientativa**: melhoria sem tag continua válida e aplicável; nenhum filtro é imposto na aplicação (a seção estruturada continua sendo o contrato integral do que será aplicado, incluindo edições manuais do revisor).

## Non-goals

- Não filtra nem descarta melhorias na aplicação com base no critério-alvo — o direcionamento atua só na geração da lista sugerida.
- Não altera `scoreAulaSkill`, o gate de aceite, nem a fórmula de score — o gate continua sendo a validação mecânica de que o direcionamento funcionou.
- Não muda o parser da seção estruturada de melhorias — a tag viaja dentro do texto do item, transparente para o parser existente.

## Impact

- **Código**: `skills.js` (dois blocos de prompt: `revisaoQualidadeSkill` e `aplicarMelhoriasSkill`); `server.js` (linha de foco no relatório da revisão, reusando `parseRubricaCriterios` — nenhuma outra mudança no servidor).
- **Custo**: zero chamadas de API adicionais; sem endpoint novo; sem mudança de dados.
- **Risco**: baixo — se o modelo ignorar o direcionamento, o pior caso é o comportamento atual (melhoria genérica rejeitada pelo gate), nunca algo pior.
