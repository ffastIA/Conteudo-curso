## Context

`POST /api/finalizar-conteudo` sempre salva `conteudo_final.docx` em disco via `courseRootDir(sess)` (caminho externo se `pastaProjeto` configurado, ou `saídas/{slug}/` caso contrário). Após salvar, havia um branch condicional: se `pastaProjeto` estivesse preenchido, retornava JSON com o caminho; caso contrário, enviava o buffer como download via `Content-Disposition: attachment`. O arquivo já estava em disco em ambos os casos — o download era redundante e gerava confusão sobre onde o arquivo final estava localizado.

## Goals / Non-Goals

**Goals:**
- `POST /api/finalizar-conteudo` sempre retorna JSON `{ ok: true, saved: true, path }` após salvar com sucesso
- `path` reflete o caminho real onde o arquivo foi salvo (`courseRootDir/conteudo_final.docx`)
- O frontend exibe o banner de confirmação com o caminho em todos os casos

**Non-Goals:**
- Não altera onde o arquivo é salvo (controlado por `courseRootDir`)
- Não adiciona um botão de download explícito no frontend
- Não muda o comportamento dos outros endpoints de export (`POST /api/export/:step`) que ainda suportam download quando `pastaProjeto` não está configurado

## Decisions

### Remoção do branch condicional de download

**Antes:**
```javascript
if (sess.config?.pastaProjeto?.trim()) {
  return res.json({ ok: true, saved: true, path: path.join(rootDir, filename) });
}
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
res.send(buffer);
```

**Depois:**
```javascript
res.json({ ok: true, saved: true, path: path.join(rootDir, 'conteudo_final.docx') });
```

O `buffer` já não precisa ser enviado — foi escrito em disco na linha anterior. O `filename` com `nomeSlug` no path do JSON foi corrigido para usar o nome real do arquivo salvo (`conteudo_final.docx`), evitando inconsistência entre o path reportado e o arquivo existente.

## Risks / Trade-offs

| Risco | Mitigação |
|---|---|
| Usuário sem `pastaProjeto` não recebe mais o arquivo via download | O arquivo está em `saídas/{slug}/conteudo_final.docx`; o banner agora mostra o caminho completo |
| Comportamento diferente de `POST /api/export/:step` (que ainda faz download) | Aceitável — `finalizar-conteudo` é a conclusão permanente do curso; exports intermediários são ações pontuais |
