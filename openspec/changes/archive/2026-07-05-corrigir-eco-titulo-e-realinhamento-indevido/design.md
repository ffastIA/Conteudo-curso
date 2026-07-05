# Design: corrigir-eco-titulo-e-realinhamento-indevido

## Context

Evidência real (traceback do usuário, curso Capcut Oficina): as 3 aulas de um ciclo de melhorias foram rejeitadas pela rede de segurança adicionada em `corrigir-duplicacao-patch-secional`, cada uma citando um título diferente e genérico. Rejeição de 100% das aulas, com títulos tão diversos entre si, indica um padrão sistemático na ENTRADA do merge, não uma coincidência de conteúdo. Ao mesmo tempo, o realinhamento do plano de aula rodou mesmo com as 3 aulas rejeitadas — o conteúdo não mudou, mas o plano mudou assim mesmo.

## Goals / Non-Goals

**Goals**: eliminar a causa mais provável do falso positivo sem enfraquecer a proteção real; garantir que "sem mudança de conteúdo" implique "sem mudança de plano".

**Non-Goals**: reformular a rede de segurança ou o gate de score; recuperar automaticamente ciclos já afetados.

## Decisions

### 1. Sanitizar o corpo removendo eco de título, não relaxar a rede de segurança

`aplicarMelhoriasSkill` instrui: `<<<SECAO: título>>>\n(conteúdo revisado completo desta seção)\n<<<FIM_SECAO>>>` — o placeholder não deixa explícito que o corpo NUNCA deve reabrir com o próprio título. LLMs frequentemente "recapitulam" o assunto no início de uma resposta, mesmo quando instruídos a produzir só o corpo. Quando isso ocorre, a reconstrução do merge insere: `[cabeçalho real] [linha em branco] [corpo, cuja primeira linha ecoa o título] [linha em branco] [resto do corpo]` — ao reprocessar esse resultado, `parseSecoesFixas` encontra o título duas vezes, e a rede de segurança (corretamente, dado o que ela vê) rejeita.

A correção atua na ENTRADA (o corpo antes de ser inserido), não na rede de segurança em si: remove uma primeira linha do corpo (após linhas em branco iniciais) cujo texto normalizado seja igual ao título normalizado da seção sendo substituída. Isso é seguro porque:
- Só afeta corpos que começam EXATAMENTE ecoando o título da própria seção-alvo — nunca remove conteúdo substantivo.
- Não enfraquece a detecção de um título GENUINAMENTE diferente introduzido por acidente em outro lugar do corpo (o cenário que a rede de segurança foi desenhada para pegar, coberto pelo teste "rejeita merge se o corpo novo introduzir um cabeçalho duplicado por acidente" já existente).

### 2. Elegibilidade de realinhamento passa a depender só de mudança real de conteúdo

O filtro atual (`server.js`, fase de realinhamento):
```js
const alteradas = metricasPorAula.filter(m =>
  m.similaridade <= 0.90 || (observacoes[m.aulaIndex - 1]?.melhorias?.length > 0)
);
```
trata "tem melhorias pendentes" como suficiente para elegibilidade, independente de o conteúdo ter mudado. Essa exceção foi adicionada para cobrir aulas truncadas (posteriormente estendida ao gate de score) sob a premissa de que uma melhoria poderia ser só sobre o plano. Na prática, isso significa que TODA aula com melhorias na lista aciona `realinharPlanoAulaSkill` mesmo sem qualquer mudança de conteúdo — e essa skill recebe a lista de melhorias e tenta aplicá-las diretamente no plano, o que pode alterar o plano mesmo quando a intenção da melhoria era sobre o conteúdo (que falhou/foi rejeitado), não sobre o plano.

O requisito original "Realinhamento do plano de aula após aplicação de melhorias" já documentava o comportamento correto ("Aula pouco alterada é pulada... similaridade > 0.90"); a exceção quebrou essa consistência. A correção remove a exceção: `alteradas = metricasPorAula.filter(m => m.similaridade <= 0.90)`. Uma melhoria genuinamente sobre o plano, sem qualquer correspondência no conteúdo, deixa de acionar o realinhamento automático nesse caso específico — trade-off aceito explicitamente pelo usuário em troca de nunca alterar o plano sem uma mudança real de conteúdo por trás.

## Risks / Trade-offs

- [Sanitização do eco de título pode remover, num caso raro, uma linha que LEGITIMAMENTE repete o título como parte do conteúdo (ex.: um exemplo que cita o nome da seção)] → risco baixo: só dispara quando a linha INTEIRA (após trim) normaliza para exatamente o título da seção, não para menções parciais.
- [Melhoria puramente sobre o plano, numa aula cujo conteúdo não mudou, deixa de ser aplicada automaticamente] → aceito explicitamente pelo usuário; o revisor pode reaplicá-la editando diretamente o plano de aula.
- [Ciclos já rodados com o comportamento antigo podem ter alterado planos indevidamente] → não há reversão automática neste change; recomendação de revisão manual.

## Migration Plan

Sem migração de dados. Recomenda-se ao usuário revisar manualmente o `plano_de_aula` atual do Capcut Oficina.
