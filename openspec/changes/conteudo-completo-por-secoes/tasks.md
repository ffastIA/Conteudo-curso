## 1. Skills (skills.js)

- [ ] 1.1 Skill de roteiro da aula (JSON de seções com meta de palavras, via `estimarPalavrasAlvo`)
- [ ] 1.2 Skill de redação por seção (dossiê, resumo das seções anteriores, mapa das aulas, `pedagCtxBlock`)

## 2. Geração (server.js)

- [ ] 2.1 `/api/conteudo`: duas passadas, teto por seção, `MODEL_CONTENT` por `OPENAI_CONTENT_MODEL`
- [ ] 2.2 Helper `gerarComContinuacao` (extraído de `/api/aplicar-melhorias/confirmar`) usado também na geração inicial
- [ ] 2.3 Estado `completa|curta|incompleta` em `projeto.json` e `aulaNN_conteudo.partial.txt`; bloqueio da Etapa 5
- [ ] 2.4 `verificarCompletude` + passada de expansão de seções curtas
- [ ] 2.5 `extractLessonBlock` sem `truncate`; busca pelo número do cabeçalho
- [ ] 2.6 `scr/geracao_log.json` (finish_reason, tokens, palavras)

## 3. UI (public/app.js)

- [ ] 3.1 Selos por aula e botão de regenerar aula incompleta

## 4. Testes (última etapa)

- [ ] 4.1 Seção cortada dispara continuação; incompleta vai para `.partial` e bloqueia a Etapa 5; completude detecta seção ausente e código aberto; meta mínima de palavras; `extractLessonBlock` falha sem cabeçalhos
- [ ] 4.2 Re-executar a linha de base e comparar tamanho/truncamentos
- [ ] 4.3 `npm test` verde e `openspec validate --all`
