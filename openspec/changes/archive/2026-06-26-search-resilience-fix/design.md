## Context

A Etapa 2 usa `gpt-4o-search-preview` (modelo com capacidade de busca web). Esse modelo foi depreciado/renomeado pela OpenAI — o modelo correto atualmente para chamadas com `web_search_options` é `gpt-4o` (ou `gpt-4o-mini` com parâmetro de busca, conforme plano). O código atual em `skills.js` define `MODEL_RESEARCH = 'gpt-4o-search-preview'` e usa essa constante em `pesquisaWebSkill`.

O fluxo de fallback já existe (`search-fallback-timeout` change, arquivada): ao falhar a chamada web, o sistema tenta novamente com timeout menor e depois aciona `pesquisaFallbackSkill` com `gpt-4o-mini`. Porém:

1. A chamada de fallback (`openai.chat.completions.create` para `gpt-4o-mini`) não recebe `signal` de timeout — se a rede está completamente down, ela trava indefinidamente até o timeout padrão do SO (minutos).
2. `pesquisaFallbackSkill` tem bug de string: o campo `user` foi escrito como template literal mas deixou fragmentos de concatenação de string (`' +\n    '`) como literais no texto, resultado de refactor malfeito.
3. O frontend no `onError` da Etapa 2 apenas reabilita o botão `btnSearch` sem nenhuma mensagem de orientação — o usuário vê "Connection error" e não sabe se pode avançar sem a pesquisa.

## Goals / Non-Goals

**Goals:**
- Corrigir o model name para o valor atual suportado pela OpenAI com `web_search_options`
- Adicionar timeout à chamada de fallback para que ela também falhe rápido quando sem rede
- Corrigir o bug de string no prompt do fallback
- Orientar o usuário após erro com mensagem clara no log panel

**Non-Goals:**
- Não refatorar o sistema de retry para outras etapas
- Não adicionar botão de "Retry automático" com reenvio programático
- Não tornar model names configuráveis via `.env`
- Não implementar cache de resultados de pesquisa

## Decisions

### D1 — Modelo de pesquisa: `gpt-4o` em vez de `gpt-4o-search-preview`

A documentação atual da OpenAI (SDK v4) suporta `web_search_options` no endpoint `chat.completions` com o modelo `gpt-4o`. O `gpt-4o-search-preview` era um alias preview que foi descontinuado. Trocar apenas a constante `MODEL_RESEARCH` em `skills.js` é suficiente — a estrutura da chamada (com `web_search_options`) permanece igual.

**Alternativa considerada:** `gpt-4o-mini` com busca web — mais barato, mas qualidade inferior para síntese de pesquisa educacional. Mantém `gpt-4o` para pesquisa.

### D2 — Timeout no fallback: reutilizar `makeAbortSignal` existente

A função `makeAbortSignal(ms)` já existe em `server.js` e é usada nas tentativas de pesquisa web. O fallback deve receber `makeAbortSignal(SEARCH_FALLBACK_TIMEOUT_MS)` como `signal` na chamada. Adicionar constante `SEARCH_FALLBACK_TIMEOUT_MS = 30_000`.

**Alternativa considerada:** try/catch extra em torno do fallback sem timeout — insuficiente, o problema é a chamada travar, não falhar com exceção.

### D3 — Bug de string: reescrever campo `user` de `pesquisaFallbackSkill` como template literal limpo

O campo `user` em `pesquisaFallbackSkill` (skills.js, ~linha 52) mistura abertura de backtick com resíduos de concatenação `' +\n    '`. A correção é reescrever o campo inteiro como template literal sem fragmentos de concatenação. O conteúdo semântico do prompt permanece o mesmo.

### D4 — UX pós-erro: mensagem no log panel via `addLog` após `errLog`

No callback `onError` do `streamSSE` da Etapa 2 (`public/app.js`), após reabilitar `btnSearch`, adicionar chamada a `addLog(logPanel, '💡 Tente novamente ou avance para a Etapa 3 — a pesquisa pode ser pulada.')`. Não requer novo componente UI, aproveita o sistema de log existente.

## Risks / Trade-offs

- **[Risco] `gpt-4o` com `web_search_options` pode ter custo maior que `gpt-4o-mini`** → Aceitável: pesquisa é executada uma vez por curso; a qualidade justifica o custo.
- **[Risco] OpenAI pode alterar novamente o suporte a `web_search_options` por modelo** → Mitigação: `MODEL_RESEARCH` é uma constante isolada em `skills.js` — mudança futura é um one-liner.
- **[Trade-off] SEARCH_FALLBACK_TIMEOUT_MS fixo em 30s** → Pode ser insuficiente em redes lentas mas funcionais; aceitável para o escopo atual (G05 parcial).
