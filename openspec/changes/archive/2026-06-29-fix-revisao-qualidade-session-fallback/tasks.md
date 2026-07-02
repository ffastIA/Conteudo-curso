## 1. Implementação

- [x] 1.1 Em `server.js`, no handler `GET /api/revisao-qualidade`, inserir `restoreConteudoPorAula(sess);` imediatamente antes da linha `if (!sess.conteudoPorAula?.length)`

## 2. Verificação manual

- [ ] 2.1 Com projeto carregado normalmente (sessão populada): clicar "Revisão de Qualidade" e confirmar que o streaming inicia sem erro
- [ ] 2.2 Reiniciar o servidor com projeto existente em disco: clicar "Revisão de Qualidade" sem recarregar o projeto e confirmar que a sessão é restaurada automaticamente e o streaming inicia
- [ ] 2.3 Acessar com sessão totalmente vazia (sem projeto em disco): confirmar que a mensagem "Conclua a Etapa 5 antes de gerar a revisão de qualidade." é retornada ao frontend (não "Erro de conexão")
