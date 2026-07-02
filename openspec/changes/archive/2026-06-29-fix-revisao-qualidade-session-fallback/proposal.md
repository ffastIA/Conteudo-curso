## Why

Ao reiniciar o servidor (ou após refresh de página), a sessão em memória é perdida e `sess.conteudoPorAula` fica vazio. O handler `GET /api/revisao-qualidade` (Etapa 5★) verificava esse array sem antes tentar restaurá-lo do disco, retornando HTTP 400. Como o frontend abre a conexão via `EventSource`, um 400 não aciona a mensagem de erro real — aciona o `onerror` do SSE, exibindo "✖ Erro de conexão com o servidor" e bloqueando o fluxo de revisão. A função `restoreConteudoPorAula` já existia e já era chamada nos handlers da Etapa 6; o handler da Etapa 5★ estava simplesmente sem essa chamada.

## What Changes

- `GET /api/revisao-qualidade` em `server.js` passa a chamar `restoreConteudoPorAula(sess)` antes do guard `if (!sess.conteudoPorAula?.length)`
- O comportamento de erro real ("Conclua a Etapa 5 antes...") continua sendo retornado caso a restauração também não encontre dados em disco

## Capabilities

### New Capabilities

_(nenhuma)_

### Modified Capabilities

- `content-quality-review`: o endpoint de geração da revisão de qualidade passa a tolerar sessão vazia, restaurando o estado a partir do disco antes de validar

## Impact

- **`server.js`**: uma linha inserida no handler `GET /api/revisao-qualidade` (~linha 1311)
- **`skills.js`**, **frontend**, endpoints, schema de dados: sem alteração

## Non-goals

- Não implementar restauração de outros campos de sessão além de `conteudoPorAula` — escopo coberto por `fix-aplicar-melhorias-session-fallback`
- Não modificar a lógica de `restoreConteudoPorAula` em si — a função já está correta
- Não alterar o comportamento quando a sessão já está populada
