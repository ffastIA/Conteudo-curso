## Context

A função `streamSkillToClient` em `server.js` tem dois ramos de execução:

1. **Skills com `web_search_options`** (ex: `aplicarMelhoriasSkill`): chama `openai.chat.completions.create` sem streaming, pois a API de search não suporta streaming nativo. Não passa `max_tokens`.
2. **Skills sem web search**: chama `openai.chat.completions.create` com `stream: true`.

O ramo de web search não define `max_tokens`, então usa o padrão da API para `gpt-4o-search-preview` (~4.096 tokens). Aulas longas como a Aula 9 do CapCut geram saídas que ultrapassam esse limite; o truncamento ocorre silenciosamente e o `.docx` é salvo incompleto.

## Goals / Non-Goals

**Goals:**
- Ampliar o limite de saída do call web-search para 16.000 tokens
- Detectar `finish_reason === 'length'` e informar o usuário via SSE e log
- Exibir aviso visível no frontend quando truncamento ocorrer

**Non-Goals:**
- Não alterar outros calls da API (streaming ou não)
- Não implementar retry ou reprocessamento automático em caso de truncamento
- Não alterar o prompt ou a estratégia de geração

## Decisions

**`max_tokens: 16000` no call web-search**
`gpt-4o-search-preview` suporta até 16.000 tokens de saída. Definir esse valor explicitamente elimina a dependência do padrão da API e garante espaço suficiente para aulas longas.

**Evento SSE `{ type: 'warning' }` para truncamento**
O canal SSE já existe e o cliente já lida com eventos tipados. Usar `warning` (novo tipo) é a forma menos invasiva de comunicar problemas sem interromper o fluxo — o conteúdo parcial ainda é salvo, o usuário é avisado e pode decidir reprocessar manualmente.

**`console.warn` no servidor**
Complementa o evento SSE com um registro em log para diagnóstico futuro (rastreabilidade).

**Por que não retry automático?**
Um truncamento em 16.000 tokens indica aula excepcionalmente longa ou prompt excessivo. Retry sem alterar o prompt repetiria o mesmo resultado. A decisão certa (dividir a aula, reduzir prompt) é do usuário.

## Risks / Trade-offs

- **[Risco] Custo maior por call**: 16.000 tokens de saída aumentam o custo por request de web-search. Mitigation: aulas típicas ficam muito abaixo desse limite; o impacto prático é mínimo.
- **[Risco] `finish_reason` pode ser `null` ou `stop` em respostas normais**: a verificação `=== 'length'` é segura e não produz falsos positivos.
- **[Trade-off] Conteúdo incompleto ainda é salvo**: mesmo com aviso, o `.docx` gerado fica truncado. Alternativa seria bloquear o save, mas isso causaria mais confusão (sem arquivo nenhum).

## Migration Plan

Mudança não-breaking: apenas adiciona parâmetro ao call e novo tipo de evento SSE. Não requer migração de dados nem reinício especial.
