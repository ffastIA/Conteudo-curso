## 1. Servidor: adiar geração de ementa para a confirmação da metodologia

- [x] 1.1 Em `server.js`, `POST /api/config`: remover o bloco que gera a ementa imediatamente; substituir por `sess._precisaGerarEmenta = !sess.ementa || conteudoMudou;` (mantendo o cálculo de `conteudoMudou` exatamente como hoje). A resposta deixa de incluir `ementa`.
- [x] 1.2 Criar `POST /api/metodologia/confirmar`: valida que `sess.metodologia` existe (400 se não); se `sess._precisaGerarEmenta`, gera a ementa via `ementaSkill` (usando `sess.config` + `sess.metodologia` + `bnccContext`) e limpa a flag; persiste a ementa (se existir) e a metodologia via `persistStage`; retorna `{ ok: true, ementa: sess.ementa }`.

## 2. Servidor: metodologia no padrão de export/import

- [x] 2.1 Adicionar `'metodologia': { sessField: 'metodologia', label: 'Metodologia Pedagógica' }` a `STAGES_FIXOS`.
- [x] 2.2 Adicionar `metodologia: 'Metodologia Pedagógica'` a `stepLabels` e `metodologia: sess.metodologia` a `textMap` em `POST /api/export/:step`.

## 3. Cliente: Etapa 0 sem metodologia

- [x] 3.1 Em `public/index.html`, remover o bloco `#metodologiaContainer` (e seus filhos: `#btnDerivarMetodologia`, `#metodologiaResult`, `#metodologiaActions`, `#btnRegenerarMetodologia`, `#btnConfirmarMetodologia`) da seção `#step0`.
- [x] 3.2 Em `public/app.js`, alterar os handlers `btnBnccNao` e `btnConfirmarBncc` para fazer `markDone(0); goStep(1);` em vez de exibir `metodologiaContainer` (mesmo padrão de `btnPularEtapa0`).
- [x] 3.3 Remover a função `derivarMetodologia()` original e seus event listeners antigos (`btnDerivarMetodologia`, `btnRegenerarMetodologia` da Etapa 0, `btnConfirmarMetodologia` antigo) — serão recriados na Etapa 1 na próxima seção.

## 4. Cliente: card de metodologia ao final da Etapa 1

- [x] 4.1 Em `public/index.html`, dentro da seção `#step1`, adicionar um novo card (inicialmente oculto) após o `#configForm`, com: área de resultado (`#metodologiaResult`), badge de origem (`#origemMetodologia`), e ações: "↺ Gerar novamente", "⬇ Exportar .docx" (`onclick="exportDocx('metodologia')"`), "⬆ Importar versão editada" (`onclick="abrirImportar('metodologia')"`), e o botão final "💾 Salvar e ir para Etapa 2 →".
- [x] 4.2 Renomear o botão de submit do `#configForm` de "Salvar e Continuar →" para **"Gerar Metodologia"**.
- [x] 4.3 Em `public/app.js`, reescrever o handler de submit do `configForm`: ao invés de `markDone(1); goStep(2);` no sucesso, chamar a geração de metodologia (equivalente ao antigo `GET /api/metodologia`) e exibir o novo card, mantendo o usuário na Etapa 1.
- [x] 4.4 Adicionar handler para "↺ Gerar novamente" que resubmete o formulário atual (reaproveitando a mesma lógica do 4.3).
- [x] 4.5 Adicionar handler para "💾 Salvar e ir para Etapa 2 →": chama `POST /api/metodologia/confirmar`; em caso de sucesso, `markDone(1); goStep(2);`; em caso de erro, exibe a mensagem sem navegar.
- [x] 4.6 Adicionar `metodologia: 'origemMetodologia'` a `STAGE_BADGE_MAP`, para o badge de origem (IA vs usuário) funcionar com `abrirImportar('metodologia')`/`atualizarBadgeOrigem`.

## 5. Validação manual

- [x] 5.1 Testado via curl contra o servidor real (sessão nova, curso "Testes Automatizados" salvo em pasta de teste externa): `GET /api/metodologia` retornou uma recomendação (ABP) com justificativa citando o perfil real informado — sem navegar para Etapa 2 (mecanismo de servidor validado; o clique/UI real não foi testado — sem navegador conectado nesta sessão).
- [x] 5.2 Testado via curl: enviei um segundo `POST /api/config` com perfil completamente diferente (curso de culinária vegana, presencial, 90% prática) na mesma sequência e `GET /api/metodologia` retornou uma recomendação diferente (Aprendizagem por Projetos) refletindo o novo perfil — confirma que "gerar novamente" (mesmo mecanismo) nunca fica dessincronizado do formulário.
- [x] 5.3 Testado via curl: exportei a metodologia gerada (`POST /api/export/metodologia`, arquivo salvo corretamente), depois simulei a reimportação de uma versão editada via `POST /api/importar/confirmar` (mesmo endpoint usado após o upload real) — `sess.metodologia` e `metodologia.txt` em disco foram atualizados com o texto reimportado. Não testei o upload real de um `.docx` pela UI (fluxo de detecção de arquivo é código genérico não alterado por este change) nem a exibição do badge "✏️ Versão do usuário" no navegador.
- [x] 5.4 Testado via curl: `POST /api/metodologia/confirmar` gerou a ementa citando explicitamente a metodologia ("...utiliza a Aprendizagem Baseada em Problemas (ABP) como metodologia...") e persistiu `metodologia.txt`/`metodologia.docx` + `ementa.txt`/`ementa.docx` na pasta do projeto (confirmado por listagem de diretório). Repeti a confirmação após reimportar uma versão editada e confirmei que a ementa NÃO foi regenerada (`_precisaGerarEmenta` corretamente `false` após a primeira geração) e que `metodologia.docx` foi reescrito com o texto reimportado (timestamp e tamanho de arquivo mudaram).
- [x] 5.5 Confirmado via curl: `POST /api/metodologia/confirmar` numa sessão sem metodologia gerada retorna 400 com `{"error":"Gere a metodologia antes de confirmar."}`.
- [x] 5.6 Verificado por revisão de código (handlers `btnBnccNao`/`btnConfirmarBncc` agora fazem `markDone(0); goStep(1)`, idêntico ao padrão de `btnPularEtapa0`, e nenhuma referência a `metodologiaContainer` sobrou no HTML/JS — confirmado por grep). Não testado clicando de verdade na interface (sem navegador conectado nesta sessão).
- [x] 5.7 `npm test`: 33/33 passando sem necessidade de alterar nenhum teste existente (nenhum teste fazia asserção sobre o campo `ementa` no retorno de `POST /api/config`).
