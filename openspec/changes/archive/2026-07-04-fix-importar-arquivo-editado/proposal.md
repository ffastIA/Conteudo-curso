# Proposal: fix-importar-arquivo-editado

## Why

O fluxo "Importar versão editada" está inoperante em todas as etapas: o usuário exporta um artefato (ex.: metodologia) como `.docx`, edita e, ao tentar reimportar, nada acontece — nenhuma requisição é enviada. A causa raiz é que `public/app.js` é carregado de forma síncrona (`index.html:490`, sem `defer`) **antes** do modal de importação existir no DOM (`index.html:493-507`); o `addEventListener` em `#importarFileInput` (`app.js:997`) lança `TypeError` no top-level e mata o registro de todos os listeners do modal. Isso viola requisitos já aprovados nas capabilities `stage-import` e `pedagogical-methodology` ("Reimportar metodologia editada" com detecção automática de stage).

## What Changes

- Corrigir a ordem de carregamento do script (`defer` em `index.html:490`) para que os listeners do modal de importação sejam registrados.
- Estender `detectStage()` (`server.js:1390-1407`) para reconhecer o nome gerado pelo export `${nome_do_curso}_metodologia.docx` (`server.js:1512`) — hoje só reconhece o basename exato `metodologia`, forçando o round-trip download→upload a cair sempre no fluxo "ambíguo".
- Usar o `stageHint` passado por `abrirImportar(stage)` (`app.js:982-991`) como pré-seleção/fallback no caso ambíguo, em vez de descartá-lo (`app.js:1017`).
- Atualizar o conteúdo exibido na tela após confirmação da importação (hoje só o badge muda, `app.js:1050`, e o texto antigo permanece visível).

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `stage-import`: a detecção de stage passa a aceitar basenames com prefixo do curso (sufixo `_<stage>`), o hint da etapa de origem do clique vira fallback de pré-seleção no fluxo ambíguo, e a confirmação de importação passa a atualizar o conteúdo renderizado da etapa (não apenas o badge).

## Non-goals

- Não altera o formato aceito de upload (permanece somente `.docx` via mammoth).
- Não altera o backend de confirmação (`POST /api/importar/confirmar`), que já funciona corretamente.
- Não trata a propagação de metodologia/modalidade às skills (coberto pelo change `propagar-modalidade-curso`).
- Não introduz detecção por título H1 para etapas fixas (só existe para aulas hoje; fica como possível melhoria futura).

## Impact

- **Gap relacionado**: nenhum gap do registro (G01–G07) — é um defeito funcional; tangencia G07 (ausência de testes automatizados de frontend, que deixou o erro passar).
- **Frontend**: `public/index.html` (linha 490; nenhuma mudança estrutural no modal), `public/app.js` (linhas 997-1056).
- **Backend**: `server.js` (`detectStage`, linhas 1390-1407).
- **Testes**: novo teste de `detectStage` com nomes prefixados; teste manual E2E do ciclo exportar→editar→importar→confirmar→gerar etapa seguinte.
- **Risco**: baixo — `defer` mantém a ordem de execução após o parse completo do DOM; todos os demais bindings de `app.js` referenciam elementos anteriores ao script e continuam válidos.
