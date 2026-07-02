## MODIFIED Requirements

### Requirement: Pasta raiz por projeto com subdiretório /scr para internos
Cada projeto SHALL ter uma pasta raiz (`pastaProjeto` em `sess.config`). `POST /api/config` SHALL exigir que `pastaProjeto` esteja preenchida para configurar/criar um projeto, retornando erro 400 se estiver vazia. O sistema SHALL salvar arquivos `.docx` de exportação em `courseRootDir(sess)` e arquivos internos (`.txt`, `projeto.json`) em `courseScrDir(sess)`.

```
courseRootDir(sess) = pastaProjeto?.trim() || saídas/{slug}/
courseScrDir(sess)  = courseRootDir(sess) + /scr/
```

O fallback para `saídas/{slug}/` permanece implementado em `courseRootDir` por compatibilidade com sessões de projetos legados (carregados sem `pastaProjeto` definida, ex.: pelo fluxo "legado" de `POST /api/carregar-projeto`), mas SHALL NOT ser alcançável para qualquer projeto criado/configurado a partir deste change, já que `POST /api/config` passa a rejeitar `pastaProjeto` vazia.

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
- **WHEN** um projeto legado (criado antes desta mudança, sem `pastaProjeto` gravada) é carregado via `POST /api/carregar-projeto` no fluxo "legado" (sem `scr/projeto.json`)
- **THEN** o sistema continua funcionando com o fallback `saídas/{slug}/`, sem quebrar o carregamento
- **THEN** a pasta que o usuário selecionou para carregar esse projeto passa a ser usada como `pastaProjeto` dali em diante (ver capability `project-load`), corrigindo o projeto para o padrão obrigatório assim que reaberto
