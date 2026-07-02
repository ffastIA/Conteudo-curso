## 1. Servidor: persistir pastaProjeto imediatamente

- [x] 1.1 Em `server.js`, no endpoint `POST /api/config` (~linha 468, antes de qualquer atribuição a `sess.config`), capturar `const pastaProjetoAnterior = (sess.config.pastaProjeto || '').trim();`.
- [x] 1.2 Após `sess.config = req.body` (~linha 491), adicionar `if ((pastaProjeto || '').trim() !== pastaProjetoAnterior) { saveProject(sess); }`, antes do bloco de geração de ementa (~linha 495).
- [x] 1.3 Confirmado: `saveProject` (server.js:209-249) não precisou de nenhuma alteração — já aceita ser chamada sem `stageInfo` e já grava `projeto.json`/`saídas/index.json` a partir de `sess.config` atual.

## 2. Validação manual

- [x] 2.1 Não testado com uma chamada real separada (evitar gasto extra de tokens numa regeneração de ementa) — coberto por raciocínio de código: para um curso novo, `pastaProjetoAnterior` é sempre `''`, então a mesma condição validada na task 2.2 (`saveProject` disparado quando o valor muda) se aplica igualmente à primeira configuração.
- [x] 2.2 Testado via curl contra o servidor real (sessão `/api/dev/seed`, curso "Python para Iniciantes" já com ementa): reenviei a Etapa 1 com os mesmos campos pedagógicos e uma nova `pastaProjeto`. Confirmado: a resposta trouxe a ementa **idêntica** à original (texto igual ao seed, byte a byte — ou seja, NÃO foi regenerada), e `saídas/index.json` + o `projeto.json` na nova pasta foram atualizados imediatamente com o novo caminho.
- [x] 2.3 Simulei perda de sessão usando um cookie jar novo (sessão em memória equivalente a uma sessão nunca vista) e chamei `POST /api/carregar-projeto` para o mesmo curso — a resposta trouxe `config.pastaProjeto` já apontando para o caminho novo corretamente restaurado.
- [x] 2.4 Nessa mesma sessão "recarregada", gerei conteúdo real de aula via `GET /api/conteudo` — `aula01_conteudo.docx` e `aula02_conteudo.docx` apareceram na pasta configurada (confirmado por listagem de diretório), e nenhum arquivo novo apareceu em `saídas/Python_para_Iniciantes/` durante o teste. Restaurei a `pastaProjeto` do curso de teste para vazio ao final e removi os arquivos temporários gerados.
- [x] 2.5 `npm test` executado após a mudança: 32/32 testes passando, sem regressão.
