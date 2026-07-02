## 1. Servidor: seletor nativo de pasta

- [x] 1.1 Em `server.js`, implementar `escolherPastaWindows()` usando `child_process.execFile('powershell.exe', ...)` com script `-STA` que abre `System.Windows.Forms.FolderBrowserDialog` e retorna o caminho escolhido (ou vazio se cancelado).
- [x] 1.2 Criar endpoint `GET /api/escolher-pasta` que chama `escolherPastaWindows()` e responde `{ pasta: caminho | null }`; em caso de erro/timeout, responder com `{ error: mensagem }` sem travar a requisição (definir um `timeout` razoável no `execFile`).

## 2. Servidor: carregar projeto por caminho de pasta

- [x] 2.1 Em `server.js`, alterar `POST /api/carregar-projeto` (~linhas 1023-1099) para receber `{ pasta }` em vez de `{ slug }`; validar que `pasta` foi informada (400 se não) e que o diretório existe (404 se não).
- [x] 2.2 Remover a resolução de `baseDir` via `saídas/index.json` (mantida apenas se `remove-projects-index-json` ainda não tiver sido aplicado — nesse caso, ignorar/pular essa lógica sem quebrar, já que `pasta` agora vem direto do cliente).
- [x] 2.3 Definir `sess.config.pastaProjeto = pasta` incondicionalmente após carregar (mesmo que `projeto.json.config.pastaProjeto` tenha outro valor ou esteja vazio).
- [x] 2.4 Implementar `listarArquivosDoProjeto(baseDir)`: escaneia `.docx` na raiz e `.txt` em `baseDir/scr`, mapeando para rótulos conhecidos (ementa, pesquisa, plano_de_ensino, plano_de_aula, revisao_qualidade, aula{NN}_conteudo, etc.) a partir dos nomes de arquivo reais encontrados.
- [x] 2.5 Incluir `arquivos` (resultado de `listarArquivosDoProjeto`) na resposta de `POST /api/carregar-projeto`.

## 3. Servidor: pastaProjeto obrigatória

- [x] 3.1 Em `POST /api/config` (~linhas 466-524), adicionar validação: se `pastaProjeto` estiver vazia/ausente, retornar 400 com mensagem clara, no mesmo padrão das validações existentes de `modalidade`/`proporcaoTeoricoPratico`.

## 4. Cliente: Etapa 0 — botão de seleção de pasta

- [x] 4.1 Em `public/index.html`, substituir a listagem automática (`#listaProjetos`) no card "Abrir Projeto Existente" (~linhas 41-51) por um botão único "Selecionar pasta do projeto".
- [x] 4.2 Em `public/app.js`, remover/substituir `carregarListaProjetos()` (~linhas 719-739): o botão chama `GET /api/escolher-pasta`; se `pasta` vier preenchida, chama `POST /api/carregar-projeto` com `{ pasta }`.
- [x] 4.3 Adaptar `selecionarProjeto()` (renomear/ajustar conforme necessário) para tratar a resposta com `arquivos` e renderizar pequenos cards (um por arquivo/etapa encontrada: Ementa, Plano de Ensino, Plano de Aula, Aula 01, Aula 02, etc.), reaproveitando o banner e o preenchimento de campos da Etapa 1 já existentes.
- [x] 4.4 Tratar erro do seletor nativo (endpoint retorna `{ error }`): exibir mensagem ao usuário sem travar a interface.

## 5. Cliente: Etapa 1 — pastaProjeto obrigatória + botão Procurar

- [x] 5.1 Em `public/index.html`, adicionar `required` ao input `#pastaProjeto` (~linhas 180-188), remover "(opcional)" do label, ajustar o texto de ajuda.
- [x] 5.2 Adicionar um botão "Procurar..." ao lado do campo `#pastaProjeto`.
- [x] 5.3 Em `public/app.js`, o botão "Procurar..." chama `GET /api/escolher-pasta` e, se uma pasta for escolhida, preenche `#pastaProjeto.value` com o caminho retornado.

## 6. Validação manual

- [x] 6.1 Validado o mecanismo por trás do botão: chamei `POST /api/carregar-projeto` diretamente com um caminho real (`saídas/Python_para_Iniciantes`, que tem `scr/projeto.json`) — a resposta trouxe `arquivos` corretos (Ementa, Pesquisa Web, Plano de Ensino, Plano de Aula) e `config.pastaProjeto` igual ao caminho informado. **Não cliquei no botão real nem interagi com o diálogo nativo do Windows** — abrir esse diálogo de verdade dispara uma janela visível na tela do usuário que eu não tenho como fechar/confirmar programaticamente; fica pendente uma confirmação visual sua.
- [x] 6.2 Testado via `POST /api/carregar-projeto` apontando para `saídas/curso` (pasta sem `scr/projeto.json`, só `.txt` soltos): retornou `camposFaltantes: ["bncc","metodologia","aulas"]`, `nome` inferido do nome da pasta, `pastaProjeto` corretamente definida como o caminho informado, e `arquivos` com os 2 `.txt` encontrados.
- [x] 6.3 Validado no servidor: teste automatizado (`npm test`) confirma 400 quando `pastaProjeto` está ausente; confirmado manualmente também com `POST /api/config` sem o campo. O bloqueio client-side via `required` é padrão HTML5 (não testado num navegador real nesta sessão — sem extensão Chrome conectada).
- [x] 6.4 Código implementado e revisado (mesmo helper `escolherPasta()` usado nos dois botões); não testado com clique real pelo mesmo motivo do item 6.1.
- [x] 6.5 Ambos os handlers (`btnSelecionarPastaProjeto` e `btnProcurarPastaProjeto`) só agem `if (pasta)` — cancelar (retorno `null`) não dispara nenhuma requisição adicional, verificado por revisão de código; não testado com cancelamento real do diálogo.
- [x] 6.6 `npm test`: 33/33 passando. Atualizei `VALID_CONFIG` em `tests/integration/api.test.js` e `sse.test.js` para incluir `pastaProjeto` (usando uma pasta em `os.tmpdir()`), e adicionei um novo teste "sem pastaProjeto retorna 400" em `api.test.js`.
