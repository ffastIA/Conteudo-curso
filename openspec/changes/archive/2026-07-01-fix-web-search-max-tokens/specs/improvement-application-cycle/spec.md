## MODIFIED Requirements

### Requirement: Limite de tokens na geração via web search

O sistema SHALL passar `max_tokens: 16000` no call `openai.chat.completions.create` sempre que `skill.web_search_options` estiver definido, garantindo que respostas longas (aulas com muito conteúdo) não sejam truncadas pelo limite padrão da API.

O sistema SHALL verificar `completion.choices[0]?.finish_reason` após cada call não-streaming de web search. Se `finish_reason === 'length'`, o sistema SHALL:
1. Registrar `console.warn` com o tamanho da resposta recebida.
2. Emitir evento SSE `{ type: 'warning', text: 'Resposta truncada pelo limite de tokens. O conteúdo pode estar incompleto.' }` ao cliente antes de encerrar o SSE com `done`.

O frontend SHALL exibir eventos `{ type: 'warning' }` como um banner de aviso âmbar visível abaixo do painel de progresso, sem interromper a exibição do conteúdo gerado.

#### Scenario: Aula longa sem truncamento

- **WHEN** a resposta do modelo tem `finish_reason === 'stop'`
- **THEN** nenhum aviso é emitido
- **THEN** o conteúdo é salvo normalmente no `.docx`

#### Scenario: Aula longa com truncamento detectado

- **WHEN** a resposta do modelo tem `finish_reason === 'length'`
- **THEN** o servidor registra `console.warn` com o tamanho do texto recebido
- **THEN** o servidor emite evento SSE `{ type: 'warning', text: '...' }` antes do `done`
- **THEN** o frontend exibe banner âmbar informando que o conteúdo pode estar incompleto
- **THEN** o conteúdo parcial é salvo no `.docx` normalmente (não é descartado)
