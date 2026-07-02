## Why

O arquivo `melhorias_aplicadas_YYYYMMDD_HHmmss.docx` gerado ao final de cada ciclo de melhorias contém o conteúdo integral reescrito de todas as aulas, seguido da seção "### Melhorias Aplicadas" de cada uma. Isso duplica completamente o conteúdo das aulas no relatório, gerando um documento extenso, poluído e caro em tokens de geração. O propósito do relatório é auditar o que foi mudado — não reproduzir o conteúdo novo.

## What Changes

- **Alterar** a construção de `reportText` em `GET /api/aplicar-melhorias/confirmar`: em vez de usar `fullText` (conteúdo completo de todas as aulas), extrair apenas a seção `### Melhorias Aplicadas` de cada aula e compor um relatório enxuto com título da aula + lista de melhorias
- O relatório final terá a estrutura: `## Aula N: Título` → seção `### Melhorias Aplicadas` → separador → próxima aula → Auditoria do Ciclo (se houver)
- **Manter** a seção de auditoria Jaccard no final do relatório

## Capabilities

### New Capabilities
_(nenhuma)_

### Modified Capabilities
- `improvement-cycle-history`: o arquivo `melhorias_aplicadas_*.docx` passa a conter apenas os títulos das aulas e as seções de melhorias aplicadas, sem o conteúdo integral reescrito

## Non-goals

- Não alterar os arquivos individuais de aula (`aula{NN}_conteudo.docx`) — esses continuam com o conteúdo completo incluindo a seção "Melhorias Aplicadas"
- Não alterar o conteúdo que o modelo gera
- Não alterar a estrutura da seção "### Melhorias Aplicadas" gerada pelo modelo

## Impact

- **`server.js`**: alteração na construção de `reportText` (~linha 1603) no handler `GET /api/aplicar-melhorias/confirmar`
- **Tokens**: redução significativa no tamanho do `.docx` gerado — apenas as seções de melhorias, sem o corpo das aulas
