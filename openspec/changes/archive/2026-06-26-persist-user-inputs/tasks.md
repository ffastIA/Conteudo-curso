## 1. Servidor — Estrutura de sessão e persistência

- [x] 1.1 Em `server.js`, adicionar `inputs: {}` ao objeto de sessão inicial dentro de `getSession()` (junto com os demais campos de sessão)
- [x] 1.2 Em `server.js`, adicionar `projeto.inputs = sess.inputs || {}` dentro de `saveProject()`, na seção que constrói o objeto `projeto` antes do `writeFileSync`
- [x] 1.3 Em `server.js`, restaurar `sess.inputs` ao carregar projeto: dentro do bloco `if (fs.existsSync(projetoPath))` em `POST /api/carregar-projeto`, adicionar `sess.inputs = p.inputs || {}`

## 2. Servidor — Captura dos inputs em cada etapa

- [x] 2.1 Em `server.js`, no handler `GET /api/search`: antes de iniciar o streaming, atualizar `sess.inputs.topicos` e `sess.inputs.limite` com os valores recebidos via query string (`topicos`, `limite`)
- [x] 2.2 Em `server.js`, no handler `GET /api/plano-ensino`: antes de iniciar o streaming, atualizar `sess.inputs.ajustesEnsino` com o valor recebido via query string (`ajustes`)
- [x] 2.3 Em `server.js`, no handler `GET /api/plano-aula`: antes de iniciar o streaming, atualizar `sess.inputs.observacoesAula` com o valor recebido via query string (`observacoes`)

## 3. Servidor — Resposta de carregar-projeto

- [x] 3.1 Em `server.js`, no `res.json(...)` final de `POST /api/carregar-projeto`, adicionar os campos `config: sess.config`, `metodologia: sess.metodologia` e `inputs: sess.inputs || {}` à resposta

## 4. Frontend — Repopulação dos campos ao carregar projeto

- [x] 4.1 Em `public/app.js`, na função `selecionarProjeto()`, após receber `data` com sucesso, preencher os campos do formulário da Etapa 1 com `data.config`: `nome`, `publico`, `carga`, `duracao`, `nivel`, `objetivos`, `modalidade`, `proporcaoTeoricoPratico`, `preRequisitos`
- [x] 4.2 Em `public/app.js`, na função `selecionarProjeto()`, se `data.metodologia` for uma string não vazia, renderizar o texto em `#metodologiaResult` via `renderMarkdown()` e exibir `#metodologiaResult` e `#metodologiaActions`
- [x] 4.3 Em `public/app.js`, na função `selecionarProjeto()`, se `data.inputs` estiver presente, preencher os campos: `#topicos` com `data.inputs.topicos`, `#limite` com `data.inputs.limite`, `#ajustesEnsino` com `data.inputs.ajustesEnsino`, `#observacoesAula` com `data.inputs.observacoesAula`

## 5. Verificação

- [ ] 5.1 Testar ciclo completo: criar projeto novo → preencher campos e gerar etapas 1–4 → reiniciar servidor → carregar projeto → verificar que todos os campos aparecem preenchidos
- [x] 5.2 Testar projeto legado (sem `inputs` no `projeto.json`): carregar projeto antigo → verificar que carrega sem erro e campos ficam em branco (sem crash)
- [x] 5.3 Verificar que a metodologia gerada é exibida no painel da Etapa 0 ao recarregar um projeto que passou pela derivação de metodologia
