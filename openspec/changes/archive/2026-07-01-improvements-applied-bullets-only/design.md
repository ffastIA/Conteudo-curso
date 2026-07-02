## Context

A instrução atual (linha ~255–258 em `skills.js`):
```
`\n\nAo final do conteúdo revisado, adicione obrigatoriamente a seguinte seção:\n\n` +
`### Melhorias Aplicadas\n` +
`Para cada observação do revisor listada acima, indique em um bullet: a observação e como foi tratada no conteúdo. ` +
`Se uma observação não foi aplicada, justifique o motivo.`
```

O problema: a instrução pede texto explicativo ("como foi tratada") e justificativas. LLMs respondem a isso com parágrafos, não com bullets concisos.

## Goals / Non-Goals

**Goals:**
- Instrução que force o modelo a gerar uma lista de bullets curtos — uma linha por melhoria

**Non-Goals:**
- Não remover a instrução de justificativa quando uma observação não foi aplicada — isso é útil, apenas deve ser um bullet, não um parágrafo

## Decisions

**Nova instrução**:
```
`\n\nAo final do conteúdo revisado, adicione obrigatoriamente a seguinte seção:\n\n` +
`### Melhorias Aplicadas\n` +
`Liste em bullets curtos cada melhoria aplicada. Um bullet por melhoria. ` +
`Não inclua texto explicativo — apenas a melhoria em si. ` +
`Se uma observação não foi aplicada, inclua um bullet indicando "Não aplicado: <motivo em uma frase>".`
```

## Risks / Trade-offs

**Modelo pode ignorar a instrução** → LLMs geralmente respondem bem a instruções diretas com exemplos de formato. O risco é baixo com `gpt-4o-search-preview`. Se necessário, um exemplo inline pode reforçar o formato.
