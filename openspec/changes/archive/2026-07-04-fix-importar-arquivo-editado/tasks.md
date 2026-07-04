# Tasks: fix-importar-arquivo-editado

## 1. Correção principal (listeners do modal)

- [x] 1.1 Adicionar `defer` na tag `<script src="app.js">` em `public/index.html:490`
- [x] 1.2 Smoke test manual da página completa (etapas 1-6) para confirmar que nenhum binding regrediu com o `defer`

## 2. Detecção de stage no round-trip export→import

- [x] 2.1 Estender `detectStage()` em `server.js:1390-1407` para aceitar basename com sufixo `_<stage>` para cada chave de `STAGES_FIXOS` (mantendo o match exato e o padrão `aulaNN_conteudo`)
- [x] 2.2 Teste unitário de `detectStage` cobrindo: nome exato (`metodologia.docx`), nome exportado com prefixo (`Curso_X_metodologia.docx`), nome de aula (`aula03_conteudo.docx`), nome de aula com prefixo, e nome ambíguo

## 3. UX do modal de importação

- [x] 3.1 Em `public/app.js` (handler `change`, ~linhas 997-1028): no caso ambíguo, usar o `stageHint` guardado por `abrirImportar()` para pré-selecionar `#importarStageSeletor` e habilitar `#btnConfirmarImportar`, sem sobrescrever o hint com `''`
- [x] 3.2 Em `public/app.js` (handler de confirmação, ~linhas 1030-1056): após sucesso, re-renderizar o elemento de resultado da etapa afetada (`#metodologiaResult` e equivalentes; aulas incluídas) com o texto importado via `renderMarkdown`

## 4. Validação end-to-end

- [ ] 4.1 Teste manual do ciclo completo: gerar metodologia → exportar .docx → editar externamente → importar → verificar detecção automática, badge "✏️ Versão do usuário" e texto atualizado na tela
- [ ] 4.2 Verificar que a Etapa 2 (pesquisa) e o plano de ensino usam o texto editado (conferir log de metodologia em `server.js:2327`)
- [ ] 4.3 Repetir importação em uma etapa não-fixa (aula) para confirmar que o fluxo geral não regrediu
