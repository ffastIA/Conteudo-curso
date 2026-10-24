## Context

Pontos com `truncate(` em `server.js`: 1490, 1576, 1584-1585, 3295, 3300, 3553-3554, 3765-3767, 3871-3888. A fórmula de score e o gate (`EPSILON_ACEITE=0.02`, marcador `[user]`) já existem e devem ser preservados.

## Goals / Non-Goals

**Goals:** 100% das seções lidas por revisão e juiz; melhoria na última seção visível ao gate.
**Non-Goals:** mudar a rubrica; reduzir custo agressivamente.

## Decisions

- **D1**: função `estimarTokens(texto)` (≈ caracteres/3,5) decide entre chamada única e map-reduce; limite configurável por modelo.
- **D2**: map usa as seções fixas da change `conteudo-completo-por-secoes`; aulas legadas usam `parseSecoesFixas` sobre o texto.
- **D3**: reduce recebe só notas/observações curtas por seção; produz o mesmo formato textual atual de revisão para não quebrar o parser `extractResumoMelhorias`.
- **D4**: juiz pareado por seção alterada + checagem global; agregação por média ponderada por palavras no mesmo modelo de nota composta.
- **D5**: `score_historico.json` ganha `formulaVersao` e `secoesVistas`; ciclos de versões diferentes não são comparados.
- **D6**: teste estático percorre o trecho das rotas de avaliação e falha ao encontrar `truncate(`.

## Risks / Trade-offs

- Mais chamadas e custo → map-reduce só quando não cabe; estimativa prévia em `custo-e-logs`.
- Nota muda e quebra comparação com ciclos antigos → versionar a fórmula.
- Perda de visão global ao avaliar por seção → checagem global de coerência.
