## 1. Aumentar max_tokens no call de web search (server.js)

- [x] 1.1 Em `streamSkillToClient` (~linha 789), adicionar `max_tokens: 16000` no objeto passado a `openai.chat.completions.create` quando `skill.web_search_options` está definido:
  ```js
  const completion = await openai.chat.completions.create({
    model: skill.model,
    web_search_options: skill.web_search_options,
    max_tokens: 16000,   // ← adicionar esta linha
    messages: [
      { role: 'system', content: skill.system },
      { role: 'user', content: skill.user }
    ]
  });
  ```

## 2. Detectar truncamento e emitir aviso SSE (server.js)

- [x] 2.1 Após obter `completion` (~linha 797), verificar `finish_reason` e emitir warning antes de simular o streaming:
  ```js
  const finishReason = completion.choices[0]?.finish_reason;
  const text = completion.choices[0]?.message?.content?.trim() || '';
  if (finishReason === 'length') {
    console.warn(`[web-search] resposta truncada (${text.length} chars, finish_reason=length)`);
    send(res, { type: 'warning', text: 'Resposta truncada pelo limite de tokens. O conteúdo gerado pode estar incompleto — revise o arquivo gerado.' });
  }
  ```

## 3. Exibir aviso de truncamento no frontend (public/app.js)

- [x] 3.1 No handler de eventos SSE (onde os eventos `{ type: 'token' }`, `{ type: 'progress' }` etc. são tratados), adicionar tratamento para `type === 'warning'`:
  ```js
  if (data.type === 'warning') {
    // exibir banner âmbar com data.text abaixo do painel de progresso
  }
  ```
  Usar o mesmo padrão visual já existente para alertas (banner com fundo âmbar, ícone ⚠️, texto da mensagem). O banner deve permanecer visível após o término do SSE.

## 4. Verificação manual

- [ ] 4.1 Executar um ciclo de melhorias em uma aula longa (como a Aula 9 do CapCut Básico) e confirmar que o `.docx` gerado não está mais truncado — a seção "Melhorias Aplicadas" deve aparecer completa
- [ ] 4.2 Confirmar que aulas curtas continuam funcionando normalmente sem nenhum banner de aviso
- [ ] 4.3 Simular `finish_reason === 'length'` (temporariamente reduzir `max_tokens` para um valor baixo como 100) e confirmar que o banner âmbar aparece no frontend e o `console.warn` é registrado no terminal
