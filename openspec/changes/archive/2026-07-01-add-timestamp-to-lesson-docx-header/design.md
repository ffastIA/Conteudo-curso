## Context

`buildDocx` usa `new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })` que produz apenas "30 de junho de 2026". É chamada em `persistStage` e nos handlers de download.

## Goals / Non-Goals

**Goals:**
- Exibir data + hora no cabeçalho de todos os `.docx` gerados

**Non-Goals:**
- Não alterar metadados internos do arquivo `.docx`
- Não alterar os nomes dos arquivos gerados

## Decisions

**Formato: `"30 de junho de 2026 às 14:35:22"`**

Combinar `toLocaleDateString` + `toLocaleTimeString` em português é o caminho mais simples e consistente com o estilo atual do projeto. Não requer dependências externas.

```js
const now = new Date();
const datePart = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const timePart = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const label = `Gerado em: ${datePart} às ${timePart}`;
```

## Risks / Trade-offs

Nenhum risco significativo. Mudança puramente cosmética no cabeçalho do documento.
