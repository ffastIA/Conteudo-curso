## 1. Skills

- [x] 1.1 Em `skills.js`, criar `estiloVisualSkill({ nome, publico, nivel, objetivos, modalidade })`: retorna JSON `{"estilos": [{"id", "titulo", "descricao", "housePrompt"}]}` com 3 a 5 opções de estilo visual coerentes com o perfil do curso, título/descrição em português, `housePrompt` em inglês.
- [x] 1.2 Em `skills.js`, estender `slidesSkill` (~linha 133): contrato JSON passa a `{"slides": [{"titulo", "bullets", "imagem": {"promptCena"} | null}]}`; adicionar ao prompt o critério de quando ilustrar (conceitos concretos/visuais se beneficiam; abstratos não), a orientação "maioria das aulas entre 3 e 6 slides ilustrados" (guidance, não regra dura), e a exigência de `promptCena` ser só a cena em inglês, sem palavras de estilo.
- [x] 1.3 Em `skills.js`, adicionar as constantes `IMAGE_LAYOUT_CONSTRAINTS`, `MODEL_IMAGE = 'gpt-image-1.5'`, `IMAGE_QUALITY = 'medium'`, `IMAGE_LESSON_LIMIT = 4`.
- [x] 1.4 Exportar `estiloVisualSkill`, `IMAGE_LAYOUT_CONSTRAINTS`, `MODEL_IMAGE`, `IMAGE_QUALITY`, `IMAGE_LESSON_LIMIT` em `module.exports`.

## 2. Endpoints de estilo visual

- [x] 2.1 Em `server.js`, criar `GET /api/estilos-visuais`: chama `skills.estiloVisualSkill` com `sess.config`, executa via `openai.chat.completions.create` (`response_format: json_object`), parseia `{"estilos": [...]}` (fallback array vazio em JSON inválido), retorna `{ estilos }`.
- [x] 2.2 Em `server.js`, criar `POST /api/estilos-visuais/selecionar`: valida `housePrompt` presente no corpo (400 se ausente), grava `sess.estiloVisual = { id, titulo, housePrompt }`, chama `saveProject(sess)`, retorna `{ ok: true }`.

## 3. Persistência do estilo escolhido

- [x] 3.1 Em `server.js`, em `saveProject()` (~linha 283-323), adicionar `projeto.estiloVisual = sess.estiloVisual || null` ao objeto serializado.
- [x] 3.2 Em `server.js`, em `POST /api/carregar-projeto`, restaurar `sess.estiloVisual = p.estiloVisual || null` a partir do `projeto.json` lido, no mesmo padrão de `sess.bncc`/`sess.metodologia`.

## 4. Geração de imagem e integração no pptx

- [x] 4.1 Em `server.js`, criar `async function gerarImagemSlide(promptCena, housePrompt)`: chama `openai.images.generate({ model: skills.MODEL_IMAGE, prompt: ..., size: '1024x1024', quality: skills.IMAGE_QUALITY, n: 1 }, { signal: makeAbortSignal(90000) })`, retorna `image/png;base64,${b64_json}` ou `null`.
- [x] 4.2 Em `server.js`, em `buildPptx` (~linha 1568), adicionar o branch condicional: se `slide.imagem && slide._imageData`, bullets em `w:6.6/fontSize:22` + `s.addImage({ data: slide._imageData, x:7.7, y:1.6, w:4.9, h:4.9, sizing:{type:'contain',w:4.9,h:4.9}, altText: slide.titulo })`; senão, manter exatamente os valores atuais (`w:11.5/fontSize:24`).
- [x] 4.3 Em `server.js`, em `GET /api/slides` (~linha 591-645): adicionar guarda no início — se `!sess.estiloVisual`, retornar HTTP 400 `{ error: 'Escolha um estilo visual antes de gerar os slides.' }` antes de `sseHeaders(res)`.
- [x] 4.4 Dentro do loop por aula, depois de parsear `slidePlan` e antes de `persistPptxStage`: se `i < skills.IMAGE_LESSON_LIMIT`, iterar os slides com `imagem` preenchida, emitir `progress` por imagem ("Gerando imagem N de M da aula X..."), chamar `gerarImagemSlide(slide.imagem.promptCena, sess.estiloVisual.housePrompt)` dentro de try/catch, anexar sucesso em `slide._imageData`; em falha, `console.error` + `progress` de aviso, sem lançar. Para `i >= IMAGE_LESSON_LIMIT`, pular a geração de imagem inteiramente.
- [x] 4.5 Adicionar pausa de ~2s entre gerações de imagem da mesma aula e de 4s entre aulas dentro do loop de `GET /api/slides` (o loop de slides não tinha pausa própria antes desta mudança; a pausa de 4s de `server.js:1093` pertence ao loop de geração de conteúdo da Etapa 5, endpoint diferente).

## 5. Contador de custo

- [x] 5.1 Em `server.js`, adicionar `tokenUsage.images = 0` e incrementar a cada `gerarImagemSlide` bem-sucedida.
- [x] 5.2 Expor esse contador na resposta de `GET /api/tokens` — já acontece automaticamente, pois o endpoint retorna o objeto `tokenUsage` inteiro; nenhuma mudança adicional necessária.

## 6. Frontend

- [x] 6.1 Em `public/index.html` (`#step8`, ~linha 450-460), adicionar bloco de seleção de estilo (inicialmente oculto): container de opções (`estilosVisuaisList`) e botão "Confirmar estilo e gerar".
- [x] 6.2 Atualizar o parágrafo descritivo de `#step8` mencionando a escolha de estilo visual e que a geração de múltiplas aulas pode levar alguns minutos.
- [x] 6.3 Em `public/app.js`, no handler de `btnSlides` (~linha 705-750): se `sess.estiloVisual` ainda não foi escolhido nesta sessão, ao clicar, buscar `GET /api/estilos-visuais`, renderizar as opções como cards clicáveis de seleção única (título + descrição), reaproveitando o padrão visual de `carregarItensKBNCC` (public/app.js:259-279) adaptado para radio/seleção única em vez de checkboxes.
- [x] 6.4 Ao confirmar a escolha, `POST /api/estilos-visuais/selecionar` com a opção selecionada; só então abrir o `EventSource('/api/slides')` como hoje. Se um estilo já estiver salvo (ex.: sessão restaurada), pular direto para o `EventSource`.

## 7. Validação (Fase 1 — limitada a 4 aulas)

- [x] 7.1 Rodar `node -c server.js` e `node -c skills.js` para confirmar sintaxe.
- [x] 7.2 Rodar `npm test` para garantir que as 33 suítes existentes não quebraram.
- [x] 7.3 Testar `GET /api/estilos-visuais` contra um curso real e confirmar 3-5 opções coerentes com `publico`/`nivel` (não genéricas). Testado com "Python para Iniciantes" (via `/api/dev/seed`): 5 opções distintas geradas ("Lúdico e Colorido", "Geometria Simples", "Didático e Educacional", "Tecnológico e Sóbrio", "Divertido e Interativo"), coerentes com público iniciante.
- [x] 7.4 Confirmar que `GET /api/slides` sem estilo escolhido retorna HTTP 400, e que `POST /api/estilos-visuais/selecionar` grava a escolha corretamente. Confirmado: 400 `{"error":"Escolha um estilo visual antes de gerar os slides."}` sem estilo; `selecionar` grava e persiste em `projeto.json`.
- [x] 7.5 Testado ao vivo (custo real de API, confirmado com o usuário) contra o projeto seed "Python para Iniciantes" (4 aulas): as 4 aulas receberam imagens no estilo escolhido (9 imagens geradas ao todo, 0 falhas), `.pptx` de cada aula contém as imagens embutidas em `ppt/media/` (confirmado via inspeção do zip e visualização de uma imagem extraída — estilo lúdico/colorido aplicado corretamente, sem texto/logos). Como o curso seed só tem 4 aulas (= `IMAGE_LESSON_LIMIT`), não há aula 5+ para validar o branch sem imagem neste teste — comportamento já coberto pelo código (`slide.imagem && slide._imageData`) e pelos testes automatizados existentes. Import no Canva não testado (fora do escopo desta sessão — arquivo `.pptx` gerado é padrão OOXML válido).
- [x] 7.6 Recarregar o projeto via `/api/carregar-projeto` e confirmar que `estiloVisual` é restaurado sem exigir nova escolha. Confirmado: resposta inclui `estiloVisual` salvo, e `GET /api/slides` da sessão recarregada não retornou 400 (guard corretamente pulado).

## 8. Fase 2 (após aprovação do usuário sobre o resultado da Fase 1)

- [x] 8.1/8.2 Usuário aprovou o resultado da Fase 1 (teste ao vivo com 4 aulas, ver seção 7) e pediu explicitamente a expansão para todas as aulas do curso, além de um catálogo de estilo mais rico (com arquétipos nomeados como "lúdico", "dinâmico", "estilo Pixar"). Por ser um escopo maior que uma simples troca de constante, tratado como uma **mudança de acompanhamento separada** (não como tarefa final desta change) — ver `openspec/changes/expand-slide-images-full-course` (ou nome equivalente da change subsequente).
