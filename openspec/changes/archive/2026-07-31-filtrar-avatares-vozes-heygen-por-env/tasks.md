## 1. Configuração (.env)

- [x] 1.1 Adicionar em `.env.example`, após `HEYGEN_API_KEY` (linha ~10), o bloco comentado com `HEYGEN_AVATAR_IDS` e `HEYGEN_VOICE_IDS` (formato CSV), explicando que são opcionais e que restringem a lista da Etapa 10.

## 2. server.js — parsing e filtro

- [x] 2.1 Adicionar um helper `parseCsvEnv(value)` perto de `HEYGEN_API_KEY` (server.js:43) que faz `split(',')`, `trim()` e remove entradas vazias.
- [x] 2.2 Declarar `HEYGEN_AVATAR_IDS` e `HEYGEN_VOICE_IDS` como constantes de módulo usando `parseCsvEnv(process.env.HEYGEN_AVATAR_IDS)` / `parseCsvEnv(process.env.HEYGEN_VOICE_IDS)`.
- [x] 2.3 Em `listarAvataresHeygen()` (server.js:1013-1026), filtrar `data.data || []` por `HEYGEN_AVATAR_IDS.includes(a.id)` quando `HEYGEN_AVATAR_IDS.length > 0`; retornar a lista completa quando a constante estiver vazia.
- [x] 2.4 Em `listarVozesHeygen()` (server.js:1030-1047), aplicar o mesmo padrão filtrando por `HEYGEN_VOICE_IDS.includes(v.voice_id)`.

## 3. Testes

- [x] 3.1 Cobrir `GET /api/heygen/avatares` com `HEYGEN_AVATAR_IDS` configurada (mock com 3 avatares) retornando somente os avatares cujo `id` está na lista, com `name`/`avatar_type`/`preview_image_url` preservados. Implementado em `tests/integration/heygen-avatares-vozes-filtro-env.test.js` (arquivo novo, não em `video-avatar.test.js`) — necessário porque `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` são lidas do env na carga do módulo (mesmo motivo pelo qual `HEYGEN_POLL_*` e o guard de `HEYGEN_API_KEY` já usam arquivos de teste dedicados), e `video-avatar.test.js` não define essas variáveis (o que serve de baseline "sem filtro").
- [x] 3.2 Caso equivalente para `GET /api/heygen/vozes` com `HEYGEN_VOICE_IDS` configurada — mesmo arquivo novo.
- [x] 3.3 Comportamento sem as variáveis configuradas (lista completa, sem filtro) já coberto pelos testes existentes de `GET /api/heygen/avatares`/`GET /api/heygen/vozes` em `tests/integration/video-avatar.test.js` (linhas ~174-218), que não definem `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS`.
- [x] 3.4 Rodar `npm test` e confirmar que toda a suíte permanece verde.
