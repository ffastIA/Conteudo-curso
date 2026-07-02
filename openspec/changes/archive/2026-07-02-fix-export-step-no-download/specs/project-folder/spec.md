## ADDED Requirements

### Requirement: Exportação por etapa sempre salva na pasta do projeto, nunca via download do navegador
`POST /api/export/:step` SHALL sempre persistir o arquivo `.docx` gerado em `courseRootDir(sess)`, para qualquer etapa exportável (pesquisa, plano-ensino, plano-aula, conteudo, revisao-qualidade, qualidade, ppc), independentemente de `sess.config.pastaProjeto` estar preenchido ou vazio. O endpoint SHALL sempre responder com JSON `{ ok: true, saved: true, path }`, onde `path` é o caminho real do arquivo salvo, e SHALL NOT enviar o conteúdo binário do arquivo como resposta HTTP de download (`Content-Disposition: attachment`).

#### Scenario: Exportar etapa sem pastaProjeto configurada
- **WHEN** o usuário clica em "Exportar .docx" para qualquer etapa e `sess.config.pastaProjeto` está vazio
- **THEN** o arquivo `.docx` é salvo em `saídas/{slug}/{nome-arquivo}.docx`
- **THEN** a resposta do endpoint é um JSON `{ ok: true, saved: true, path: "saídas/{slug}/{nome-arquivo}.docx" }`
- **THEN** nenhum download é iniciado pelo navegador

#### Scenario: Exportar etapa com pastaProjeto configurada
- **WHEN** o usuário clica em "Exportar .docx" para qualquer etapa e `sess.config.pastaProjeto` está definido (ex: `C:/MeusCursos/Python/`)
- **THEN** o arquivo `.docx` é salvo em `C:/MeusCursos/Python/{nome-arquivo}.docx`
- **THEN** a resposta do endpoint é um JSON `{ ok: true, saved: true, path: "C:/MeusCursos/Python/{nome-arquivo}.docx" }`

#### Scenario: Frontend exibe o caminho salvo em vez de baixar o arquivo
- **WHEN** `exportDocx()` recebe a resposta JSON com `saved: true`
- **THEN** o frontend exibe ao usuário o caminho completo onde o arquivo foi salvo
- **THEN** o frontend NÃO cria um `Blob`/link de download para essa resposta
