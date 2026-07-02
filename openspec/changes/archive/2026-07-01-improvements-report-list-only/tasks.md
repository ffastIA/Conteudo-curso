## 1. Acumular seções de melhorias no loop (server.js)

- [x] 1.1 Em `GET /api/aplicar-melhorias/confirmar`, declarar `reportSections` antes do loop de aulas:
  ```js
  const reportSections = [];
  ```

- [x] 1.2 Dentro do loop, após obter `texto` de `streamSkillToClient`, extrair a seção de melhorias e acumular:
  ```js
  const melhoriasMatch = texto.match(/###\s*Melhorias Aplicadas[\s\S]*/i);
  const melhoriasSection = melhoriasMatch ? melhoriasMatch[0].trim() : '_(seção não gerada)_';
  reportSections.push(`## Aula ${i + 1}: ${aula.titulo}\n\n${melhoriasSection}`);
  ```

## 2. Alterar a construção de reportText (server.js)

- [x] 2.1 No bloco de geração do relatório timestampado (~linha 1603), substituir:
  ```js
  // era:
  const reportText = fullText + auditSection;
  // passa a ser:
  const reportText = reportSections.join('\n\n---\n\n') + auditSection;
  ```

## 3. Verificação manual

- [ ] 3.1 Executar um ciclo de melhorias e abrir `melhorias_aplicadas_*.docx` — confirmar que contém apenas os títulos das aulas e as seções "### Melhorias Aplicadas", sem o conteúdo integral reescrito
- [ ] 3.2 Confirmar que os arquivos individuais `aula{NN}_conteudo.docx` continuam com o conteúdo completo (não foram alterados)
- [ ] 3.3 Simular ausência da seção no modelo e confirmar que o relatório registra `_(seção não gerada)_` para essa aula sem falhar
