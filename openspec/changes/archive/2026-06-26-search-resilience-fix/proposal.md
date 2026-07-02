## Why

A Etapa 2 (Pesquisa Web) apresenta falha silenciosa em cascata: o modelo `gpt-4o-search-preview` pode estar depreciado ou indisponível, o fallback para `gpt-4o-mini` não tem timeout próprio (trava quando a rede está completamente fora), há um bug de string no prompt do fallback que gera texto malformado, e o frontend não orienta o usuário após o erro — resultando em loop perceptual de "Connection error" sem saída clara. Resolve parcialmente o **Gap G05** (sem retry em falhas OpenAI).

## What Changes

- Substituir `MODEL_RESEARCH = 'gpt-4o-search-preview'` por `'gpt-4o'` com `web_search_options` — modelo atualizado com capacidade de busca web na API OpenAI atual
- Tornar o nome do modelo de pesquisa configurável via constante `MODEL_RESEARCH` em `skills.js` para facilitar trocas futuras sem alterar lógica
- Adicionar timeout de 30s (`makeAbortSignal`) à chamada de fallback (`gpt-4o-mini`) em `server.js` — atualmente ela não tem signal e pode travar indefinidamente
- Corrigir bug de string na `pesquisaFallbackSkill` em `skills.js`: literal `' +\n    '` aparece no texto do prompt devido a conversão incorreta de concatenação para template literal
- Melhorar UX pós-erro na Etapa 2: exibir mensagem de orientação no log panel informando que a pesquisa pode ser pulada ou tentada novamente

## Capabilities

### New Capabilities

*(nenhuma — esta change apenas corrige defeitos em capacidade existente)*

### Modified Capabilities

- `web-search-resilience`: Corrige modelo de pesquisa, adiciona timeout ao fallback e repara bug de string no prompt de fallback

## Impact

- **`skills.js`**: Alterar `MODEL_RESEARCH` de `'gpt-4o-search-preview'` para `'gpt-4o'`; corrigir string do `user` prompt na `pesquisaFallbackSkill`
- **`server.js`**: Adicionar `makeAbortSignal(SEARCH_FALLBACK_TIMEOUT_MS)` à chamada de fallback no handler `GET /api/search`; adicionar constante `SEARCH_FALLBACK_TIMEOUT_MS = 30_000`
- **`public/app.js`**: No callback `onError` do `streamSSE` da Etapa 2, exibir mensagem de orientação após o log de erro
- Sem novas dependências npm
- Sem mudanças em endpoints, data models ou formato SSE

## Non-goals

- Não implementar retry genérico para outras etapas (Etapas 3–7 não usam web search)
- Não cachear resultados de pesquisa para reutilizar em nova tentativa
- Não tornar o timeout configurável via UI ou `.env` (constantes no código por ora)
- Não tratar erros de autenticação OpenAI (`AuthenticationError`) como caso de fallback
- Não adicionar botão de "Retry" com lógica de reenvio automático — apenas orientar o usuário a clicar em "Pesquisar" novamente
