## 1. Pré-requisito de testes

- [ ] 1.1 `tests/__mocks__/openai.js`: `RateLimitError` (com `headers`), `AuthenticationError`, `BadRequestError` (ver `base-de-testes-realista`)

## 2. Espera adaptativa (server.js)

- [ ] 2.1 `comRateLimit` ao lado de `isRetriable` (~108), com `esperar(ms, signal)` abortável
- [ ] 2.2 Cliente OpenAI com `maxRetries: 0`
- [ ] 2.3 Aplicar em `streamSkillToClient` (~2598), melhorias/score (~3650-3770) e realinhamento (~3879), com `onWait` → `progress` e reset do stall timeout
- [ ] 2.4 Remover os `setTimeout(r, 4000)` (~2717, ~3614, ~3879)
- [ ] 2.5 `CONTEUDO_PARALELISMO` (padrão 1, máx. 2) — só liberar após medir 429 em curso real

## 3. Retomada

- [ ] 3.1 `/api/plano-aula`: `plano_aulaNN.txt`, `max_tokens`, stall timeout e retomada
- [ ] 3.2 `/api/conteudo`: pular aulas `completa` e opção "refazer tudo" (UI em `public/app.js`)
- [ ] 3.3 `generationId`/`videoId` em `projeto.json` e retomada do polling
- [ ] 3.4 Downloads com timeout, limite e stream (`MAX_DOWNLOAD_BYTES`)
- [ ] 3.5 Abort signal em score, realinhamento, PPC, metodologia, ementa e estilos

## 4. Testes (última etapa)

- [ ] 4.1 Helper: retry-after, backoff, tentativas esgotadas, só antes do 1º token, outros erros não repetem, abort na espera
- [ ] 4.2 Retomada de plano-aula e conteúdo; timeout e limite nos downloads; abort em score e PPC
- [ ] 4.3 `npm test` verde e `openspec validate --all`
