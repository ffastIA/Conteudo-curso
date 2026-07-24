## 1. Configuração da chave do Gamma

- [x] 1.1 Adicionar `GAMMA_API_KEY=` a `.env.example` (mesmo padrão do `OPENAI_API_KEY`)
- [x] 1.2 Em `server.js`, ler `GAMMA_API_KEY = process.env.GAMMA_API_KEY` e definir
      constantes `GAMMA_API_BASE`, `GAMMA_POLL_INTERVAL_MS`, `GAMMA_POLL_TIMEOUT_MS`

## 2. Helpers de integração com o Gamma (server.js)

- [x] 2.1 Implementar `criarGeracaoGamma(payload)` — `POST
      ${GAMMA_API_BASE}/generations` via `fetch` nativo, header `X-API-KEY`,
      `Content-Type: application/json`; lança erro claro em resposta não-2xx
- [x] 2.2 Implementar `aguardarGeracaoGamma(generationId, client)` — poll `GET
      ${GAMMA_API_BASE}/generations/{id}` a cada `GAMMA_POLL_INTERVAL_MS`,
      respeitando `client.disconnected`/`client.signal` e `GAMMA_POLL_TIMEOUT_MS`;
      retorna `{ gammaUrl, exportUrl, credits }` quando `status === 'completed'`;
      lança erro com detalhe quando `status === 'failed'` ou timeout
- [x] 2.3 Implementar `persistGammaSlidesStage(sess, baseName, exportUrl)` —
      baixa os bytes de `exportUrl` via `fetch`, grava em
      `courseRootDir(sess)/${baseName}.pptx`, chama `saveProject(sess,
      {baseName, fonte:'ia'})` — mesmo contrato de saída do antigo `persistPptxStage`

## 3. Novos endpoints (server.js)

- [x] 3.1 Adicionar `GET /api/slides/parametros?index=N` — valida
      `sess.conteudoPorAula` (Etapa 5) e `sess.estiloVisual`; devolve `{index,
      numero, titulo, total, observacaoPadrao, quantidadePadrao}`
      (`quantidadePadrao` inicia em 3 se nunca definida)
- [x] 3.2 Adicionar `POST /api/slides/parametros` — valida `quantidade` inteiro
      entre 1 e 5 e `texto` (pode ser vazio); grava `sess.slidesPendente =
      {index, texto, quantidade}`
- [x] 3.3 Adicionar `GET /api/slides/gerar` (SSE) — lê `sess.slidesPendente`;
      monta o payload Gamma (`inputText`, `textMode: 'condense'`, `format:
      'presentation'`, `numCards: quantidade`, `textOptions.{amount,audience,
      tone,language}`, `imageOptions.{source:'aiGenerated',style}`,
      `cardOptions.dimensions:'16x9'`, `additionalInstructions: texto`,
      `exportAs: 'pptx'`); chama `criarGeracaoGamma` → `aguardarGeracaoGamma` →
      `persistGammaSlidesStage`; atualiza `sess.slidesObservacaoDefault`/
      `sess.slidesQuantidadeDefault`; acumula `sess.slidesGerados`; calcula
      `proximoIndex`; em falha, envia `error` via SSE sem avançar
- [x] 3.4 Remover a rota `GET /api/slides` (loop automático antigo)

## 4. Remoção do código morto (server.js e skills.js)

- [x] 4.1 Remover `gerarImagemSlide()`, `buildPptx()`, `persistPptxStage()` de `server.js`
- [x] 4.2 Remover `require('pptxgenjs')` de `server.js`; verificar via grep se
      `pptxgenjs` não é usada em mais nenhum lugar do projeto e, se confirmado,
      remover a dependência de `package.json`/`package-lock.json`
- [x] 4.3 Remover `slidesSkill`, `IMAGE_LAYOUT_CONSTRAINTS`, `MODEL_IMAGE`,
      `IMAGE_QUALITY` de `skills.js` (e das respectivas entradas em `module.exports`)

## 5. Sessão/projeto (server.js)

- [x] 5.1 Em `saveProject()`: persistir `projeto.slidesObservacaoDefault`,
      `projeto.slidesQuantidadeDefault`, `projeto.slidesGerados`
- [x] 5.2 Em `POST /api/carregar-projeto`: restaurar os três campos acima a
      partir de `projeto.json` e incluí-los na resposta JSON

## 6. Frontend — estrutura (public/index.html, `#step8`)

- [x] 6.1 Substituir o card `#slidesResultCard` (resumo do loop automático) por
      um card de parâmetros por aula: progresso "Aula X de Y", `<select
      id="slidesQuantidadeSelect">` com opções 1 a 5, `<textarea
      id="slidesObservacaoTexto">`, botão "Gerar →", log de progresso
- [x] 6.2 Manter um card de resumo final com badges dos arquivos gerados
      (mesmo padrão visual já usado em Roteiros/Slides)
- [x] 6.3 Painel de escolha de estilo visual (`#estiloVisualContainer`): mantido sem alteração

## 7. Frontend — comportamento (public/app.js)

- [x] 7.1 Remover `iniciarGeracaoSlides()` e o `EventSource('/api/slides')` antigo
- [x] 7.2 Implementar `abrirParametrosSlides(index)` — `GET
      /api/slides/parametros?index=N`, preenche progresso, select de
      quantidade e textarea de observação, mostra o card de parâmetros
- [x] 7.3 Ajustar o handler de clique de `#btnSlides`: após estilo visual
      definido (existente ou recém-escolhido), chamar `abrirParametrosSlides(0)`
      em vez do antigo loop automático
- [x] 7.4 Implementar o handler do botão "Gerar →": `POST
      /api/slides/parametros` com `{index, texto, quantidade}`, depois abre
      `EventSource('/api/slides/gerar')` dedicado (payload de `done` é
      metadado de arquivo, não texto — não usar `streamSSE()` genérico)
- [x] 7.5 No `onDone`: registrar badge do arquivo gerado; se
      `msg.proximoIndex != null`, chamar `abrirParametrosSlides(msg.proximoIndex)`
      automaticamente; senão, mostrar o card de resumo final
- [x] 7.6 No `onError`: manter o card de parâmetros da aula atual visível,
      reabilitar o botão "Gerar →" para permitir nova tentativa
- [x] 7.7 Em `carregarProjetoPorPasta()`: restaurar
      `state.slidesObservacaoDefault`/`state.slidesQuantidadeDefault` e
      repopular badges de arquivos a partir de `data.slidesGerados`

## 8. Testes

- [x] 8.1 Criar mock de `fetch` global (equivalente a `tests/__mocks__/openai.js`)
      simulando `POST /generations`, `GET /generations/{id}` (pending → completed
      / failed) e o download do `exportUrl`
- [x] 8.2 Teste de integração para `GET /api/slides/parametros` (400 sem Etapa 5,
      400 sem estilo visual, valores sticky corretos, `quantidadePadrao` inicial = 3)
- [x] 8.3 Teste de integração para `POST /api/slides/parametros` (validação de
      `quantidade` 1-5)
- [x] 8.4 Teste de integração para `GET /api/slides/gerar`: `numCards` enviado
      igual à `quantidade` escolhida; `proximoIndex` correto para cursos de 1 e
      3 aulas (cobrir aula única, aula intermediária, última aula); persistência
      do `.pptx` e dos valores sticky; falha do Gamma emite `error` e não avança
- [x] 8.5 Atualizar `tests/integration/sse.test.js`: remover os casos que
      cobrem `GET /api/slides` (rota removida)
- [x] 8.6 Rodar `npm test` e `npm run test:coverage`, garantindo suíte verde e
      gate de cobertura mantido
- [x] 8.7 Teste manual de ponta a ponta no navegador com a chave real do Gamma
      (fornecida pelo usuário): gerar slides de pelo menos uma aula, validar
      `.pptx` resultante e confirmar o código de idioma `pt-br` aceito pela API
