## Why

Respostas do modelo `gpt-4o-search-preview` estão sendo truncadas silenciosamente quando o conteúdo gerado ultrapassa o limite padrão de 4.096 tokens de saída. Como o modelo reescreve a aula completa mais a seção "Melhorias Aplicadas" ao final, aulas longas perdem os bullets de melhorias — e o `.docx` salvo fica incompleto sem nenhum aviso ao usuário ou no log.

## What Changes

- Adicionar `max_tokens: 16000` no call não-streaming de `gpt-4o-search-preview` dentro de `streamSkillToClient` (`server.js`)
- Detectar `finish_reason === 'length'` na resposta e emitir evento SSE `{ type: 'warning', text: '...' }` ao cliente quando isso ocorrer
- Exibir esse aviso no frontend de forma visível (banner ou mensagem inline no painel de progresso)

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `improvement-application-cycle`: o ciclo de aplicação de melhorias passa a usar `max_tokens: 16000` e a sinalizar truncamentos detectáveis.

## Impact

- `server.js`: função `streamSkillToClient` (~linha 789) — adicionar `max_tokens` e verificar `finish_reason`
- `public/app.js`: handler de eventos SSE — tratar evento `warning` e exibir alerta ao usuário
- Nenhuma dependência externa nova; sem breaking changes

## Non-goals

- Não alterar a estratégia de geração (modelo continua reescrevendo o conteúdo completo)
- Não adicionar retry automático em caso de truncamento
- Não alterar outros calls da API (pesquisa web, ementa, plano, etc.)
