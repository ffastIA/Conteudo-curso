## ADDED Requirements

### Requirement: Teto uniforme de tokens de saída por aula
Todas as gerações de conteúdo por aula (ramos streaming e web-search de `streamSkillToClient`) SHALL usar `max_tokens = MAX_TOKENS_AULA` (10.000). Quando a resposta terminar com `finish_reason: length`, o sistema SHALL emitir aviso SSE (`warning`) e log de console em ambos os ramos (no ramo streaming, o corte era silencioso).

#### Scenario: Corte detectado no ramo streaming
- **WHEN** uma geração streaming (ex.: conteúdo de aula via gpt-4o-mini) atinge o teto de 10.000 tokens
- **THEN** o cliente recebe o evento `warning` informando possível conteúdo incompleto e o console registra o corte

#### Scenario: Teto aplicado ao ramo web-search
- **WHEN** qualquer skill com `web_search_options` é executada via `streamSkillToClient`
- **THEN** a chamada usa `max_tokens: 10000` e `finish_reason`/tokens de completion ficam disponíveis via parâmetro `meta`
