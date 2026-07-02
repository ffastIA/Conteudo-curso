## Why

Ao concluir o ciclo de aplicação de melhorias, o único arquivo gerado é `conteudo.docx`, que é sobrescrito a cada ciclo. Não há registro histórico de quais melhorias foram feitas em que data, nem evidência documental de quando o índice Jaccard detectou que nenhuma nova implementação foi realizada — a detecção atual existe apenas como aviso SSE transitório. O usuário não tem como auditar retrospectivamente se um ciclo anterior produziu mudanças reais.

## What Changes

- **Relatório timestampado por ciclo**: ao final de `GET /api/aplicar-melhorias/confirmar`, além de persistir `conteudo.docx` (versão atual, sem alteração), salvar `melhorias_aplicadas_YYYYMMDD_HHmmss.docx` em `rootDir` — arquivo imutável que representa o estado do ciclo naquele momento
- **Auditoria Jaccard no documento**: quando uma ou mais aulas têm similaridade > 90%, o relatório inclui a seção `## Auditoria do Ciclo` ao final, listando cada aula afetada com sua porcentagem; quando **todas** as aulas estão acima do limiar, a seção inicia com "Nenhuma nova implementação detectada neste ciclo"
- **`conteudo.docx` e `conteudo.txt`**: Eliminar a geração desse arquivo consolidado das aulas. Deixar apenas os arquivos de aulas individuais

## Capabilities

### New Capabilities

- `improvement-cycle-history`: relatório por ciclo com timestamp e auditoria Jaccard embutida

### Modified Capabilities

_(nenhuma — nenhum requisito existente muda de comportamento)_

## Impact

- **`server.js`**: `GET /api/aplicar-melhorias/confirmar` — após o `persistStage` do conteúdo consolidado, adicionar geração do docx timestampado com auditoria
- **Frontend, endpoints públicos, schema de sessão**: sem alteração
- **Estrutura de disco**: cada ciclo cria `melhorias_aplicadas_YYYYMMDD_HHmmss.docx` em `rootDir`; arquivos anteriores são preservados, exceto "conteudo.docx" e conteudo,txt" que devem ser eliminados do processo
