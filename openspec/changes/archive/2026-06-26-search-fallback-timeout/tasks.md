## 1. Constantes de timeout e helper de classificação de erro

- [x] 1.1 Em `server.js`, adicionar no topo do arquivo (após os `require`) as constantes `SEARCH_TIMEOUT_MS = 45_000` e `SEARCH_RETRY_TIMEOUT_MS = 30_000`
- [x] 1.2 Em `server.js`, implementar a função helper `isRetriable(err)` que retorna `false` para `OpenAI.AuthenticationError` e `OpenAI.BadRequestError`, e `true` para todos os demais erros

## 2. Skill de fallback em skills.js

- [x] 2.1 Em `skills.js`, criar a função `pesquisaFallbackSkill({ nome, nivel, publico, topicos, ementa, metodologia, bnccContext })` que retorna `{ model: 'gpt-4o-mini', messages: [...] }` com um prompt instruindo o modelo a sintetizar referências bibliográficas e conteúdo de pesquisa a partir do seu conhecimento e da ementa fornecida, sem `web_search_options`
- [x] 2.2 Exportar `pesquisaFallbackSkill` no `module.exports` de `skills.js`

## 3. Refatorar o handler GET /api/search em server.js

- [x] 3.1 Extrair a chamada ao `openai.chat.completions.create` do handler `GET /api/search` para uma função assíncrona interna `tentarPesquisaWeb(skill, timeoutMs)` que usa `AbortSignal.timeout(timeoutMs)` como `signal` na chamada ao SDK e retorna o objeto `completion`
- [x] 3.2 No handler `GET /api/search`, substituir a chamada direta pelo fluxo: (1) tentar `tentarPesquisaWeb` com `SEARCH_TIMEOUT_MS`; se bem-sucedido, processar normalmente; se falhar com erro retriável, enviar evento `progress` de aviso de retry e tentar novamente com `SEARCH_RETRY_TIMEOUT_MS`
- [x] 3.3 Após retry falhar (ou erro não-retriável após primeira tentativa), verificar se o erro é retriável: se sim, acionar fallback (tarefa 3.4); se não, enviar evento `error` e encerrar
- [x] 3.4 Implementar o bloco de fallback no handler: enviar `{ type: 'progress', message: '⚠️ Pesquisa web indisponível — gerando a partir do conhecimento do modelo...' }`, chamar `pesquisaFallbackSkill`, executar a chamada ao `gpt-4o-mini`, simular streaming do texto, persistir com `persistStage` e enviar `done` — sem enviar eventos `site`

## 4. Verificação

- [x] 4.1 Verificar sintaxe: `node --check server.js` deve passar sem erros
- [x] 4.2 Verificar que `pesquisaFallbackSkill` está exportada: `node -e "const s = require('./skills'); console.log(typeof s.pesquisaFallbackSkill)"` deve imprimir `function`
- [x] 4.3 Testar o fluxo normal (pesquisa bem-sucedida) no browser — etapas anteriores e a pesquisa devem continuar funcionando normalmente
