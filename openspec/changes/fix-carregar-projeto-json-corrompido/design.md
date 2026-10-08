## Context

`/api/carregar-projeto` lê `scr/projeto.json` num `try/catch` e, no `catch`, responde `{ ok:true, etapasCarregadas: [], aviso }` e retorna — antes de `readMemory` e `listarArquivosDoProjeto`. Os `.txt` das etapas ficam intactos em disco. `saveProject` faz leitura-alteração-escrita direto em `projeto.json` com `writeFileSync`, sem escrita atômica; o app só grava JSON via `JSON.stringify`, então um arquivo com conteúdo não-JSON vem de fora do app ou de escrita sobreposta.

## Goals / Non-Goals

**Goals:**
- Nunca perder o acesso aos `.txt` por causa de um `projeto.json` ruim.
- Preservar o arquivo ruim (reversível) e avisar o usuário.
- Tornar a gravação do `projeto.json` atômica.

**Non-Goals:**
- Prevenir sobrescrita externa; locks; reparo em massa.

## Decisions

1. **Tratar JSON inválido como "sem projeto.json"** em vez de abortar: o `try/catch` só marca `corrompido = true`, renomeia o arquivo para `projeto.json.corrompido-<timestamp>.bak` (`fs.renameSync` em try/catch; se falhar, segue sem backup e loga) e deixa o fluxo legado existente (`camposFaltantes: bncc/metodologia/aulas`, `readMemory`, `reconstruirAulasApartirDosArquivos`) rodar. Alternativa descartada: reparar o JSON automaticamente (conteúdo imprevisível).
2. **Aviso**: `aviso: 'projeto.json corrompido — preservado como <arquivo>.bak; ...'` mantém a palavra "corrompido" para compatibilidade com o teste existente; campo extra `backup` com o nome do arquivo. O frontend acrescenta o `aviso` ao banner `bannerProjetoCarregado` (não bloqueante), junto de `camposFaltantes`.
3. **`saveProject` atômico**: escrever em `projeto.json.tmp-<pid>` e `renameSync` sobre `projeto.json`; em erro, remove o temporário. Nunca existe um `projeto.json` parcial.
4. **Nome do `.bak`** sem `:` (timestamp compacto), por ser caminho Windows.

## Risks / Trade-offs

- [`.bak` acumulando a cada carga repetida] → após o rename o `projeto.json` ruim deixa de existir; a próxima carga não encontra arquivo e não gera outro `.bak`.
- [Rename falha (arquivo aberto/OneDrive)] → segue sem backup, avisa e não aborta.
- [Sobrescrita externa continua possível] → fora de escopo; agora é tolerada, não evitada.
