## Why

Aulas saem curtas (3,8 a 6,8 KB) apesar do prompt "aprofundado" e do teto de 16 mil tokens, e o truncamento por `finish_reason: 'length'` hoje só gera um `warning` SSE: a aula cortada é gravada como pronta e o fluxo segue (achado A4 e cortes de B1/B2). Resolve o **Gap G11** (avaliação sobre texto truncado) na origem.

## What Changes

- Geração em duas passadas: (1) roteiro da aula em JSON (seções planejadas, meta de palavras por seção via `estimarPalavrasAlvo`); (2) redação por seção, cada uma em chamada própria em streaming, com dossiê de fontes, resumo das seções já escritas e mapa das demais aulas; teto de saída por seção (≈4.000 tokens).
- `finish_reason: 'length'` em qualquer seção dispara continuação automática (até 2 tentativas, padrão de `/api/aplicar-melhorias/confirmar`).
- Aula ainda incompleta: marcada `incompleta` em `projeto.json`, texto parcial em `aulaNN_conteudo.partial.txt` (nunca no `.txt` oficial) e a Etapa 5 bloqueia o avanço até regenerar.
- Verificação mecânica de completude (seções planejadas presentes, síntese e referências ao final, sem bloco de código/lista aberta, palavras acima do mínimo); passada de expansão refaz só seções curtas.
- Selo de estado por aula na UI (completa, curta, incompleta).
- `extractLessonBlock` deixa de usar `truncate(…,1500)` e passa a usar o número capturado do cabeçalho, falhando com mensagem clara se não houver `# Aula N:`.
- `scr/geracao_log.json` registra `finish_reason`, tokens de saída e palavras por aula.
- `OPENAI_CONTENT_MODEL` configurável (padrão `gpt-4o-mini`).

## Capabilities

### New Capabilities
- `sectioned-lesson-generation`: geração por seções, completude e bloqueio de aula incompleta.

### Modified Capabilities
*(nenhuma)*

## Impact

- **`server.js`**: `/api/conteudo`, `streamSkillToClient`, `extractLessonBlock` (~249), `mergeSecoesConteudo`, `projeto.json`, `geracao_log.json`
- **`skills.js`**: nova skill de roteiro da aula e de redação por seção; `estimarPalavrasAlvo`
- **`public/app.js`**: selos e bloqueio da Etapa 5
- Depende parcialmente de `conteudo-fundamentado-em-pesquisa` (integração das citações). Sem dependência npm nova.

## Non-goals

- Não paralelizar aulas aqui (é `geracao-retomavel`).
- Não trocar o modelo padrão (apenas torná-lo configurável).
- Não reescrever o ciclo de melhorias, só manter `mergeSecoesConteudo` compatível com seções estáveis.
