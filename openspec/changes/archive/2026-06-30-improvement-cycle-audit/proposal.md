## Why

O ciclo de aplicação de melhorias (Etapa 6) não garante nem registra que as melhorias do revisor foram efetivamente implementadas. As observações do revisor existem apenas na sessão em memória, o conteúdo anterior é descartado sem cópia, múltiplos ciclos sobrescrevem os mesmos arquivos, e o modelo não é obrigado a reportar o que aplicou. O resultado é um processo auditável apenas visualmente — quem revisou não sabe o que mudou, e o sistema não detecta quando o modelo ignora as observações.

## What Changes

- **Persistência de observações no upload**: `POST /api/aplicar-melhorias` grava `scr/observacoes_pendentes.json` imediatamente após extrair as observações do `.docx`, antes de qualquer confirmação
- **Snapshot de ciclos**: `GET /api/aplicar-melhorias/confirmar` cria `scr/ciclo_{NNN}/` com snapshot dos conteúdos anteriores, `observacoes.json` e `meta.json` antes de sobrescrever qualquer arquivo
- **Métrica de mudança Jaccard**: após gerar o novo conteúdo de cada aula, o sistema calcula `textSimilarity(textoAntigo, textoNovo)` e emite aviso SSE se similaridade > 90%; salva similaridade por aula em `meta.json`
- **Auto-auditoria no prompt**: `aplicarMelhoriasSkill` instrui o modelo a incluir seção `### Melhorias Aplicadas` ao final, mapeando cada observação para a ação tomada. Para reduzir a utilização de tokens apenas liste as melhorias aplicadas na aula. Não há necessidade de justificar
- **Timestamp no título da aula**: hoje o sistema já inclui da data de criação abaixo do título da aula. Inserir um timestamp após a data de forma a podermos identificar também qual a hora de geraçõ do conteúdo

## Capabilities

### New Capabilities

- `improvement-cycle-history`: rastreamento de ciclos de melhoria — snapshot de conteúdo anterior, observações que guiaram o ciclo e métricas de mudança por aula

### Modified Capabilities

- `improvement-application-cycle`: upload persiste observações em disco; confirmação cria snapshot antes de sobrescrever; modelo produz seção de auto-auditoria

## Impact

- **`server.js`**: `POST /api/aplicar-melhorias` + `GET /api/aplicar-melhorias/confirmar`
- **`skills.js`**: `aplicarMelhoriasSkill` — adição de instrução de auto-auditoria no prompt
- **Estrutura de disco**: novo diretório `scr/ciclo_{NNN}/` por ciclo executado; novo arquivo `scr/observacoes_pendentes.json`
- **Frontend**, endpoints públicos, schema de sessão: sem alteração

## Non-goals

- Não exibir o histórico de ciclos na interface (somente em disco)
- Não implementar rollback para ciclo anterior
- Não comparar ciclos entre si (documento comparativo) — escopo futuro
- Não alterar o contrato de resposta dos endpoints existentes
