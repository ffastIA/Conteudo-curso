## 1. Skill

- [x] 1.1 Em `skills.js`, adicionar o parâmetro opcional `correcao` a `planLessonsSkill`: quando presente, o prompt `user` inclui uma nota inicial informando a quantidade errada da tentativa anterior e a quantidade exata exigida.

## 2. Validação e retry em `planLessons`

- [x] 2.1 Em `server.js`, extrair a chamada à IA + parse do JSON de `planLessons()` para uma função interna reutilizável (`chamarSkill(correcao)`).
- [x] 2.2 Adicionar o parâmetro opcional `onProgress` (callback, default no-op) a `planLessons(sess, planoEnsinoOverride, onProgress)`.
- [x] 2.3 Após a primeira chamada, validar `aulas.length !== numAulas`; se divergente e `aulas.length > 0`, chamar `onProgress` com mensagem informativa, logar `console.warn`, e tentar novamente passando a quantidade errada como `correcao`.
- [x] 2.4 Escolher o resultado final como o mais próximo de `numAulas` entre as duas tentativas; logar `console.warn` adicional se a divergência persistir após o retry.

## 3. Propagação nos call sites

- [x] 3.1 Em `GET /api/plano-aula` (`server.js:838`), passar `msg => send(res, { type: 'progress', message: msg })` como `onProgress`.
- [x] 3.2 No fallback dentro de `GET /api/conteudo` (`server.js:1021`), passar o mesmo padrão de `onProgress`.

## 4. Validação

- [x] 4.1 Rodar `node -c server.js` para confirmar sintaxe.
- [x] 4.2 Testar com um curso real (via `/api/dev/seed` ou configuração equivalente) e confirmar que, no caso comum (IA acerta de primeira), o comportamento é idêntico ao atual, sem retry.
- [x] 4.3 Simular ou observar um caso de divergência (se reproduzível) e confirmar que a mensagem de progresso aparece, o retry ocorre, e o resultado final é o mais próximo de `numAulas`.
- [x] 4.4 Rodar `npm test` para garantir que nenhuma suíte existente quebrou.
