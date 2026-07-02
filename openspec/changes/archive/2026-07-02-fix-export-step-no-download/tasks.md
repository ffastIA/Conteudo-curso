## 1. Servidor: sempre salvar em disco em /api/export/:step

- [x] 1.1 Em `server.js`, no endpoint `POST /api/export/:step` (~linhas 1218-1231), remover o `if (sess.config?.pastaProjeto?.trim())` condicional e o branch de download (`Content-Type`/`Content-Disposition`/`res.send(buffer)`).
- [x] 1.2 Sempre executar `const fullPath = path.join(courseRootDir(sess), filename); fs.writeFileSync(fullPath, buffer); res.json({ ok: true, saved: true, path: fullPath });`, replicando o padrão de `POST /api/finalizar-conteudo` (`server.js:1685-1690`).

## 2. Cliente: tratar apenas a resposta JSON em exportDocx()

- [x] 2.1 Em `public/app.js`, na função `exportDocx()` (~linhas 709-744), remover o fallback de `Blob`/`URL.createObjectURL`/`<a download>`/`.click()` (~linhas 732-740), mantendo apenas o branch que trata `data.saved`/`data.path` (~linhas 723-730).
- [x] 2.2 Confirmado por revisão de código e teste real: como o endpoint agora sempre retorna o mesmo formato JSON `{ok, saved, path}` independente da etapa, o `alert` (`Arquivo salvo em:\n${data.path}`) vale igualmente para as 7 etapas exportáveis.

## 3. Limpeza oportunista (opcional)

- [x] 3.1 Em `public/app.js`, no handler do botão "Finalizar Conteúdo" (~linhas 604-641), removido o fallback de Blob/download equivalente, já inatingível desde a correção de 2026-06-27, por consistência com a limpeza feita na task 2.1.

## 4. Validação manual

- [x] 4.1 Testado via curl contra o servidor real (sessão `/api/dev/seed`), com `pastaProjeto` vazio: exportei pesquisa, plano-ensino, plano-aula e conteudo (as 4 etapas com conteúdo pré-populado pelo seed) — todos os `.docx` apareceram em `saídas/Python_para_Iniciantes/` com resposta JSON `{ok:true,saved:true,path:...}`, sem nenhum header de download. As etapas revisao-qualidade/qualidade/ppc não têm dado de seed disponível para teste isolado, mas compartilham exatamente o mesmo código do endpoint (só o campo de conteúdo lido muda), então estão cobertas pela mesma correção.
- [x] 4.2 Repeti o mesmo teste após configurar `pastaProjeto` via `POST /api/config` (pasta de teste fora do repositório) — os 4 arquivos apareceram corretamente na pasta configurada, mantendo o comportamento já correto para esse caso.
- [x] 4.3 Confirmado: o campo `path` no JSON de resposta bateu exatamente com o local real do arquivo em disco em ambos os cenários (fallback `saídas/{slug}/` e `pastaProjeto` configurada).
