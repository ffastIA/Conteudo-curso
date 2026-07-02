## 1. Pré-requisito

- [x] 1.1 Confirmar que o change `add-load-project-by-folder` já foi implementado (ou está sendo implementado nesta mesma sessão), já que este change remove o mecanismo que ele substitui.

## 2. Servidor: remover escrita do índice

- [x] 2.1 Em `server.js`, dentro de `saveProject()` (~linhas 209-249), remover o bloco que lê/atualiza `saídas/index.json` (~linhas 237-248).

## 3. Servidor: remover leitura do índice

- [x] 3.1 Remover o endpoint `GET /api/projetos` (~linhas 954-1000) por completo.
- [x] 3.2 Confirmado: já não havia resolução via `saídas/index.json` em `POST /api/carregar-projeto` — o change `add-load-project-by-folder` já tinha reescrito o endpoint para receber `{ pasta }` diretamente. Apenas corrigi um comentário desatualizado (`server.js`) que ainda mencionava o índice.

## 4. Cliente: remover listagem automática

- [x] 4.1 Confirmado: `carregarListaProjetos()` e `#listaProjetos` já não existiam em `public/app.js`/`public/index.html` — já removidos/substituídos pelo `add-load-project-by-folder`.
- [x] 4.2 Confirmado por busca no código: `#cardProjetos` continua existindo, agora contendo apenas o botão de seleção de pasta (sem nenhuma dependência da listagem automática removida).

## 5. Limpeza de dado e validação

- [x] 5.1 Arquivo `saídas/index.json` apagado do disco.
- [x] 5.2 Testado via curl contra o servidor real: carreguei o projeto real "Capcut - Crie seus videos para redes sociais" pelo caminho externo configurado (`POST /api/carregar-projeto` com `{ pasta }`) — as 19 aulas, ementa, metodologia, pesquisa, plano de ensino/aula e revisão de qualidade foram restauradas corretamente, com o índice já removido do disco.
- [x] 5.3 `grep -rn "index.json" server.js public/app.js` retornou vazio — nenhuma referência restante.
- [x] 5.4 `npm test`: 33/33 passando, sem necessidade de ajustar nenhum teste (nenhum dependia de `GET /api/projetos` ou do índice).
