## Why

Na Etapa 6 (Aplicar Melhorias), o conteúdo atual de cada aula é truncado a 3.000 caracteres antes de ser passado para `aplicarMelhoriasSkill` (`conteudoAtual: truncate(aula.texto, 3000)`). Aulas longas têm a maior parte do seu conteúdo cortado do prompt, fazendo com que o modelo só "veja" o início da aula e ignore as seções subsequentes ao aplicar as observações do revisor. O resultado é um conteúdo de saída com melhorias aplicadas apenas parcialmente — como observado na Aula 9.

## What Changes

- **Remover** `truncate(aula.texto, 3000)` em `GET /api/aplicar-melhorias/confirmar` — o conteúdo completo da aula é passado para `aplicarMelhoriasSkill` sem truncamento
- O parâmetro `conteudoAtual` receberá `aula.texto` diretamente

## Capabilities

### New Capabilities
_(nenhuma)_

### Modified Capabilities
- `improvement-application-cycle`: o parâmetro `conteudoAtual` passado a `aplicarMelhoriasSkill` deixa de ser truncado; o conteúdo integral da aula é fornecido ao modelo

## Non-goals

- Não remover truncamentos em outros handlers (quality review, PPC) — esses servem apenas como contexto informativo e não causam perda de conteúdo na saída
- Não alterar a lógica de rate-limit (pausa de 4s entre aulas e `maxRetries: 6` permanecem)
- Não alterar `skills.js`

## Impact

- **`server.js`**: uma linha alterada em `GET /api/aplicar-melhorias/confirmar`
- **Tokens por ciclo**: aumentará proporcionalmente ao tamanho das aulas — esperado e aceitável dado o ganho de qualidade
- **Rate limit**: o risco de TPM (tokens por minuto) aumenta para cursos com aulas longas; a pausa de 4s já existente mitiga parcialmente
