## 1. server.js — Novos helpers de path

- [x] 1.1 Em `server.js`, substituir a função `courseDir(sess)` por duas funções: `courseRootDir(sess)` que retorna `sess.config?.pastaProjeto || path.join(SAIDAS_ROOT, slugify(sess.config?.nome))` (com `mkdirSync`) e `courseScrDir(sess)` que retorna `path.join(courseRootDir(sess), 'scr')` (com `mkdirSync`)
- [x] 1.2 Em `server.js`, atualizar `readMemory(sess, baseName)` para ler de `path.join(courseScrDir(sess), \`${baseName}.txt\`)`
- [x] 1.3 Em `server.js`, atualizar `saveProject(sess, stageInfo)` para salvar `projeto.json` em `path.join(courseScrDir(sess), 'projeto.json')`
- [x] 1.4 Em `server.js`, atualizar `saveProject(sess)` para também atualizar o índice global `saídas/index.json`: ler o JSON atual (ou `{}`), mesclar a entrada `{ [slug]: { nome, pastaProjeto, ultimaModificacao } }` e gravar de volta

## 2. server.js — persistStage e exportações

- [x] 2.1 Em `server.js`, atualizar `persistStage(sess, baseName, label, content, sites)` para salvar `.txt` em `courseScrDir(sess)` e `.docx` em `courseRootDir(sess)`
- [x] 2.2 Em `server.js`, atualizar os endpoints `POST /api/export/:step` para salvar o `.docx` em `courseRootDir(sess)` em vez de usar `sess.pastaSaida`
- [x] 2.3 Em `server.js`, atualizar o endpoint de geração de conteúdo final (Etapa 7) para salvar `conteudo_final.docx` em `courseRootDir(sess)`

## 3. server.js — Validação de pastaProjeto em POST /api/config

- [x] 3.1 Em `server.js`, no handler `POST /api/config`, após aceitar `req.body`, adicionar validação de `pastaProjeto`: rejeitar com HTTP 400 se contiver `..`; rejeitar se apontar para dentro de `__dirname`; testar permissão de escrita com `fs.accessSync(pasta, fs.constants.W_OK)` e rejeitar com HTTP 400 se falhar; aceitar e armazenar `sess.config.pastaProjeto = pastaProjeto` se válido

## 4. server.js — Migração de projetos legados e carregar-projeto

- [x] 4.1 Em `server.js`, no handler `POST /api/carregar-projeto`, após determinar o `slug`, adicionar função `migrarSeNecessario(slug)`: verificar se `saídas/{slug}/projeto.json` existe na raiz (sem `/scr`); se sim, criar `saídas/{slug}/scr/`, mover todos os `.txt` e `projeto.json` para lá
- [x] 4.2 Em `server.js`, no handler `POST /api/carregar-projeto`, após a migração, ler `projeto.json` de `courseScrDir` (usando `path.join(SAIDAS_ROOT, slug, 'scr', 'projeto.json')`)
- [x] 4.3 Em `server.js`, no handler `POST /api/carregar-projeto`, restaurar `sess.config.pastaProjeto` a partir de `p.config?.pastaProjeto || ''`

## 5. server.js — GET /api/projetos e remoção de pasta-saida

- [x] 5.1 Em `server.js`, atualizar `GET /api/projetos` para ler `saídas/index.json` (se existir), combinar com os diretórios em `saídas/` e retornar a lista; verificar que `courseScrDir` existe no disco antes de incluir cada projeto na lista
- [x] 5.2 Em `server.js`, remover o endpoint `POST /api/pasta-saida` e o campo `pastaSaida` do objeto de sessão inicial em `getSession()`

## 6. Frontend — Etapa 1 e remoção de pastaSaida

- [x] 6.1 Em `public/index.html`, adicionar campo `<input type="text" id="pastaProjeto">` com label "Pasta do projeto" na Etapa 1, após o campo `preRequisitos` e antes do botão de submissão; remover o elemento de UI de `pastaSaida` do painel de configurações (se existir)
- [x] 6.2 Em `public/app.js`, incluir `pastaProjeto: document.getElementById('pastaProjeto').value.trim()` no objeto enviado pelo `configForm` via `POST /api/config`
- [x] 6.3 Em `public/app.js`, em `selecionarProjeto()`, preencher `document.getElementById('pastaProjeto').value` com `data.config.pastaProjeto || ''` ao restaurar um projeto
- [x] 6.4 Em `public/app.js`, remover a lógica do `btnSalvarPasta` (chamada a `POST /api/pasta-saida`) e quaisquer referências a `pastaSaida`

## 7. Verificação

- [x] 7.1 Verificar sintaxe: `node --check server.js` deve passar sem erros
- [ ] 7.2 Testar fluxo novo: criar projeto com `pastaProjeto` definido → gerar Etapa 1 → verificar que `.txt` está em `{pastaProjeto}/scr/` e `.docx` está em `{pastaProjeto}/`
- [ ] 7.3 Testar fluxo fallback: criar projeto sem `pastaProjeto` → gerar etapa → verificar que `.txt` está em `saídas/{slug}/scr/` e `.docx` em `saídas/{slug}/`
- [ ] 7.4 Testar migração: iniciar com projeto legado (`saídas/Python_para_Iniciantes/` com arquivos planos) → carregar projeto → verificar que arquivos foram movidos para `/scr` e sessão carrega corretamente
- [ ] 7.5 Testar restart: após configurar projeto com `pastaProjeto`, reiniciar servidor → carregar projeto → verificar que campo "Pasta do projeto" aparece preenchido na Etapa 1
