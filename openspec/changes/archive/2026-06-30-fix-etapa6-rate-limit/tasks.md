## 1. Configurar retry no cliente OpenAI (server.js)

- [x] 1.1 Em `server.js:23`, alterar a inicialização do cliente OpenAI adicionando `maxRetries: 6`:
  ```js
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 6 });
  ```

## 2. Truncar conteúdo da aula no prompt (server.js)

- [x] 2.1 Em `server.js` no handler `GET /api/aplicar-melhorias/confirmar`, alterar a chamada a `aplicarMelhoriasSkill` para truncar `conteudoAtual`:
  ```js
  conteudoAtual: truncate(aula.texto, 3000),
  ```
  (estava `conteudoAtual: aula.texto`)

## 3. Pausa entre aulas (server.js)

- [x] 3.1 No loop de processamento de aulas em `GET /api/aplicar-melhorias/confirmar`, adicionar pausa de 4 segundos antes de cada aula exceto a primeira:
  ```js
  if (i > 0) await new Promise(r => setTimeout(r, 4000));
  ```
  Inserir imediatamente antes do `send(res, { type: 'progress', message: ... })` de início de aula.

## 4. Verificação manual

- [ ] 4.1 Reiniciar o servidor e executar um ciclo completo de aplicação de melhorias em um curso com várias aulas — confirmar que o ciclo termina sem erro de rate limit
- [ ] 4.2 Verificar no log do servidor que o delay entre aulas aparece no tempo de processamento (cada aula deve iniciar ~4s após a conclusão da anterior)
