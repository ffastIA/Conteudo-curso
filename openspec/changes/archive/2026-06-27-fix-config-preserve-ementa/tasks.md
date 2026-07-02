## 1. Implementação

- [x] 1.1 Em `server.js`, no handler `POST /api/config`, adicionar antes de `sess.config = req.body` a comparação dos campos pedagógicos: `const camposConteudo = ['nome','publico','carga','duracao','nivel','objetivos']; const conteudoMudou = camposConteudo.some(k => (req.body[k]||'') !== (sess.config[k]||''));`
- [x] 1.2 Envolver o bloco de geração da ementa em `if (!sess.ementa || conteudoMudou) { ... }`, preservando o bloco `try/catch` e o `persistStage` internamente

## 2. Verificação manual

- [ ] 2.1 Com projeto já configurado (ementa existente): submeter Etapa 1 alterando apenas `pastaProjeto` e confirmar que a ementa não é regerada (sem chamada à OpenAI, resposta imediata)
- [ ] 2.2 Com projeto já configurado: submeter Etapa 1 alterando o campo `nome` e confirmar que a ementa É regenerada
- [ ] 2.3 Projeto novo (sem ementa): submeter Etapa 1 e confirmar que a ementa é gerada normalmente
