# Tasks: aumentar-teto-e-continuacoes-melhorias

## 1. Teto de tokens

- [x] 1.1 `MAX_TOKENS_AULA` (`server.js:34`): 10_000 → 16_000

## 2. Duas tentativas de continuação

- [x] 2.1 Converter o `if` único de continuação (dentro de `/api/aplicar-melhorias/confirmar`) em laço de até `MAX_CONTINUACOES_MELHORIA = 2` tentativas: cada iteração reenvia o texto acumulado até ali como mensagem `assistant`, pede continuação a partir dos últimos ~200 caracteres, e reavalia `isRespostaMelhoriasCompleta` antes de decidir se tenta de novo
- [x] 2.2 Mensagens de progresso/log distinguem a tentativa (ex.: `resposta cortada — solicitando continuação (tentativa 1/2)...`)
- [x] 2.3 Preservar o conteúdo anterior e emitir aviso apenas após esgotar as duas tentativas

## 3. Testes

- [x] 3.1 Revisar testes existentes que fixam o valor de `MAX_TOKENS_AULA` (ex.: `tests/unit/token-usage.test.js` ou equivalentes) para o novo valor, se houver asserção numérica
- [x] 3.2 `npx jest` completo verde + `node --check`

## 4. Validação e fechamento

- [ ] 4.1 E2E manual (servidor reiniciado): rodar novamente o ciclo de melhorias na aula que truncou (ex.: "Animações e Efeitos Dinâmicos") e confirmar que completa dentro do novo teto/tentativas, ou — se ainda truncar — que o log mostra as duas tentativas antes de preservar o conteúdo
- [x] 4.2 Sync dos specs (`content-generation`, `improvement-application-cycle`), arquivar o change, commit, push
