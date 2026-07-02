## 1. Remover truncamento de conteudoAtual (server.js)

- [x] 1.1 Em `GET /api/aplicar-melhorias/confirmar` (~linha 1550), alterar a chamada a `aplicarMelhoriasSkill`:
  ```js
  // era:
  conteudoAtual: truncate(aula.texto, 3000),
  // passa a ser:
  conteudoAtual: aula.texto,
  ```

## 2. Verificação manual

- [ ] 2.1 Executar um ciclo de melhorias em uma aula longa (>3.000 caracteres) e confirmar que o conteúdo completo da aula é processado e melhorado — sem partes omitidas
- [ ] 2.2 Confirmar que o ciclo completo (todas as aulas) termina sem erro de rate limit após a remoção do truncamento
