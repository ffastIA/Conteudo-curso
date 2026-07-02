## Why

Ao exportar qualquer etapa via os botões "Exportar .docx" (pesquisa, plano de ensino, plano de aula, conteúdo, revisão de qualidade, relatório técnico-pedagógico, PPC), o arquivo é enviado como download do navegador e cai na pasta Downloads padrão do sistema operacional, em vez de ficar salvo na pasta do projeto (`pastaProjeto`, definida opcionalmente na Etapa 1, ou seu fallback interno `saídas/{slug}/`). Esse é exatamente o mesmo bug já corrigido em `POST /api/finalizar-conteudo` (change arquivado `2026-06-27-fix-finalizar-conteudo-no-download`), cujo design.md registrou explicitamente como não-escopo na época: "não muda o comportamento dos outros endpoints de export (`POST /api/export/:step`)". O usuário agora pede que a correção seja estendida a todas as exportações, fechando essa lacuna conhecida.

## What Changes

- `POST /api/export/:step` passa a sempre salvar o `.docx` em disco via `courseRootDir(sess)` e sempre responder com JSON `{ ok: true, saved: true, path }`, replicando exatamente o padrão já validado em `POST /api/finalizar-conteudo`. O branch que hoje envia o buffer como download (`Content-Disposition: attachment`) é removido.
- `exportDocx()` (`public/app.js`) passa a tratar apenas a resposta JSON com `path` salvo (exibindo o caminho ao usuário), removendo o fallback de `Blob`/`<a download>`/`.click()` que hoje é acionado sempre que `pastaProjeto` está vazio.
- Isso corrige a exportação de **todas** as etapas que passam por esse endpoint: pesquisa, plano de ensino, plano de aula, conteúdo, revisão de qualidade, relatório técnico-pedagógico e PPC — não apenas o caso relatado (plano de aula).

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `project-folder`: a especificação de `pastaProjeto`/`courseRootDir` passa a cobrir explicitamente o comportamento de `POST /api/export/:step`, que hoje está silente sobre esse endpoint — ele passa a garantir que toda exportação de etapa (preenchido ou não o campo `pastaProjeto`) seja persistida em `courseRootDir(sess)`, nunca via download do navegador.

## Impact

- `server.js`: endpoint `POST /api/export/:step` (~linhas 1188-1236, especificamente o branch condicional em 1223-1231).
- `public/app.js`: função `exportDocx()` (~linhas 709-744, especificamente o fallback de Blob/download em 732-740).
- Nenhuma mudança de contrato para o caso já correto (`pastaProjeto` preenchido) — o `path` retornado continua sendo o mesmo. Para o caso hoje quebrado (`pastaProjeto` vazio), a resposta passa de um binário/download para um JSON `{ ok: true, saved: true, path }`; o cliente já tem lógica pronta para esse formato (usada em `finalizar-conteudo`).
- Sem dependências externas novas; sem breaking changes de API externa (o endpoint continua aceitando o mesmo corpo de requisição).

## Non-goals

- Não altera onde o arquivo é salvo — isso continua controlado exclusivamente por `courseRootDir(sess)`/`pastaProjeto` (capability `project-folder`, já implementada).
- Não adiciona um botão de download explícito alternativo no frontend.
- Não altera `persistStage`, `POST /api/finalizar-conteudo` nem `POST /api/aplicar-melhorias/confirmar`, que já escrevem sempre em disco sem branch de download.
- A limpeza do código morto de Blob/download em `public/app.js:604-641` (handler de "Finalizar Conteúdo", já inatingível desde a correção de 2026-06-27) é oportunista e só será feita se não adicionar risco; não é o objetivo principal deste change.
