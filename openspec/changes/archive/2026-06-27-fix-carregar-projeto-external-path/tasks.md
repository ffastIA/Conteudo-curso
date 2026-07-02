## 1. Implementação

- [x] 1.1 Em `server.js`, no handler `POST /api/carregar-projeto`, substituir `const dir = path.join(SAIDAS_ROOT, slug)` por um bloco que resolve `baseDir`: lê `index.json`, usa `pastaProjeto` do slug se não-vazio, senão mantém `saídas/{slug}/`
- [x] 1.2 Substituir `if (!fs.existsSync(dir))` por `if (!fs.existsSync(baseDir))`
- [x] 1.3 Mover a chamada a `migrarSeNecessario(slug)` para dentro de `if (baseDir === path.join(SAIDAS_ROOT, slug))`
- [x] 1.4 Substituir `path.join(SAIDAS_ROOT, slug, 'scr', 'projeto.json')` por `path.join(baseDir, 'scr', 'projeto.json')`
- [x] 1.5 No branch legado (sem `projeto.json`), definir `pastaProjeto` como `baseDir` quando `baseDir` for externo, ou `''` quando for local

## 2. Verificação manual

- [ ] 2.1 Com projeto externo registrado em `index.json` com `pastaProjeto` preenchido: carregar via lista de projetos e confirmar que o campo "Pasta do projeto" na Etapa 1 aparece preenchido com o caminho externo
- [ ] 2.2 Confirmar que após carregamento, `persistStage` (ex.: aplicar melhorias) grava os arquivos no caminho externo
- [ ] 2.3 Com `index.json` ausente ou corrompido: confirmar que o carregamento faz fallback para `saídas/{slug}/` sem erro
- [ ] 2.4 Com `pastaProjeto` apontando para diretório inexistente: confirmar que o endpoint retorna 404
