## Why

O ciclo de aplicação de melhorias (Etapa 6) interrompe com erro de rate limit (HTTP 429) da OpenAI quando o curso tem muitas aulas, porque todas as aulas são processadas sem pausa, com o conteúdo completo de cada aula no prompt, e o cliente OpenAI está configurado com apenas 2 tentativas de retry — insuficientes para o tempo de espera exigido por erros de TPM.

## What Changes

- **`maxRetries: 6` no cliente OpenAI** (`server.js:23`): o SDK lê o header `retry-after` da resposta 429 e aguarda automaticamente antes de tentar novamente; 6 tentativas cobrem cenários onde o wait é de até 60s
- **Pausa de 4 segundos entre aulas** no loop de `GET /api/aplicar-melhorias/confirmar`: distribui o consumo de tokens ao longo da janela TPM, prevenindo o pico
- **Truncamento de `conteudoAtual` a 3.000 chars** em `server.js:1503`: alterar o truncamento de conteúdo para um limite de 5000 chars na etapa 5

## Capabilities

### New Capabilities

_(nenhuma — correção técnica sem novos requisitos de comportamento)_

### Modified Capabilities

- `improvement-application-cycle`: requisito de resiliência — ciclo de melhoria SHALL suportar cursos com muitas aulas sem interrupção por rate limit; inter-aula delay e retry automático fazem parte do comportamento esperado

## Impact

- **`server.js`**: linha 23 (inicialização do cliente OpenAI), linha 1503 (parâmetro `conteudoAtual`), loop em `GET /api/aplicar-melhorias/confirmar` (adicionar `await` de 4s entre aulas)
- **`skills.js`**: sem alteração
- **Frontend, endpoints públicos, schema de sessão**: sem alteração
- **Comportamento visível**: o ciclo fica ligeiramente mais lento (4s × N aulas), mas conclui sem interrupção; usuário vê mensagem de progresso por aula normalmente
