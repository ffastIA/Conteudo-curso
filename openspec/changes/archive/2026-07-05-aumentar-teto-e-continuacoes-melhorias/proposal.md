# Proposal: aumentar-teto-e-continuacoes-melhorias

## Why

Em produção, a Aula 3 de um ciclo de melhorias ("Animações e Efeitos Dinâmicos", aula densa com várias seções técnicas) teve sua resposta cortada pelo teto de saída (`finish_reason: length`), a única tentativa de continuação também foi insuficiente, e o sistema corretamente preservou o conteúdo anterior — mas a melhoria daquela aula não foi aplicada neste ciclo. O usuário aceitou o trade-off de gastar mais tokens/tempo para reduzir a chance desse desfecho.

Nota à parte encontrada durante a análise: o requisito "Proteção contra persistência de respostas truncadas" afirma que uma aula truncada é excluída do realinhamento de plano — isso ficou desatualizado desde a mudança `melhorias-plano-aula-nao-so-conteudo`, que passou a incluir no realinhamento qualquer aula com melhorias pendentes, mesmo sem mudança de conteúdo (inclusive truncada). O comportamento real do sistema (confirmado no mesmo log de produção: a Aula 3 truncada foi realinhada normalmente) está correto; é a redação do requisito que ficou errada. Esta proposta corrige essa redação junto, por tocar o mesmo requisito.

## What Changes

- `MAX_TOKENS_AULA`: 10.000 → **16.000** tokens de saída — teto prático do `gpt-4o-mini` para esta família de chamadas, aplicado uniformemente (o valor é uma constante compartilhada por todas as gerações de conteúdo por aula, não só melhorias: conteúdo de aula, plano de aula, revisão de qualidade, pesquisa web e aplicação de melhorias passam a ter a mesma folga extra).
- Guarda de truncamento na aplicação de melhorias: de **1** para **até 2** tentativas de continuação antes de desistir e preservar o conteúdo anterior da aula.
- Correção de redação: o requisito de proteção contra truncamento passa a refletir corretamente que uma aula truncada permanece elegível para o realinhamento de plano quando tiver melhorias pendentes (comportamento já real desde a mudança anterior).

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `content-generation`: teto uniforme de tokens de saída por aula atualizado de 10.000 para 16.000.
- `improvement-application-cycle`: guarda de truncamento passa a permitir até 2 tentativas de continuação; redação sobre elegibilidade ao realinhamento corrigida.

## Non-goals

- Não introduz um teto diferenciado por aula/skill (a constante continua única e compartilhada — mudar isso seria uma decisão maior, fora do escopo deste ajuste pontual).
- Não elimina a possibilidade de truncamento — apenas reduz sua frequência; aulas extremamente densas ainda podem, em tese, exigir mais que 16.000 tokens de saída.
- Não altera o texto do prompt de continuação nem a lógica de detecção (`isRespostaMelhoriasCompleta`), só o número de tentativas permitidas.

## Impact

- **Código**: `server.js` (constante `MAX_TOKENS_AULA`; loop de continuação na aplicação de melhorias, convertido de `if` único para laço de até 2 tentativas).
- **Custo**: até 2x o custo de tokens de saída em qualquer geração que hoje já bateria no teto de 10K (raro); até 3 chamadas no total para uma aula que precise de 2 continuações nas melhorias (era até 2). Sem custo adicional para o caminho feliz (a maioria das gerações não chega perto do teto).
- **Testes**: ajustar testes existentes que fixam o valor de `MAX_TOKENS_AULA` ou a contagem de tentativas de continuação, se houver.
