## 1. Template e utilitários de texto (server.js)

- [x] 1.1 Em `server.js`, adicionar `getRoteiroTemplate()` (leitura lazy + cache em
      memória de `PromptRoteiro.docx` via `mammoth.extractRawText`, sem ler no boot)
- [x] 1.2 Em `server.js`, adicionar `preencherTemplateRoteiro(template, { temaObjetivos, idade, blocos })`
      com regex tolerante a espaço para os três placeholders (`%%\s*TEMA\s*%%`,
      `%%\s*IDADE\s*%%`, `%%\s*BLOCOS\s*%%`), preservando os colchetes literais do template

## 2. Skill (skills.js)

- [x] 2.1 Em `skills.js`, adicionar `roteiroSkill({ promptPreenchido, metodologia, bnccContext })`,
      com `user: promptPreenchido + pedagCtxBlock(metodologia, bnccContext)`
- [x] 2.2 Exportar `roteiroSkill` em `module.exports` de `skills.js`

## 3. Endpoints (server.js)

- [x] 3.1 Adicionar `POST /api/roteiro/blocos` (valida inteiro 1-6, grava
      `sess.roteiroBlocos`, persiste em `projeto.json` via `saveProject`)
- [x] 3.2 Adicionar `GET /api/roteiro/prompt?index=N` (valida `sess.aulas` não vazio,
      `index` dentro de `[0, sess.aulas.length-1]`, `sess.roteiroBlocos` definido;
      monta `temaObjetivos` a partir de `sess.aulas[index]`; retorna
      `{ index, numero, titulo, total, prompt }`)
- [x] 3.3 Adicionar `POST /api/roteiro/aprovar` (valida `index`/`texto`, grava
      `sess.roteiroPendente = { index, texto }`)
- [x] 3.4 Adicionar `GET /api/roteiro/gerar` (SSE: `sseHeaders`, `clientAbort`, chama
      `skills.roteiroSkill` com streaming token-a-token, persiste via
      `persistStage(sess, 'roteiro'+numero, ...)`, acumula em
      `sess.roteirosGerados`, limpa `sess.roteiroPendente`, envia `done` com
      `{ fullText, index, numero, baseName, titulo, proximoIndex }` calculado a
      partir de `sess.aulas.length`)
- [x] 3.5 Ajustar `POST /api/carregar-projeto`: restaurar `sess.roteiroBlocos` e
      `sess.roteirosGerados` de `projeto.json`, incluir ambos na resposta JSON
- [x] 3.6 Ajustar `saveProject()`: persistir `projeto.roteiroBlocos` e
      `projeto.roteirosGerados`
- [x] 3.7 (Opcional) Ajustar `detectStage()`/`STAGES_FIXOS`: reconhecer padrão
      `roteiro\d{2}` para reimportação/detecção de arquivos já gerados

## 4. Frontend — estrutura (public/index.html)

- [x] 4.1 Adicionar nav pill `9 · Roteiros` após a pill da Etapa 8
- [x] 4.2 Adicionar `<section id="step9">` com: card principal (descrição, aviso de
      pré-requisito, painel inline `#roteiroBlocosContainer` com `<select>` 1-6 e
      botão de confirmação, botão `#btnRoteiros`), card de revisão
      `#roteiroPromptCard` (progresso "Aula X de Y", `<textarea id="roteiroPromptTexto">`
      editável, botão "Gerar", log panel, área de resultado), card de resumo final
      `#roteiroResultCard` com badges dos arquivos gerados

## 5. Frontend — comportamento (public/app.js)

- [x] 5.1 Adicionar `state.roteiroBlocos = null` e `state.roteiroIndex = 0` ao
      objeto `state` global
- [x] 5.2 Adicionar `atualizarBotaoRoteiros()` (habilita `#btnRoteiros` quando
      `state.doneSteps.has(4)`); chamar em `goStep()` e em `markDone()` quando
      `step === 4`
- [x] 5.3 Handler de clique em `#btnRoteiros`: se `state.roteiroBlocos` já definido,
      chama `abrirPromptRoteiro(0)`; senão exibe `#roteiroBlocosContainer`
- [x] 5.4 Handler de confirmação de blocos: `POST /api/roteiro/blocos`, guarda
      `state.roteiroBlocos`, esconde painel, chama `abrirPromptRoteiro(0)`
- [x] 5.5 Implementar `abrirPromptRoteiro(index)`: `GET /api/roteiro/prompt?index=N`,
      preenche progresso e textarea, mostra card de revisão
- [x] 5.6 Handler de clique em "Gerar →": `POST /api/roteiro/aprovar` com o texto
      atual da textarea, depois `streamSSE('/api/roteiro/gerar', {...})`
      reaproveitando o helper genérico existente
- [x] 5.7 No `onDone` do streaming: registrar badge do arquivo gerado, `markDone(9)`,
      e se `msg.proximoIndex != null` chamar `abrirPromptRoteiro(msg.proximoIndex)`
      automaticamente; senão exibir `#roteiroResultCard`
- [x] 5.8 Em `carregarProjetoPorPasta()`: restaurar `state.roteiroBlocos` e
      repopular badges de `#roteiroArquivos` a partir de `data.roteirosGerados`

## 6. Testes

- [x] 6.1 Teste unitário para `preencherTemplateRoteiro` (espaço espúrio em
      `%%TEMA%%`, preservação dos colchetes, substituição de `%%IDADE%%`/`%%BLOCOS%%`)
- [x] 6.2 Teste de integração para `POST /api/roteiro/blocos` (validação 1-6)
- [x] 6.3 Teste de integração para `GET /api/roteiro/prompt` (400 sem Etapa 4, 400
      sem blocos escolhidos, 400 com índice inválido, concatenação tema+objetivos)
- [x] 6.4 Teste de integração para `POST /api/roteiro/aprovar` + `GET /api/roteiro/gerar`
      (mock de streaming OpenAI, verifica persistência `.txt`+`.docx`, verifica
      `proximoIndex` correto para cursos com N aulas — cobrir explicitamente os
      casos de 1 aula, N aulas intermediárias, e a última aula)
- [x] 6.5 Rodar `npm test` e `npm run test:coverage` garantindo suíte verde e gate de
      cobertura mantido
