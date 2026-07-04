# Proposal: teto-tokens-e-historico-uso

## Why

A aplicação de melhorias truncou conteúdo real (aulas cortadas no meio de palavra, sem a seção obrigatória `### Melhorias Aplicadas`) e o texto parcial foi **persistido por cima da versão íntegra** — o ramo web-search de `streamSkillToClient` apenas avisava em `finish_reason: length` e devolvia o parcial. Além disso, o uso de tokens era só um contador global em memória (perdido a cada restart), sem histórico por projeto.

## What Changes

- **Teto uniforme de 10.000 tokens de saída por aula** (`MAX_TOKENS_AULA`), aplicado aos dois ramos de `streamSkillToClient` (o ramo streaming não tinha limite algum; o web-search tinha 16.000).
- **Histórico de tokens persistido por projeto** em `scr/token_usage.json` (total acumulado + quebra por dia), alimentado por `addUsage(usage, sess)` em todos os pontos de consumo; `GET /api/tokens` passa a devolver também o acumulado do projeto e o contador da UI o exibe.
- **Guarda de integridade nas melhorias**: resposta cortada (`finish_reason: length` ou sem `### Melhorias Aplicadas`) → 1 tentativa de continuação encadeando a resposta parcial; se ainda incompleta → **o conteúdo anterior da aula é preservado** (nunca sobrescrever íntegro com truncado), com aviso SSE, registro no relatório e exclusão automática do realinhamento de planos.
- Diagnóstico por aula no console: `[melhorias] aula N: finish=<reason> tokens=<N>`; o ramo streaming também passa a avisar em `finish_reason: length` (antes silencioso).

## Capabilities

### New Capabilities

- `token-usage-tracking`: histórico persistido de consumo de tokens por projeto.

### Modified Capabilities

- `content-generation`: teto de tokens por aula uniforme em todas as gerações.
- `improvement-application-cycle`: proteção contra persistência de respostas truncadas (continuação + preservação).

## Non-goals

- Não altera modelos nem prompts pedagógicos (a continuação é mecânica de transporte, montada no server).
- Não implementa limites/alertas de orçamento de tokens (só registro histórico).
- Não recupera automaticamente conteúdo já truncado em ciclos passados (recuperação manual via snapshots `scr/ciclo_NNN/`).

## Impact

- **Gap relacionado**: G04 parcialmente (histórico de tokens sobrevive a restart, ao contrário do contador em memória, que permanece como métrica de sessão).
- **Código**: `server.js` (constante, `addUsage`+helpers de persistência, `streamSkillToClient`, guarda no loop de melhorias, `GET /api/tokens`); `public/app.js` (`refreshTokenCounter`).
- **Custo**: continuação só ocorre quando há corte (raro com teto de 10K); escrita de um JSON pequeno por chamada OpenAI.
- **Testes**: `tests/unit/token-usage.test.js` (acumulação + guarda de completude).
