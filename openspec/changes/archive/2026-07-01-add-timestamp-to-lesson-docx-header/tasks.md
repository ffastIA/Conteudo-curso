## 1. Adicionar hora ao cabeçalho do docx (server.js)

- [x] 1.1 Em `buildDocx` (~linha 1197), substituir a geração do timestamp:
  ```js
  // era:
  const now = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
  // ...
  children: [new TextRun({ text: `Gerado em: ${now}`, color: '666666', size: 22 })]

  // passa a ser:
  const now = new Date();
  const datePart = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const timePart = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  // ...
  children: [new TextRun({ text: `Gerado em: ${datePart} às ${timePart}`, color: '666666', size: 22 })]
  ```

## 2. Verificação manual

- [ ] 2.1 Gerar qualquer documento `.docx` (ex.: aula de conteúdo ou plano de ensino) e abrir no Word/LibreOffice — confirmar que o cabeçalho exibe data e hora no formato "30 de junho de 2026 às 14:35:22"
