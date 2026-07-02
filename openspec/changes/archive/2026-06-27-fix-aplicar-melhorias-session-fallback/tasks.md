## 1. Implementação do helper de restauração

- [x] 1.1 Em `server.js`, adicionar a função `restoreConteudoPorAula(sess)` após a função `readMemory` — a função tenta popular `sess.conteudoPorAula` em cascata: a partir de `sess.aulas` (se disponível) ou relendo `projeto.json` do disco se `sess.aulas` estiver vazio mas `sess.config.nome` permitir localizar o projeto

## 2. Fix no handler de upload (POST /api/aplicar-melhorias)

- [x] 2.1 Em `server.js`, chamar `restoreConteudoPorAula(sess)` no início do handler `POST /api/aplicar-melhorias`, antes do `try` que processa o `.docx`
- [x] 2.2 Adicionar guard após a chamada: se `sess.conteudoPorAula` seguir vazio, retornar HTTP 400 com `{ error: 'Carregue o projeto antes de aplicar melhorias.' }`

## 3. Fix no handler de confirmação (GET /api/aplicar-melhorias/confirmar)

- [x] 3.1 Em `server.js`, chamar `restoreConteudoPorAula(sess)` no início do handler `GET /api/aplicar-melhorias/confirmar`, antes do `sseHeaders(res)`
- [x] 3.2 Verificar que o guard de erro 400 já existente (`!sess.conteudoPorAula?.length`) continua funcionando corretamente após a tentativa de restauração

## 4. Verificação manual

- [x] 4.1 Iniciar o servidor, gerar um projeto com conteúdo até a Etapa 5★, reiniciar o servidor (simulando perda de sessão) e verificar que o upload do `.docx` na Etapa 6 retorna o número correto de aulas e observações detectadas
- [x] 4.2 Confirmar a aplicação de melhorias após a restauração e verificar que os arquivos `aula{NN}_conteudo.txt` são atualizados em disco
- [x] 4.3 Testar o cenário de erro: fazer upload sem nenhum projeto configurado na sessão e verificar que o erro 400 é exibido corretamente no frontend
