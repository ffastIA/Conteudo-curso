# Proposal: melhorias-plano-aula-nao-so-conteudo

## Why

Diagnóstico em projeto real (curso "Capcut Oficina", 6 ciclos de melhorias): a mesma observação de revisão de qualidade — *"a inclusão da dinâmica 'Círculo de Histórias' é incompatível com a modalidade EaD declarada"* — reapareceu em **todos os ciclos**, apesar de o relatório de melhorias afirmar repetidamente "Substituído o 'Círculo de Histórias'...". Investigação confirmou: essa dinâmica existe **somente em `plano_de_aula.txt`**, nunca no conteúdo da aula. `aplicarMelhoriasSkill` só edita o conteúdo (`aula.texto`); ao receber uma melhoria que descreve algo do plano, o modelo não encontra o alvo real e produz uma seção nova no conteúdo só para "aparentar cumprimento" — o `plano_de_aula.txt`, onde o defeito de fato mora, nunca é tocado. A revisão de qualidade seguinte lê o mesmo plano intacto e repete a mesma observação — um ciclo que nunca converge.

O realinhamento de plano (`realinharPlanoAulaSkill`, introduzido em `realinhar-planos-pos-melhorias`) **roda a cada ciclo e chega a reescrever `plano_de_aula.txt`** (confirmado: `projeto.json` mostra `plano_de_aula.geradoEm` idêntico ao timestamp do último ciclo), mas ele só recebe o conteúdo melhorado e a ementa — nunca a lista de melhorias pedidas pelo revisor (`server.js:2393-2399` não passa `melhorias`, embora a variável já esteja disponível no mesmo escopo, uma linha acima na chamada de `aplicarMelhoriasSkill`). Por isso ele sincroniza o plano ao novo conteúdo, mas não sabe que precisa corrigir um item específico ali.

## What Changes

- `realinharPlanoAulaSkill` (`skills.js:589-619`) passa a receber `melhorias` (mesma lista já usada por `aplicarMelhoriasSkill`) e é instruída a **também corrigir, na seção do plano, qualquer melhoria que descreva uma atividade/dinâmica/recurso do plano** — não apenas sincronizar a seção ao conteúdo revisado.
- Call site em `server.js` (dentro do loop de realinhamento, `~2393`) passa `melhorias: observacoes[i]?.melhorias`.
- O relatório de melhorias (seção "Realinhamento de Planos") passa a poder registrar quando uma melhoria foi endereçada no **plano** (distinto de "seções revisadas" no conteúdo, já existente).

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `improvement-application-cycle`: o requisito "Realinhamento do plano de aula após aplicação de melhorias" passa a incluir a aplicação de melhorias que se referem especificamente ao plano de aula, não apenas a sincronização de seções com o conteúdo revisado.

## Non-goals

- Não cria um classificador separado para decidir se uma melhoria é "de conteúdo" ou "de plano" — a mesma lista completa é passada a ambas as skills (`aplicarMelhoriasSkill` e `realinharPlanoAulaSkill`); cada uma aplica o que for pertinente ao seu documento e ignora o resto (já é o comportamento esperado de um LLM bem instruído, sem necessidade de roteamento explícito).
- Não altera o mecanismo de detecção de escopo (`> ⚠️ ALERTA DE ESCOPO`) nem a guarda que impede alteração de ementa/plano de ensino.
- Não resolve retroativamente ciclos já executados — projetos como o "Capcut Oficina" precisarão de um novo ciclo de melhorias (ou edição manual do plano) para que o item específico seja finalmente corrigido.

## Impact

- **Código**: `skills.js` (`realinharPlanoAulaSkill` — novo parâmetro + instrução), `server.js` (um parâmetro a mais na chamada já existente, `~2393-2399`).
- **Risco**: baixo — reaproveita dado já calculado no mesmo escopo, sem nova chamada OpenAI nem novo parsing.
- **Testes**: prompt de `realinharPlanoAulaSkill` passa a conter a lista de melhorias e a instrução de corrigi-las no plano quando pertinente.
