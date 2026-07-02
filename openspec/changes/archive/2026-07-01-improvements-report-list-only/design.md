## Context

Atualmente: `const reportText = fullText + auditSection` onde `fullText` é a concatenação do conteúdo reescrito de TODAS as aulas (incluindo todo o corpo do texto). O relatório resultante é tão longo quanto o conteúdo completo do curso.

A seção `### Melhorias Aplicadas` é gerada pelo modelo ao final de cada aula (via instrução de auto-auditoria em `aplicarMelhoriasSkill`). Ela contém bullets ou texto explicando o que foi mudado. É a única parte que precisa estar no relatório.

## Goals / Non-Goals

**Goals:**
- Relatório com apenas: cabeçalho de aula + seção "### Melhorias Aplicadas" de cada aula + Auditoria do Ciclo
- Acumular as seções de melhorias durante o loop de aulas (não fazer parsing post-hoc de `fullText`)

**Non-Goals:**
- Não alterar o conteúdo gerado pelo modelo
- Não alterar os arquivos `aula{NN}_conteudo.docx`

## Decisions

**Extrair a seção "### Melhorias Aplicadas" durante o loop, não após**

Após `streamSkillToClient` retornar `texto`, usar regex para extrair o bloco a partir de `### Melhorias Aplicadas` até o fim do texto da aula. Acumular em `reportSections[]`. Ao final do loop, compor `reportText` como `reportSections.join('\n\n---\n\n')`.

```js
const reportSections = []; // declarar antes do loop

// dentro do loop, após obter `texto`:
const melhoriasMatch = texto.match(/###\s*Melhorias Aplicadas[\s\S]*/i);
const melhoriasSection = melhoriasMatch ? melhoriasMatch[0].trim() : '_(seção não gerada)_';
reportSections.push(`## Aula ${i + 1}: ${aula.titulo}\n\n${melhoriasSection}`);

// após o loop, substituir a linha atual:
// era: const reportText = fullText + auditSection;
// passa a ser:
const reportText = reportSections.join('\n\n---\n\n') + auditSection;
```

**Fallback quando a seção não é encontrada**

Se o modelo não gerou `### Melhorias Aplicadas` (ex.: erro ou prompt incompleto), o relatório registra `_(seção não gerada)_` para aquela aula. Não bloqueia a geração do relatório.

## Risks / Trade-offs

**Modelo não gera a seção em alguma aula** → Mitigado pelo fallback `_(seção não gerada)_`. O relatório ainda é gerado e útil para as demais aulas.

**Regex pode capturar conteúdo além da seção** → A seção "### Melhorias Aplicadas" é sempre a última seção gerada pela instrução de auto-auditoria, então `[\s\S]*` até o fim do string é correto.
