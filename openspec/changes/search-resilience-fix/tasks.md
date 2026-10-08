## 1. Corrigir modelo de pesquisa web (skills.js)

- [x] 1.1 Em `skills.js`, alterar a constante `MODEL_RESEARCH` de `'gpt-4o-search-preview'` para `'gpt-4o'`
- [x] 1.2 Verificar que nenhuma outra referência literal a `'gpt-4o-search-preview'` existe em `skills.js` (buscar por `search-preview`)

## 2. Corrigir bug de string no pesquisaFallbackSkill (skills.js)

- [x] 2.1 Em `skills.js`, localizar o campo `user` da `pesquisaFallbackSkill` e reescrever como template literals limpos, removendo os fragmentos de concatenação literais (`' +\n    '`)
- [x] 2.2 Verificar que o prompt resultante contém o texto correto sem artefatos de string

## 3. Adicionar timeout ao fallback (server.js)

- [x] 3.1 Em `server.js`, adicionar a constante `SEARCH_FALLBACK_TIMEOUT_MS = 30_000` após `SEARCH_RETRY_TIMEOUT_MS`
- [x] 3.2 No bloco de fallback do handler `GET /api/search`, usar `combineSignals(client.signal, makeAbortSignal(SEARCH_FALLBACK_TIMEOUT_MS))` na chamada de fallback

## 4. UX pós-erro na Etapa 2 (public/app.js)

- [x] 4.1 Em `public/app.js`, no callback `onError` do `streamSSE` da Etapa 2, adicionar `addLog(logPanel, '💡 Tente novamente ou avance para a Etapa 3 — a pesquisa pode ser pulada.')`

## 5. Verificação

- [x] 5.1 Executar `node --check` em `server.js`, `skills.js` e `public/app.js` — todos passaram sem erros
- [ ] 5.2 Testar fluxo normal no browser: pesquisa deve concluir normalmente com fontes listadas
- [ ] 5.3 Testar fallback: simular indisponibilidade web — deve exibir "⚠️ Pesquisa web indisponível..." e concluir
- [ ] 5.4 Verificar mensagem de orientação após erro total: log panel deve exibir "💡 Tente novamente..."
