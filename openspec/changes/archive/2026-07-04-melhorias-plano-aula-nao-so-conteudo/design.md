# Design: melhorias-plano-aula-nao-so-conteudo

## Context

O ciclo de melhorias (`/api/aplicar-melhorias/confirmar`) tem duas fases: (1) `aplicarMelhoriasSkill` revisa o conteúdo de cada aula com a lista de melhorias; (2) para aulas efetivamente alteradas, `realinharPlanoAulaSkill` sincroniza a seção correspondente do plano de aula ao novo conteúdo (`server.js:2380-2410`). A fase 2 recebe `conteudoMelhorado`, `ementa`, `planoEnsinoResumo` — mas não a lista `melhorias` em si, que só é usada na fase 1. Quando uma melhoria descreve um elemento que só existe no plano (não no conteúdo), a fase 1 não tem como corrigi-la de verdade (o alvo não está no texto que ela edita) e a fase 2 não sabe que precisa corrigi-la (não recebe a instrução). Resultado: a melhoria nunca é aplicada em lugar nenhum, mas o relatório da fase 1 registra "aplicada" porque o modelo tenta cumprir a instrução como pode dentro do documento que tem em mãos.

Evidência de produção (curso "Capcut Oficina"): 6 ciclos, mesma observação sobre modalidade repetida em todos; `plano_de_aula.txt` contém a atividade "Círculo de Histórias" intacta desde o início, apesar de `realinharPlanoAulaSkill` ter reescrito o arquivo em pelo menos 4 desses ciclos (aulas com similaridade ≤ 0.90).

## Goals / Non-Goals

**Goals:** melhorias que descrevem o plano de aula devem poder ser corrigidas no documento certo; eliminar o ciclo de repetição indefinida da mesma observação.

**Non-Goals:** classificação automática de "melhoria de conteúdo" vs. "melhoria de plano"; correção retroativa de ciclos já executados.

## Decisions

1. **Passar a lista completa de `melhorias` para `realinharPlanoAulaSkill`, sem classificação prévia.**
   Alternativa considerada: um passo de classificação (heurística ou chamada extra ao modelo) para decidir quais itens são "de plano" antes de enviar. Rejeitada: adiciona uma chamada/latência/custo extra e um novo ponto de falha, para um problema que um LLM já resolve naturalmente quando instruído — se a melhoria já foi endereçada no conteúdo (fase 1) e nada resta a fazer no plano, o modelo simplesmente não altera a seção; se a melhoria descreve algo que só existe no plano, agora ele tem a informação para agir.
   `melhorias` já é calculada uma vez por aula (`observacoes[i]?.melhorias`) e reutilizada como está — mesmo padrão de reuso de dado já em escopo adotado nas mudanças anteriores desta sessão (ex.: `getMetodologia`, `buildPedagogicalContext`).

2. **Instrução explícita na skill: corrigir também o que for do plano, mantendo os limites já existentes.**
   Acrescentar ao prompt: "Se alguma melhoria da lista abaixo descrever uma atividade, dinâmica ou recurso presente NESTA seção do plano (não necessariamente no conteúdo), corrija-a diretamente aqui." As regras de saída existentes (não alterar objetivos/escopo, alertar extrapolação de ementa/plano de ensino) permanecem — a mudança é aditiva, não substitui as guardas já implementadas em `realinhar-planos-pos-melhorias`.

3. **Sem novo parsing/relatório obrigatório.**
   A seção "Realinhamento de Planos" do relatório já existe (`substituidas`/`novas`, de `mergeSecoesConteudo`... nota: este mecanismo é do ciclo de *conteúdo*, não do plano — o plano usa `replaceLessonBlock`, sem rastreamento de "o que mudou por causa de qual melhoria"). Não introduzir rastreamento seccional aqui: manter simples, o log de progresso e a substituição da seção do plano já são visíveis o suficiente; complexidade adicional de auditoria fica para uma iteração futura se necessário.

## Risks / Trade-offs

- [Melhoria pertinente ao conteúdo aparecer também "reaplicada" no plano de forma redundante] → instrução restringe a atuação à seção do plano correspondente e mantém a regra de não inventar atividades sem relação com o conteúdo/escopo; risco baixo e sem efeito danoso (na pior hipótese, texto redundante revisável pelo humano).
- [Plano ainda não convergir em 1 ciclo se a melhoria for ambígua] → fora do escopo desta correção; o mecanismo geral (ciclo iterativo de revisão) já suporta múltiplos ciclos.

## Migration Plan

Sem migração. Efeito no próximo ciclo de melhorias de qualquer projeto. Projetos com observações já "presas" (como o Capcut Oficina) resolvem rodando mais um ciclo. Rollback = revert do commit.

## Open Questions

Nenhuma — escopo confirmado pelo usuário (implementação direta, formalizada nesta proposta a pedido dele).
