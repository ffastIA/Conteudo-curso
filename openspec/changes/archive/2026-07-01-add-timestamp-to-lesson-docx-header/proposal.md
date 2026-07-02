## Why

O cabeçalho de todos os arquivos `.docx` gerados pelo sistema exibe "Gerado em: 30 de junho de 2026" — apenas a data, sem a hora. Em fluxos iterativos onde múltiplos arquivos são gerados no mesmo dia (ex.: vários ciclos de melhorias, múltiplas rodadas de geração de aulas), a data sozinha não permite distinguir qual arquivo foi criado em qual momento. A hora é necessária para auditoria e rastreabilidade.

## What Changes

- **Alterar** a função `buildDocx` em `server.js` para exibir data e hora no cabeçalho, no formato `"30 de junho de 2026 às 14:35:22"`
- Uso de `toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })` para a parte horária

## Capabilities

### New Capabilities
_(nenhuma)_

### Modified Capabilities
_(nenhuma — mudança de apresentação interna, sem alteração de requisito funcional)_

## Non-goals

- Não alterar o formato dos timestamps nos nomes de arquivo (`melhorias_aplicadas_YYYYMMDD_HHmmss.docx`) — esses já incluem hora
- Não criar novo campo de metadados no `.docx` (apenas o texto visível do cabeçalho)

## Impact

- **`server.js`**: uma alteração na função `buildDocx` (~linha 1197–1199)
- Todos os documentos `.docx` gerados pelo sistema passarão a exibir hora no cabeçalho
