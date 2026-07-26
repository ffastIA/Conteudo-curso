## Purpose

Definir como cada projeto usa uma pasta raiz configurável pelo usuário (com
subpasta `/scr` para arquivos internos), garantindo que exportações e
arquivos internos sejam salvos nos lugares corretos, sempre em disco — nunca
via download do navegador.

## Requirements

### Requirement: Pasta raiz por projeto com subdiretório /scr para internos
Cada projeto SHALL ter uma pasta raiz (`pastaProjeto` em `sess.config`). `POST /api/config` SHALL exigir que `pastaProjeto` esteja preenchida para configurar/criar um projeto, retornando erro 400 se estiver vazia. O sistema SHALL salvar arquivos `.docx` de exportação em `courseRootDir(sess)` e arquivos internos (`.txt`, `projeto.json`) em `courseScrDir(sess)`.

```
courseRootDir(sess) = pastaProjeto?.trim() || saídas/{slug}/
courseScrDir(sess)  = courseRootDir(sess) + /scr/
```

O fallback para `saídas/{slug}/` permanece implementado em `courseRootDir` por compatibilidade com sessões de projetos legados (carregados sem `pastaProjeto` definida, ex.: pelo fluxo "legado" de `POST /api/carregar-projeto`), mas SHALL NOT ser alcançável para qualquer projeto criado/configurado a partir da introdução dessa obrigatoriedade, já que `POST /api/config` passa a rejeitar `pastaProjeto` vazia.

Ambos os diretórios são criados automaticamente via `mkdirSync` na primeira gravação.

#### Scenario: Projeto com pastaProjeto configurado — docx vai para a raiz
- **WHEN** uma etapa é concluída e `sess.config.pastaProjeto` está definido (ex: `C:/MeusCursos/Python/`)
- **THEN** o arquivo `.docx` gerado é salvo em `C:/MeusCursos/Python/{nome-arquivo}.docx`

#### Scenario: Projeto com pastaProjeto configurado — txt vai para /scr
- **WHEN** uma etapa é concluída e `sess.config.pastaProjeto` está definido
- **THEN** o arquivo `.txt` correspondente é salvo em `C:/MeusCursos/Python/scr/{baseName}.txt`

#### Scenario: Diretório /scr criado automaticamente
- **WHEN** o `/scr` não existe ainda ao salvar o primeiro arquivo interno
- **THEN** o sistema cria o diretório `{courseRootDir}/scr/` automaticamente sem erro

#### Scenario: Criar/configurar projeto sem pastaProjeto é rejeitado
- **WHEN** o cliente faz `POST /api/config` com `pastaProjeto` vazia ou ausente
- **THEN** o sistema retorna status 400 com uma mensagem indicando que o campo é obrigatório
- **THEN** nenhuma alteração é feita em `sess.config`

#### Scenario: Projeto legado carregado sem pastaProjeto ainda funciona
- **WHEN** um projeto legado (criado antes da obrigatoriedade, sem `pastaProjeto` gravada) é carregado via `POST /api/carregar-projeto` no fluxo "legado" (sem `scr/projeto.json`)
- **THEN** o sistema continua funcionando com o fallback `saídas/{slug}/`, sem quebrar o carregamento
- **THEN** a pasta que o usuário selecionou para carregar esse projeto passa a ser usada como `pastaProjeto` dali em diante (ver capability `project-load`), corrigindo o projeto para o padrão obrigatório assim que reaberto

---

### Requirement: Persistência imediata de pastaProjeto em POST /api/config
`POST /api/config` SHALL persistir imediatamente `projeto.json` (via `saveProject`) sempre que o valor de `pastaProjeto` recebido na requisição for diferente do valor previamente salvo em `sess.config`, independentemente de outros campos pedagógicos terem mudado ou de a ementa ser regenerada nesta mesma requisição.

#### Scenario: Definir pastaProjeto pela primeira vez em um curso já existente
- **WHEN** o usuário submete a Etapa 1 de um curso que já tem ementa gerada, preenchendo `pastaProjeto` (antes vazio) com um caminho válido
- **THEN** `projeto.json` dentro da pasta do curso é atualizado com `config.pastaProjeto` igual ao novo valor
- **THEN** isso ocorre mesmo que nenhum campo pedagógico (nome, público, carga, duração, nível, objetivos) tenha mudado e a ementa não seja regerada

#### Scenario: Alterar pastaProjeto para um novo caminho
- **WHEN** o usuário submete a Etapa 1 alterando `pastaProjeto` de um valor já configurado para outro caminho válido
- **THEN** o `projeto.json` do curso reflete o novo caminho imediatamente após a resposta desta requisição

#### Scenario: Submeter a Etapa 1 sem alterar pastaProjeto
- **WHEN** o usuário submete a Etapa 1 e o valor de `pastaProjeto` é idêntico ao já salvo em `sess.config`
- **THEN** nenhuma escrita adicional de `projeto.json` é feita só por causa deste campo

---

### Requirement: Exportação por etapa sempre salva na pasta do projeto, nunca via download do navegador
`POST /api/export/:step` SHALL sempre persistir o arquivo `.docx` gerado em `courseRootDir(sess)`, para qualquer etapa exportável (pesquisa, plano-ensino, plano-aula, conteudo, revisao-qualidade, qualidade, ppc, metodologia), independentemente de `sess.config.pastaProjeto` apontar para a pasta interna ou externa. O endpoint SHALL sempre responder com JSON `{ ok: true, saved: true, path }`, onde `path` é o caminho real do arquivo salvo, e SHALL NOT enviar o conteúdo binário do arquivo como resposta HTTP de download (`Content-Disposition: attachment`).

#### Scenario: Exportar etapa
- **WHEN** o usuário clica em "Exportar .docx" para qualquer etapa
- **THEN** o arquivo `.docx` é salvo em `courseRootDir(sess)`
- **THEN** a resposta do endpoint é um JSON `{ ok: true, saved: true, path: "..." }`
- **THEN** nenhum download é iniciado pelo navegador

#### Scenario: Frontend exibe o caminho salvo em vez de baixar o arquivo
- **WHEN** `exportDocx()` recebe a resposta JSON com `saved: true`
- **THEN** o frontend exibe ao usuário o caminho completo onde o arquivo foi salvo
- **THEN** o frontend NÃO cria um `Blob`/link de download para essa resposta
