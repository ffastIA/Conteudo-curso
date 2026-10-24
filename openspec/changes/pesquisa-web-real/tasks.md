## 1. Busca (server.js, skills.js)

- [x] 1.1 Criar `executarPesquisaWeb` (Responses API ou caminho decidido na Fase 0) com `max_output_tokens` 6000, timeout 90 s, até 2 retentativas e abort por desconexão
- [x] 1.2 `OPENAI_RESEARCH_MODEL` em `.env.example` e validação na inicialização; remover `MODEL_RESEARCH` fixo de `skills.js`
- [x] 1.3 `isRetriable`: erro de parâmetro de busca = configuração inválida (sem retry/fallback)

## 2. Consultas e prompt (skills.js)

- [x] 2.1 Planejar 3–5 consultas (mercado, ferramentas, documentação, certificações, BNCC se ativa) via `pedagCtxBlock`
- [x] 2.2 Ano dinâmico e pedido de fontes primárias em `pesquisaWebSkill`

## 3. Estados e fallback (server.js, public/app.js)

- [x] 3.1 Estados `web | sem_web | falhou`; validar ≥3 fontes e ≥2 domínios
- [x] 3.2 Decisão via `GET /api/search?semBusca=1` (sem endpoint POST separado) e botões "tentar novamente" / "continuar sem pesquisa"
- [x] 3.3 Selo "sem pesquisa web" em `persistStage`/docx e na UI

## 4. Persistência

- [x] 4.1 Gravar `scr/pesquisa.json` e lista de fontes com URL em `.txt`/`.docx`
- [x] 4.2 `saveProject`, `carregar-projeto`, importar/confirmar preservam `pesquisa.json`; reimportação → `fonte: 'usuario'`
- [ ] 4.3 (Opcional) verificação de URL por `fetch` (5 s) com `PESQUISA_VERIFICAR_URLS`

## 5. Testes (última etapa)

- [x] 5.1 Busca com citações → `web`; sem `url_citation` → falha; fallback exige decisão e grava selo; 400 não cai em fallback; `pesquisa.json` sobrevive a carregar/importar
- [x] 5.2 Subir gate de cobertura para 60% e incluir `/api/search` na cobertura
- [x] 5.3 `npm test` verde e `openspec validate --all`
