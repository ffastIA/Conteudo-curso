## 1. Alterar instrução de auto-auditoria (skills.js)

- [x] 1.1 Em `aplicarMelhoriasSkill` (~linha 255), substituir a instrução de auto-auditoria:
  ```js
  // era:
  `\n\nAo final do conteúdo revisado, adicione obrigatoriamente a seguinte seção:\n\n` +
  `### Melhorias Aplicadas\n` +
  `Para cada observação do revisor listada acima, indique em um bullet: a observação e como foi tratada no conteúdo. ` +
  `Se uma observação não foi aplicada, justifique o motivo.`

  // passa a ser:
  `\n\nAo final do conteúdo revisado, adicione obrigatoriamente a seguinte seção:\n\n` +
  `### Melhorias Aplicadas\n` +
  `Liste em bullets curtos cada melhoria aplicada. Um bullet por melhoria. ` +
  `Não inclua texto explicativo — apenas a melhoria em si. ` +
  `Se uma observação não foi aplicada, inclua um bullet indicando "Não aplicado: <motivo em uma frase>".`
  ```

## 2. Verificação manual

- [ ] 2.1 Executar um ciclo de melhorias e abrir um `aula{NN}_conteudo.docx` — confirmar que a seção `### Melhorias Aplicadas` contém apenas bullets curtos, sem parágrafos explicativos
- [ ] 2.2 Confirmar que aulas onde alguma observação não foi aplicada exibem um bullet `Não aplicado: <motivo>`
