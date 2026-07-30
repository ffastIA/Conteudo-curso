## 1. Configuração e integração HeyGen (server.js)

- [x] 1.1 Adicionar `HEYGEN_API_KEY`, `HEYGEN_API_BASE` (default `https://api.heygen.com`), `HEYGEN_POLL_INTERVAL_MS` (default 5000), `HEYGEN_POLL_TIMEOUT_MS` (default 600000) perto do bloco `GAMMA_*` (server.js:27-36)
- [x] 1.2 Implementar `listarAvataresHeygen()` — `GET {HEYGEN_API_BASE}/v3/avatars/looks`, header `x-api-key`, retorna array de avatares
- [x] 1.3 Implementar `listarVozesHeygen({ type, language, gender })` — `GET {HEYGEN_API_BASE}/v3/voices` com query params opcionais
- [x] 1.4 Implementar `criarVideoHeygen(payload, client)` — `POST {HEYGEN_API_BASE}/v3/videos`, mesmo padrão de abort combinado de `criarGeracaoGamma` (server.js:912-925)
- [x] 1.5 Implementar `aguardarVideoHeygen(videoId, client)` — polling `GET {HEYGEN_API_BASE}/v3/videos/{id}` até `completed`/`failed`/timeout, mesmo esqueleto de `aguardarGeracaoGamma` (server.js:930-951)
- [x] 1.6 Implementar `videosDir(sess)` = `path.join(courseRootDir(sess), 'videos')`, ao lado de `courseRootDir`/`courseScrDir` (server.js:726-736)

## 2. Configuração de avatar/voz por curso (server.js)

- [x] 2.1 `GET /api/heygen/avatares` — chama `listarAvataresHeygen()`, responde `{ avatares: [...] }`
- [x] 2.2 `GET /api/heygen/vozes` — chama `listarVozesHeygen(req.query)`, responde `{ vozes: [...] }`
- [x] 2.3 `POST /api/heygen/config` — valida `avatarId`/`voiceId`, grava `sess.heygenConfig`, chama `saveProject(sess)`

## 3. Skill de roteiro de avatar (skills.js)

- [x] 3.1 Criar `roteiroAvatarSkill({ aulaTitulo, aulaTexto, segundos, publico, nivel, metodologia, bnccContext })` com heurística `palavrasAlvo = Math.round(segundos * 2.5)` e instrução de tolerância ±15%
- [x] 3.2 `system`: roteirista de fala para avatar digital, texto corrido sem marcações de cena, tom natural mas não monótono, português. O avatar deve ser envolvente, motivador e inspirador.
- [x] 3.3 `user`: conteúdo da aula truncado (mesmo padrão de 1.500 chars do projeto) + alvo de palavras + `pedagCtxBlock(metodologia, bnccContext)`

## 4. Roteiro por aula — parâmetros e geração (server.js)

- [x] 4.1 `GET /api/video-avatar/parametros?index=N` — gate Etapa 5 concluída + `sess.heygenConfig` setado; devolve metadados da aula + sticky `duracaoPadrao`
- [x] 4.2 `POST /api/video-avatar/parametros` — valida `segundos` inteiro e dentro de uma faixa razoável (ex.: 5–600); grava `sess.roteiroAvatarPendente = { index, segundos }`
- [x] 4.3 `GET /api/video-avatar/roteiro/gerar` (SSE) — lê `sess.roteiroAvatarPendente`, chama `roteiroAvatarSkill`, streaming via OpenAI (mesmo padrão de `GET /api/roteiro/gerar`, server.js:1547-1613)
- [x] 4.4 Persistir `scr/roteiroAvatar{NN}.txt` + `roteiroAvatar{NN}.docx` (reaproveitar `buildDocx`/`Packer.toBuffer`, biblioteca `docx` já usada no projeto)
- [x] 4.5 Atualizar sticky `sess.duracaoAvatarDefault = segundos`, empurrar em `sess.roteirosAvatarGerados`, `saveProject(sess, { baseName: 'roteiroAvatar'+numero, fonte: 'ia' })`
- [x] 4.6 Emitir evento `done` **sem** `proximoIndex` (sem avanço automático, decisão D6 do design)

## 5. Reupload/revisão do roteiro de avatar (server.js)

- [x] 5.1 Estender `detectStage` (server.js:2340-2365) com `if (/^roteiroAvatar\d{2}$/.test(base)) return { stage: base, detectadoPor: 'nome' };`
- [x] 5.2 Confirmar que `/api/importar` + `/api/importar/confirmar` funcionam sem mudança adicional para esse novo padrão de nome (teste manual + automatizado)

## 6. Geração e download do vídeo (server.js)

- [x] 6.1 `GET /api/video-avatar/gerar?index=N` (SSE) — validar `sess.heygenConfig` setado e `scr/roteiroAvatar{NN}.txt` existente
- [x] 6.2 Montar payload `POST /v3/videos` (`type: 'avatar'`, `avatar_id`, `voice_id`, `script`, `engine: { type: 'avatar_iv' }`, `aspect_ratio: '16:9'`, `resolution: '1080p'`, `expressiveness`/`motion_prompt` condicionais)
- [x] 6.3 Chamar `criarVideoHeygen` → emitir `progress` → `aguardarVideoHeygen` até `completed`/`failed`/timeout
- [x] 6.4 Baixar `video_url`, criar `videosDir(sess)` sob demanda (`fs.mkdirSync(..., { recursive: true })`), gravar `aula{NN}_video.mp4`
- [x] 6.5 Registrar em `sess.videosAvatarGerados`, `saveProject(sess, { baseName: 'video'+numero, fonte: 'ia' })`, emitir `done`
- [x] 6.6 Em caso de falha/timeout, garantir que nenhum registro parcial fique em `videosAvatarGerados`/`projeto.stages`

## 7. Persistência e restauração de estado (server.js)

- [x] 7.1 `saveProject` (server.js:856-890): adicionar `projeto.heygenConfig`, `projeto.roteirosAvatarGerados`, `projeto.duracaoAvatarDefault`, `projeto.videosAvatarGerados`
- [x] 7.2 `POST /api/carregar-projeto`: restaurar os 4 campos acima em `sess` a partir de `projeto.json` (perto de server.js:2251-2266)
- [x] 7.3 Incluir os 4 campos na resposta final de `POST /api/carregar-projeto` (perto de server.js:2327)

## 8. Frontend — estrutura da Etapa 10 (public/index.html)

- [x] 8.1 Novo bloco `step10`: card de introdução + `btnVideoAvatar` (disabled até Etapa 5 concluída)
- [x] 8.2 `heygenConfigContainer`: listas de rádio para avatares (`#heygenAvataresList`) e vozes (`#heygenVozesList`), `<select id="heygenExpressividade">`, `<textarea id="heygenMotionPrompt">`, botão `#btnConfirmarHeygenConfig`
- [x] 8.3 `<select id="videoAvatarAulaSelect">` com todas as aulas
- [x] 8.4 `videoAvatarParametrosCard`: título da aula, `<input type="number" id="duracaoSegundosInput" step="1" min="5">`, botão `#btnGerarRoteiroAvatar`, painel de log
- [x] 8.5 Botão "Importar versão editada" para o roteiro de avatar (stage dinâmico `roteiroAvatar{NN}`) e botão `#btnEnviarHeygen`
- [x] 8.6 `videoAvatarResultCard`: chip com nome do `.mp4` gerado

## 9. Frontend — lógica (public/app.js)

- [x] 9.1 Estado novo: `state.heygenConfig`, `state.duracaoAvatarDefault`, `state.roteirosAvatarGerados`, `state.videosAvatarGerados`
- [x] 9.2 `carregarHeygenConfig()` — `Promise.all([fetch('/api/heygen/avatares'), fetch('/api/heygen/vozes')])`, popula as duas listas
- [x] 9.3 Handler `#btnConfirmarHeygenConfig` → `POST /api/heygen/config` → mostra seletor de aula
- [x] 9.4 Handler de troca em `videoAvatarAulaSelect` → `GET /api/video-avatar/parametros?index=N`, preenche `duracaoSegundosInput` com sticky
- [x] 9.5 Validação client-side do campo de segundos (só dígitos, `oninput` filtrando não-numéricos)
- [x] 9.6 Handler `#btnGerarRoteiroAvatar` → `POST /api/video-avatar/parametros` → `streamSSE('/api/video-avatar/roteiro/gerar', ...)` sem avanço automático no `onDone`
- [x] 9.7 Wiring do botão dinâmico de importar (reaproveitar função existente do modal genérico, stage `'roteiroAvatar' + numero`)
- [x] 9.8 Handler `#btnEnviarHeygen` → `EventSource('/api/video-avatar/gerar?index=N')` manual (mesmo motivo do Slides: evento `done` referencia binário)
- [x] 9.9 Restauração de projeto: mapear os 4 campos novos a partir da resposta de `POST /api/carregar-projeto`

## 10. Documentação

- [x] 10.1 `.env.example`: adicionar `HEYGEN_API_KEY=`, comentar `HEYGEN_API_BASE`, `HEYGEN_POLL_INTERVAL_MS`, `HEYGEN_POLL_TIMEOUT_MS`
- [x] 10.2 `PROJECT.md`: adicionar linha da Etapa 10 na tabela de pipeline (§3) e os novos campos de sessão em Modelos de Dados (§4)

## 11. Testes (Jest + Supertest)

- [x] 11.1 Testes de `GET/POST /api/heygen/*` com mock de `fetch` para a API do HeyGen
- [x] 11.2 Testes de gate: `/api/video-avatar/parametros` exige Etapa 5 concluída e `heygenConfig` setado
- [x] 11.3 Testes de validação de `segundos` (inteiro, faixa válida) em `POST /api/video-avatar/parametros`
- [x] 11.4 Teste da heurística de palavras-alvo em `roteiroAvatarSkill`
- [x] 11.5 Teste de `detectStage` reconhecendo `roteiroAvatar\d{2}`
- [x] 11.6 Teste do payload de `POST /v3/videos` incluindo `expressiveness`/`motion_prompt` só quando configurados
- [x] 11.7 Teste de criação sob demanda da subpasta `videos/` e gravação do `.mp4` (mock de download)
- [x] 11.8 Teste de restauração de `heygenConfig`/`roteirosAvatarGerados`/`videosAvatarGerados` via `POST /api/carregar-projeto`
- [x] 11.9 Rodar `npm test` completo e confirmar suíte verde antes e depois das mudanças
