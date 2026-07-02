## 1. Implementação

- [x] 1.1 Em `server.js`, no handler `POST /api/finalizar-conteudo`, remover o bloco condicional `if (sess.config?.pastaProjeto?.trim())` e o branch de download (`res.setHeader` + `res.send(buffer)`), substituindo por `res.json({ ok: true, saved: true, path: path.join(rootDir, 'conteudo_final.docx') })`

## 2. Verificação manual

- [ ] 2.1 Com projeto sem `pastaProjeto` configurado: clicar em "Conteúdo Concluído" e confirmar que o banner aparece com o caminho `saídas/{slug}/conteudo_final.docx` (sem download no browser)
- [ ] 2.2 Com projeto com `pastaProjeto` configurado: clicar em "Conteúdo Concluído" e confirmar que o banner aparece com o caminho externo
- [ ] 2.3 Confirmar que `conteudo_final.docx` existe no diretório indicado pelo banner
