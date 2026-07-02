## 1. Corrigir modelo de pesquisa web (skills.js)

- [ ] 1.1 Em `skills.js`, alterar a constante `MODEL_RESEARCH` de `'gpt-4o-search-preview'` para `'gpt-4o'`
- [ ] 1.2 Verificar que nenhuma outra referência literal a `'gpt-4o-search-preview'` existe em `skills.js` (buscar por `search-preview`)

## 2. Corrigir bug de string no pesquisaFallbackSkill (skills.js)

- [ ] 2.1 Em `skills.js`, localizar o campo `user` da `pesquisaFallbackSkill` (~linha 52) e reescrever como template literal limpo, removendo os fragmentos de concatenação literais (`' +\n    '`) que aparecem no texto do prompt
- [ ] 2.2 Verificar que o prompt resultante contém o texto correto sem artefatos de string — inspecionar com `node -e "const s=require('./skills'); console.log(s.pesquisaFallbackSkill({nome:'X',nivel:'X',publico:'X',topicos:'',ementa:'',metodologia:'',bnccContext:''}).user)"`

## 3. Adicionar timeout ao fallback (server.js)

- [ ] 3.1 Em `server.js`, adicionar a constante `SEARCH_FALLBACK_TIMEOUT_MS = 30_000` após as constantes `SEARCH_TIMEOUT_MS` e `SEARCH_RETRY_TIMEOUT_MS` existentes
- [ ] 3.2 No bloco de fallback do handler `GET /api/search` (dentro do segundo `catch`), adicionar `{ signal: makeAbortSignal(SEARCH_FALLBACK_TIMEOUT_MS) }` como segundo argumento da chamada `openai.chat.completions.create`

## 4. UX pós-erro na Etapa 2 (public/app.js)

- [ ] 4.1 Em `public/app.js`, no callback `onError` do `streamSSE` da Etapa 2, adicionar após `document.getElementById('btnSearch').disabled = false` uma chamada a `addLog(logPanel, '💡 Tente novamente ou avance para a Etapa 3 — a pesquisa pode ser pulada.')`

## 5. Verificação

- [ ] 5.1 Executar `node --check server.js` e `node --check public/app.js` — ambos devem passar sem erros de sintaxe
- [ ] 5.2 Testar fluxo normal no browser: iniciar Etapa 2 com rede disponível — pesquisa deve concluir normalmente com fontes listadas
- [ ] 5.3 Testar fallback: desativar rede (ou bloquear temporariamente a chamada OpenAI) e iniciar Etapa 2 — sistema deve exibir "⚠️ Pesquisa web indisponível..." seguido de resultado gerado pelo modelo, sem "Connection error"
- [ ] 5.4 Verificar mensagem de orientação: simular erro total (rede completamente off) — após "Connection error", o log panel deve exibir a mensagem de orientação "💡 Tente novamente..."
