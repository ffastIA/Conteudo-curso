## Why

A instrução de auto-auditoria em `aplicarMelhoriasSkill` pede ao modelo que indique "em um bullet: a observação e como foi tratada no conteúdo". Na prática, o modelo gera textos explicativos extensos — parágrafos descrevendo o que foi feito — em vez de uma lista simples. Isso polui os arquivos de aula com conteúdo meta-informativo desnecessário e aumenta o consumo de tokens. O usuário precisa apenas de uma lista concisa de bullets indicando cada melhoria aplicada.

## What Changes

- **Alterar** a instrução de auto-auditoria em `aplicarMelhoriasSkill` (`skills.js`) para especificar que a seção `### Melhorias Aplicadas` deve conter APENAS uma lista de bullets — um por melhoria aplicada — sem texto explicativo

## Capabilities

### New Capabilities
_(nenhuma)_

### Modified Capabilities
_(nenhuma — mudança de instrução de prompt; o comportamento do endpoint permanece o mesmo)_

## Non-goals

- Não alterar a extração da seção no handler de server.js
- Não remover a seção `### Melhorias Aplicadas` — ela continua sendo gerada
- Não alterar o conteúdo principal da aula reescrita

## Impact

- **`skills.js`**: alteração na string de instrução ao final de `aplicarMelhoriasSkill` (~linha 255–258)
- **Tokens**: redução marginal por aula, pois a seção de melhorias fica mais compacta
