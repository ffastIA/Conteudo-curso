## Context

`escolherPastaWindows()` (`server.js`) roda um script PowerShell com `FolderBrowserDialog` e devolve `SelectedPath`. Não define pasta inicial, então o Windows abre na raiz do usuário. O endpoint é compartilhado pelos botões `btnSelecionarPastaProjeto` e `btnProcurarPastaProjeto` via `escolherPasta()` em `public/app.js`.

## Goals / Non-Goals

**Goals:**
- Abrir o diálogo na última pasta escolhida, entre reinícios do servidor e entre navegadores.
- Nunca quebrar o seletor por falha da persistência.

**Non-Goals:**
- Lista de recentes; persistência por usuário; mudanças no frontend.

## Decisions

1. **Persistência no servidor, em arquivo** (`.ultima-pasta.json` na raiz do app, `{ pasta, atualizadoEm }`) em vez de `localStorage`: o caminho só é usado pelo servidor (que abre o diálogo) e sobrevive a trocar de navegador ou limpar dados. Caminho sobrescrevível por `ULTIMA_PASTA_FILE` (usado nos testes para não tocar no arquivo real).
2. **Gravar ao selecionar** (retorno não nulo do diálogo), não ao carregar o projeto com sucesso — é o comportamento pedido. Cancelamento (`null`) não altera nada.
3. **Pasta inicial por variável de ambiente do processo filho**: `execFile(..., { env: { ...process.env, PASTA_INICIAL } })` e `$env:PASTA_INICIAL` no script (`$f.SelectedPath`), em vez de interpolar o caminho no texto do script — evita injeção e problemas de aspas/acentos. Só é definida se a pasta ainda existir (`fs.existsSync`); caso contrário abre como hoje.
4. **Helpers tolerantes**: `lerUltimaPasta()`/`gravarUltimaPasta()` com try/catch silencioso (log de aviso); arquivo corrompido ou ausente equivale a "sem pasta lembrada".

## Risks / Trade-offs

- [Pasta lembrada removida/renomeada] → `existsSync` falso, abre na raiz como hoje.
- [Arquivo na raiz do app dentro do OneDrive] → é um estado local descartável; `.gitignore` evita versionar.
- [`SelectedPath` abre com a pasta selecionada, não no pai] → desejado: facilita reabrir o mesmo projeto e a árvore já fica expandida até ele.
