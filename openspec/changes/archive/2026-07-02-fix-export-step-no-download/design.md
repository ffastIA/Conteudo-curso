## Context

`POST /api/export/:step` (`server.js:1188-1236`) já monta o `.docx` (`buildDocx` + `Packer.toBuffer`) e já sabe onde ele deveria ficar (`courseRootDir(sess)`, que resolve para `pastaProjeto` se configurada, ou `saídas/{slug}/` como fallback — `server.js:163-168`). O único problema é o branch condicional em `server.js:1223-1231`: só escreve em disco quando `pastaProjeto` está preenchida; caso contrário, envia o buffer como resposta HTTP com `Content-Disposition: attachment`, e o navegador o salva na pasta Downloads padrão do SO.

Esse exato padrão de bug já foi identificado e corrigido em `POST /api/finalizar-conteudo` pelo change arquivado `2026-06-27-fix-finalizar-conteudo-no-download`. Na época, a correção foi deliberadamente restrita àquele endpoint, deixando `POST /api/export/:step` como não-escopo (ver design.md daquele change, seção Non-Goals). Este change fecha essa lacuna, aplicando a mesma decisão já validada em produção.

## Goals / Non-Goals

**Goals:**
- `POST /api/export/:step` sempre retorna JSON `{ ok: true, saved: true, path }` após salvar com sucesso, para qualquer uma das 7 etapas exportáveis (pesquisa, plano-ensino, plano-aula, conteudo, revisao-qualidade, qualidade, ppc).
- `path` reflete o caminho real onde o arquivo foi salvo, dentro de `courseRootDir(sess)`.
- `exportDocx()` no frontend exibe o caminho salvo em todos os casos, sem depender de download do navegador.

**Non-Goals:**
- Não altera onde o arquivo é salvo (`courseRootDir`/`pastaProjeto` continuam controlando isso, sem mudança).
- Não introduz um mecanismo alternativo de download explícito.
- Não mexe em `persistStage`, `POST /api/finalizar-conteudo` (já correto) nem `POST /api/aplicar-melhorias/confirmar` (já correto).

## Decisions

### Replicar exatamente a correção já validada em `POST /api/finalizar-conteudo`

**Antes** (`server.js:1223-1231`):
```javascript
if (sess.config?.pastaProjeto?.trim()) {
  const fullPath = path.join(courseRootDir(sess), filename);
  fs.writeFileSync(fullPath, buffer);
  return res.json({ ok: true, saved: true, path: fullPath });
}

res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
res.send(buffer);
```

**Depois:**
```javascript
const fullPath = path.join(courseRootDir(sess), filename);
fs.writeFileSync(fullPath, buffer);
res.json({ ok: true, saved: true, path: fullPath });
```

- *Por que:* é a mesma decisão já tomada e validada em `/api/finalizar-conteudo` (`server.js:1685-1690`) — não há razão para os dois endpoints se comportarem de forma diferente, e o non-goal que justificava a exceção ("exports intermediários são ações pontuais", design.md do change de 2026-06-27) foi explicitamente revertido pelo usuário agora, que pediu a correção para todas as exportações.
- *Alternativa considerada:* manter o download como opção configurável (ex.: checkbox "baixar em vez de salvar"). Rejeitada por adicionar complexidade de UI não solicitada; o modelo mental do produto já é "tudo fica na pasta do projeto" (reforçado por `persistStage` e `finalizar-conteudo`), e o export por etapa deve seguir a mesma regra.

### Cliente: remover o fallback de Blob/download em `exportDocx()`

Como o servidor nunca mais retornará um corpo binário desse endpoint, o bloco de `Blob`/`URL.createObjectURL`/`<a download>`/`.click()` (`public/app.js:732-740`) fica inatingível. Ele é removido, mantendo apenas o branch que já trata `data.saved`/`data.path` (`public/app.js:723-730`), idêntico ao padrão já usado no handler de "Finalizar Conteúdo".

### Limpeza oportunista: código morto equivalente no handler de "Finalizar Conteúdo"

`public/app.js:604-641` já tem o mesmo tipo de fallback de Blob/download (linhas 624-634) que ficou inatingível desde a correção de 2026-06-27 (o servidor desse endpoint específico nunca mais envia binário). Como o padrão está sendo tocado agora no mesmo arquivo, remove-se também esse trecho por consistência — risco mínimo, mesmo tipo de mudança já provado seguro.

## Risks / Trade-offs

- [Risco] Usuários que dependiam do download automático (mesmo sem perceber que era um bug) podem estranhar a ausência do arquivo na pasta Downloads → Mitigação: o alerta `exportDocx` já exibe o caminho completo onde o arquivo foi salvo (`alert(`Arquivo salvo em:\n${data.path}`)`, `public/app.js:727`); nenhuma mudança adicional necessária, mesmo texto já usado com sucesso no fluxo de finalizar conteúdo.
- [Risco] Algum outro código client-side dependa do corpo binário retornado por `/api/export/:step` (ex.: preview embutido) → Mitigação: `exportDocx()` é a única função em `public/app.js` que chama esse endpoint (confirmado por busca no arquivo); não há preview de docx no app.

## Migration Plan

Mudança server + client, sem alteração de schema/sessão. Deploy como atualização normal de `server.js` e `public/app.js`; nenhum dado persistido a migrar. Rollback trivial: reverter o diff.
