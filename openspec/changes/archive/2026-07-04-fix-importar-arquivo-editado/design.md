# Design: fix-importar-arquivo-editado

## Context

O modal de importação (`#modalImportar`, `public/index.html:493-507`) fica **depois** da tag `<script src="app.js">` (`index.html:490`), carregada sem `defer`. O bloco de bindings do modal em `app.js:997-1056` executa durante o parse, quando `#importarFileInput` e `#btnConfirmarImportar` ainda não existem — `getElementById` retorna `null`, o `addEventListener` lança `TypeError` e nenhum listener do modal é registrado. O modal ainda abre (a função `abrirImportar` é hoisted e chamada só no clique), mas selecionar o arquivo não dispara nada.

O backend (`POST /api/importar`, `server.js:1409-1439`; `POST /api/importar/confirmar`, `server.js:1442-1474`) está correto e já atualiza `sess.metodologia`/campos de sessão via `STAGES_FIXOS` (`server.js:1381-1388`), de modo que as fases seguintes consomem a versão importada.

Defeitos secundários que aparecem após o fix principal:
1. O export gera `${nome_do_curso}_metodologia.docx` (`server.js:1512`), mas `detectStage()` (`server.js:1390-1407`) só reconhece basename exatamente igual à chave do stage — o round-trip cai sempre no fluxo "ambíguo".
2. `abrirImportar('metodologia')` guarda o hint (`app.js:984`), mas o handler `change` o sobrescreve com `''` no caso ambíguo (`app.js:1017`).
3. Após confirmar, apenas o badge é atualizado (`app.js:1050`); o texto antigo permanece renderizado.

## Goals / Non-Goals

**Goals:**
- Restaurar o funcionamento do fluxo importar em todas as etapas.
- Fazer o round-trip exportar→editar→importar detectar o stage automaticamente, como o spec `pedagogical-methodology` já exige.
- Refletir o texto importado imediatamente na UI.

**Non-Goals:**
- Aceitar formatos além de `.docx`.
- Detecção por título H1 para etapas fixas (hoje só existe para aulas).
- Mudanças no fluxo de confirmação do backend.

## Decisions

1. **`defer` no script em vez de mover o modal ou embrulhar em `DOMContentLoaded`.**
   Alternativas: (B) mover o modal para antes do `<script>`; (C) embrulhar `app.js:997-1056` em `DOMContentLoaded`.
   Escolha: (A) `defer`. É a menor mudança, elimina a classe inteira de bugs de ordem DOM/script (não só este), e é segura: todos os demais bindings de `app.js` referenciam elementos que já estão antes do script, então adiar a execução para pós-parse não muda comportamento. (B) espalha o risco para futuros elementos adicionados após o script; (C) adiciona indentação/ruído e protege só este bloco.

2. **Detecção por sufixo em `detectStage()`.**
   Para cada chave `key` de `STAGES_FIXOS`: aceitar `base === key || base.endsWith('_' + key)` (case/acento-insensível via a normalização já usada na função). O separador `_` evita falsos positivos de substring (ex.: um curso literalmente chamado "metodologia" continua casando pelo match exato). Mesma regra para o padrão `aulaNN_conteudo` já existente.

3. **`stageHint` como fallback, não como override.**
   A detecção automática continua tendo precedência (o usuário pode abrir o modal na metodologia e importar um arquivo de aula). Só quando o backend retorna "ambíguo" o hint pré-seleciona a opção no `#importarStageSeletor` e habilita o botão de confirmar — o usuário ainda vê e pode trocar.

4. **Re-render pós-confirmação reutilizando `renderMarkdown` existente.**
   Ao confirmar com sucesso, além do badge, re-renderizar o elemento de resultado da etapa (`#metodologiaResult` e equivalentes `resultX`) com o texto importado — mapa stage→elemento no próprio handler, sem refatoração.

## Risks / Trade-offs

- [`defer` altera o momento de execução de todo o app.js] → Todos os bindings atuais referenciam elementos definidos antes da linha 490; smoke test manual da página inteira (etapas 1-6) cobre regressões.
- [Detecção por sufixo pode casar nome inesperado] → O separador `_` + match contra chaves fechadas de `STAGES_FIXOS` limita o espaço; teste unitário com nomes reais de export.
- [Fluxo ambíguo com hint errado] → O hint apenas pré-seleciona; a decisão final continua sendo do usuário no seletor.

## Migration Plan

Sem migração de dados. Deploy é substituição de arquivos estáticos + restart do server. Rollback = revert do commit.

## Open Questions

Nenhuma.
