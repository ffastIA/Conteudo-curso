## 1. Guard reutilizável (server.js)

- [x] 1.1 Implementar `requireApiKey(value, envVarName)` (ou duas funções nominais) — lança `Error` com mensagem `"<envVarName> não está configurada. Adicione a chave em .env (veja .env.example) antes de usar esta etapa."` quando `!value?.trim()`
- [x] 1.2 Posicionar perto de `makeAbortSignal`/`truncate` (helpers genéricos), não junto dos blocos `GAMMA_*`/`HEYGEN_*`

## 2. Aplicar o guard nos pontos de uso do Gamma (server.js)

- [x] 2.1 `criarGeracaoGamma` — chamar o guard antes do `fetch`
- [x] 2.2 Conferir que o erro sobe corretamente pelo canal já existente: evento SSE `error` (`GET /api/slides/gerar`, único chamador de `criarGeracaoGamma`). Correção em relação ao texto original desta task: `GET /api/estilos-visuais` **não** usa a API do Gamma (usa `estiloVisualSkill` via OpenAI) — não precisa e não recebeu o guard.

## 3. Aplicar o guard nos pontos de uso do HeyGen (server.js)

- [x] 3.1 `listarAvataresHeygen`, `listarVozesHeygen`, `criarVideoHeygen` — chamar o guard antes do `fetch` em cada uma
- [x] 3.2 Conferir que o erro sobe corretamente pelos dois canais já existentes: `res.status(500).json({error})` (`GET /api/heygen/avatares`, `GET /api/heygen/vozes`) e evento SSE `error` (`GET /api/video-avatar/gerar`)

## 4. Testes (Jest + Supertest)

- [x] 4.1 Unit do guard: valor ausente/vazio/só espaços lança erro com o nome da variável e menção a `.env.example`; valor presente não lança
- [x] 4.2 Integração: `GET /api/slides/gerar` sem `GAMMA_API_KEY` retorna erro citando a variável, sem nenhuma chamada a `fetch` registrada (mock de `fetch` não invocado)
- [x] 4.3 Integração: `GET /api/heygen/avatares`, `GET /api/heygen/vozes`, `GET /api/video-avatar/gerar` sem `HEYGEN_API_KEY` retornam erro citando a variável, sem nenhuma chamada a `fetch` registrada
- [x] 4.4 Confirmado: os testes existentes (`GAMMA_API_KEY`/`HEYGEN_API_KEY` fixadas via `process.env.*` no topo dos arquivos, ou herdadas do `.env` real) continuam passando sem alteração
- [x] 4.5 `npm test` completo rodado — 289/289 passando antes e depois das mudanças
