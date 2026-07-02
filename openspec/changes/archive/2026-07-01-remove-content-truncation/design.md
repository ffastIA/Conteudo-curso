## Context

A mudança está restrita a uma única linha em `server.js`. O truncamento foi introduzido em `fix-etapa6-rate-limit` como medida para reduzir tokens por requisição e evitar HTTP 429. A pausa de 4s entre aulas e `maxRetries: 6` continuam ativas para absorver o aumento de tokens de input.

## Goals / Non-Goals

**Goals:**
- Passar `aula.texto` completo (sem truncamento) para `aplicarMelhoriasSkill`
- Garantir que o modelo receba o conteúdo integral da aula antes de aplicar melhorias

**Non-Goals:**
- Não alterar truncamentos em outros contextos (quality review, PPC) — esses fornecem contexto breve, não são o alvo da transformação
- Não adicionar novos mecanismos de chunking ou paginação de conteúdo

## Decisions

**Remover apenas o truncamento de `conteudoAtual`; manter os demais**

Os outros truncamentos (`planoEnsino`, `pesquisa`, `aula.texto` em quality review) são passados como contexto informativo em prompts que geram conteúdo independente — não como o objeto da transformação. O truncamento em `aplicarMelhoriasSkill` é diferente: o `conteudoAtual` é o conteúdo que o modelo deve REESCREVER. Truncar o alvo da transformação produz saídas incompletas.

**Não implementar chunking**

Chunking (dividir a aula em partes e processar em paralelo) adicionaria complexidade significativa para garantir coerência entre chunks. O modelo `gpt-4o-search-preview` suporta context windows amplas o suficiente para aulas de curso típicas.

## Risks / Trade-offs

**Aumento de tokens de input** → Aulas longas (>3.000 chars) consumirão mais tokens por requisição. Com 27 aulas de conteúdo denso, o consumo TPM aumentará. Mitigação: a pausa de 4s entre aulas e `maxRetries: 6` já estão em vigor; se 429 ocorrer com frequência, a pausa pode ser aumentada.

**Context window do modelo** → `gpt-4o-search-preview` tem context window de 128K tokens. Aulas de curso típicas raramente ultrapassam 5.000 palavras (~7.000 tokens), bem dentro do limite.
