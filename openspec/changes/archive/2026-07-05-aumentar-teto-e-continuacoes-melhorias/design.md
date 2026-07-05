# Design: aumentar-teto-e-continuacoes-melhorias

## Context

`MAX_TOKENS_AULA` (`server.js:34`) é uma constante única, usada em três pontos: os dois ramos de `streamSkillToClient` (streaming e web-search) e a chamada de continuação dentro do loop de melhorias (`server.js:2327`). Não há teto por-skill — é deliberadamente uniforme desde `teto-tokens-e-historico-uso`.

A guarda de truncamento na aplicação de melhorias (`server.js`, dentro de `/api/aplicar-melhorias/confirmar`) hoje é um `if` único: se `isRespostaMelhoriasCompleta` falhar, tenta continuar uma vez; se falhar de novo, preserva o conteúdo anterior. O caso real que motivou esta mudança (Aula 3, "Animações e Efeitos Dinâmicos") mostrou que, para aulas densas, uma continuação pode não ser suficiente.

## Goals / Non-Goals

**Goals:** reduzir a frequência de truncamento sem custo no caminho feliz; dar mais uma chance de recuperação antes de desistir de uma aula.

**Non-Goals:** eliminar truncamento por completo; tetos diferenciados por skill/aula; mudar o texto do prompt de continuação.

## Decisions

1. **16.000 como novo teto, não um valor maior.**
   16.000 é o teto prático de tokens de saída do `gpt-4o-mini` (acima disso a própria API rejeitaria ou truncaria de qualquer forma) — não há ganho em pedir mais que isso. Simples e verificável, sem necessidade de calibração.

2. **Laço de até 2 tentativas de continuação, não uma flag booleana renomeada.**
   Converter o `if` único num `for` (`let tentativa = 1; tentativa <= MAX_CONTINUACOES_MELHORIA(2) && incompleta; tentativa++`) generaliza a lógica existente em vez de duplicar o bloco de código uma segunda vez. Cada nova tentativa reenvia o texto acumulado até ali como mensagem `assistant` e pede para continuar a partir do novo final (últimos ~200 caracteres), preservando exatamente o mesmo mecanismo já validado — só repetido.

3. **Correção da redação sobre elegibilidade ao realinhamento, sem mudança de código.**
   O código já filtra aulas para realinhamento com `similaridade <= 0.90 || melhorias.length > 0` (mudança anterior) — uma aula truncada (`similaridade: 1, truncada: true`) só é excluída se também não tiver melhorias pendentes, o que raramente é o caso. A especificação estava desatualizada, não o comportamento; corrigir aqui evita que a próxima pessoa que ler o spec confie numa garantia que não existe mais.

## Risks / Trade-offs

- [Custo/tempo maior nos casos que já truncavam] → aceito explicitamente pelo usuário; afeta só a minoria de aulas que já bateriam no teto antigo.
- [16.000 ainda pode não ser suficiente para uma aula excepcionalmente densa] → mitigado pela segunda tentativa de continuação; residual aceito como non-goal (nenhum teto finito elimina o caso extremo).

## Migration Plan

Sem migração. Efeito imediato no próximo ciclo de qualquer geração. Rollback = revert do commit.

## Open Questions

Nenhuma — valores e trade-off confirmados pelo usuário.
