## 1. Servidor: saldo e consumo (server.js)

- [ ] 1.1 `lerSaldoHeygen()`: `GET /v3/users/me`, timeout de 15 s, só `saldoUsd`/`moeda`/`tipoCobranca`/`recargaAutomatica`, descarta e-mail e `username`, nunca lança (`disponivel: false` + motivo)
- [ ] 1.2 `GET /api/heygen/saldo` (JSON) usando `lerSaldoHeygen`; sem chave devolve `disponivel: false` sem chamar a API; leituras da tela usam `fetch` direto (sem span/trace)
- [ ] 1.2b `POST /api/heygen/saldo/atualizar` (`{ numero }` opcional): relê o saldo (no máximo 1 leitura a cada 3 s; antes disso devolve a última), completa a apuração de um vídeo `apurado: false` quando o saldo baixou (`origem: "manual"`), recusa se outro vídeo foi iniciado depois, nunca reescreve vídeo já apurado
- [ ] 1.3 `GET /api/video-avatar/gerar`: recusar com erro SSE se já houver vídeo HeyGen em andamento na sessão; ler o saldo antes de `criarVideoHeygen`, emitir `saldo-heygen` (`fase: inicial`) e gravar `saldoInicialUsd` em `geracoesExternas.heygen[numero]`
- [ ] 1.4 Após o download: ler o saldo final, repetir até `HEYGEN_SALDO_TENTATIVAS` a cada `HEYGEN_SALDO_ESPERA_MS` se a diferença não for positiva; calcular `consumoUsd` (4 casas) ou `apurado: false` com motivo (inclui retomada sem saldo inicial e saldo final indisponível)
- [ ] 1.5 Persistir `videosAvatarGerados[].heygen` e acumular `custoHeygenUsd` (só apurados) em `projeto.json`; restaurar em carregar-projeto e incluir na resposta do carregamento
- [ ] 1.6 `done` com o objeto `heygen`; nenhuma mudança em `enriquecerDone`

## 2. Langfuse

- [ ] 2.1 Spans `heygen.saldo` (só fases inicial e final) e `heygen.video` (video_id, aula, saldos, consumo, apurado, origem) via `registrarSpan`; confirmar que a rota de vídeo tem contexto de trace aberto
- [ ] 2.1b `observabilidade.js`: `definirMetadadoTrace(chave, valor)` guarda em `ctx.traceMeta`, e `finalizarContexto` envia como `langfuse.trace.metadata.<chave>` (hoje só `tokens_total` e `custo_usd`)
- [ ] 2.2 Metadado do trace `custo_heygen_usd` (separado de `custo_usd`) e score `heygen_consumo_usd` só quando apurado; gravar `traceId` e `traceEnviado` em `videosAvatarGerados[].heygen` e, na apuração manual, enviar o score ao `traceId` original (sem criar trace novo)
- [ ] 2.3 Garantir que nada de e-mail, usuário, chave ou texto do roteiro vai ao trace (também em `LANGFUSE_CAPTURE=metadados`)

## 3. Interface (public/index.html, public/app.js)

- [ ] 3.1 Painel "Saldo HeyGen" na Etapa 10 (antes do botão de envio): saldo, moeda, "atualizado às HH:MM:SS", botão "↻ Atualizar saldo" (desabilitado durante a leitura), avisos de saldo baixo/recarga desligada/indisponível (sem bloquear o envio)
- [ ] 3.1b Botão "Apurar consumo" junto de cada vídeo não apurado (mesmo `POST /api/heygen/saldo/atualizar` com `numero`) e mensagens para "ainda não baixou" e "consumo ambíguo"
- [ ] 3.2 Durante a geração tratar `saldo-heygen`; ao `done`, mostrar saldo inicial, saldo final, consumo ("medido pela diferença de saldo") ou "ainda não refletido", e atualizar o painel de saldo
- [ ] 3.3 Total HeyGen do projeto e média por vídeo (referência), e restauração ao carregar projeto

## 4. Configuração e documentação

- [ ] 4.1 `.env.example`: `HEYGEN_SALDO_ALERTA_USD`, `HEYGEN_SALDO_TENTATIVAS`, `HEYGEN_SALDO_ESPERA_MS`
- [ ] 4.2 `PROJECT.md` (contagem de handlers, `custoHeygenUsd`/`videosAvatarGerados[].heygen` no modelo de dados), `README.md` (rota `/api/heygen/saldo`) e `plans`/gaps se aplicável

## 5. Testes (última etapa)

- [ ] 5.1 Mock de `fetch` do HeyGen em `video-avatar.test.js` com `/v3/users/me` e saldos sequenciais (inicial, final atrasado, indisponível)
- [ ] 5.2 Saldo: conta wallet, não-wallet, 401, timeout, sem chave; resposta sem `email`/`username`
- [ ] 5.3 Consumo: diferença correta, cobrança atrasada (nova leitura), não apurado, retomada sem saldo inicial, saldo final falho; `custoHeygenUsd` só soma apurados e é restaurado
- [ ] 5.4 Segunda geração simultânea recusada com erro SSE; botão: leitura simples, limite de 3 s, apuração manual (saldo baixou / não baixou / ambíguo / já apurado)
- [ ] 5.5 Langfuse (fetch simulado do `observabilidade.js`): spans `heygen.saldo` e `heygen.video`, `langfuse.trace.metadata.custo_heygen_usd` no span raiz, score com o `traceId` certo (inclusive na apuração manual), nenhuma emissão em leituras da tela e ausência de dados pessoais
- [ ] 5.6 Testes de docs sincronizadas (contagem de handlers e tabela de rotas) e `npm test` verde, `openspec validate --all`
- [ ] 5.7 Verificação real: ler o saldo antes e depois de um vídeo curto com a chave real e conferir com o painel do HeyGen
