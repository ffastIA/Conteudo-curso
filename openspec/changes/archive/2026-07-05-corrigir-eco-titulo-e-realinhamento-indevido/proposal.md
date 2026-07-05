# Proposal: corrigir-eco-titulo-e-realinhamento-indevido

## Why

Depois da correção `corrigir-duplicacao-patch-secional` (que adicionou a rede de segurança contra duplicação e o aviso ao vivo de rejeição), o usuário rodou "Aplicar melhorias" no curso Capcut Oficina e viu **as 3 aulas rejeitadas**, cada uma por um título diferente e genérico ("objetivos da aula", o próprio título da Aula 2, "fundamentação técnica"). Rejeitar 100% das aulas é sinal de falso positivo sistemático — a rede de segurança está corretamente detectando uma "duplicação", mas a causa dela é inofensiva: `aplicarMelhoriasSkill` não proíbe o modelo de reafirmar o título da seção como primeira linha do próprio corpo (comportamento comum de LLM). Quando isso acontece, `parseSecoesFixas` sobre o texto reconstruído encontra o mesmo título duas vezes — o cabeçalho real e o eco dentro do corpo — e a rede de segurança rejeita o merge inteiro, mesmo sem duplicação real de conteúdo.

Além disso, mesmo com as 3 aulas rejeitadas (conteúdo integralmente preservado), o **plano de aula foi realinhado assim mesmo**. Isso vem do filtro de elegibilidade para realinhamento, que inclui uma aula sempre que ela tem melhorias pendentes na lista — mesmo que o conteúdo não tenha mudado de fato (aula truncada, rejeitada por score, ou agora também rejeitada pela rede de segurança). Essa exceção foi adicionada propositalmente em uma mudança anterior desta sessão, sob a premissa de que "uma melhoria pode se referir só ao plano". O usuário aponta, de forma direta, que isso é indesejado: sem mudança real de conteúdo, o plano deve permanecer intocado.

## What Changes

- `mergeSecoesConteudo` passa a remover, do corpo de cada seção substituída, uma eventual primeira linha que apenas ecoa o título normalizado da seção-alvo, antes de montar a reconstrução — neutraliza a causa do falso positivo na origem, sem enfraquecer a rede de segurança para os casos que ela deve mesmo pegar.
- O filtro de elegibilidade para realinhamento do plano de aula deixa de considerar "tem melhorias pendentes" como critério suficiente — passa a depender exclusivamente de mudança real de conteúdo detectada (similaridade ≤ 0.90). Isso reverte a exceção adicionada para aulas truncadas/rejeitadas por score, e mantém consistência com o comportamento que a própria "Realinhamento do plano de aula" já documentava para aulas pouco alteradas.

## Non-goals

- Não reavalia nem reprocessa ciclos anteriores automaticamente — o usuário precisa revisar manualmente se o `plano_de_aula` atual do Capcut Oficina foi afetado pelo comportamento anterior.
- Não elimina a rede de segurança nem relaxa seu limiar — só sanitiza a entrada para reduzir a chance de gatilho espúrio.
- Não impede que uma melhoria genuinamente sobre o plano (sem correspondência no conteúdo) deixe de ser considerada — essa capacidade já não dependia deste filtro para aulas com conteúdo efetivamente alterado; a mudança apenas remove a exceção para aulas sem qualquer mudança de conteúdo.

## Impact

- **Código**: `server.js` (`mergeSecoesConteudo`: sanitização de eco de título; filtro `alteradas` no bloco de realinhamento).
- **Specs**: `improvement-application-cycle` — revisão dos requisitos "Proteção contra persistência de respostas truncadas" e "Gate de aceite por score no ciclo de melhorias" (removem a afirmação de elegibilidade ao realinhamento por melhorias pendentes); nova seção no requisito de patch por seção cobrindo a sanitização do eco de título.
- **Comportamento observável**: aulas cujo conteúdo não muda (por qualquer motivo) deixam de disparar realinhamento do plano; a rede de segurança deve parar de rejeitar sistematicamente todas as aulas.
