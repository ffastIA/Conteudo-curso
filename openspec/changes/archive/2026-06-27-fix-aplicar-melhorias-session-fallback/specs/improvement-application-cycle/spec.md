## MODIFIED Requirements

### Requirement: Upload do documento de revisão anotado
O sistema SHALL aceitar o upload de um arquivo `.docx` contendo o relatório de revisão anotado pelo revisor humano. O arquivo SHALL ser enviado via `multipart/form-data` ao endpoint `POST /api/aplicar-melhorias`. O sistema SHALL extrair o texto do `.docx` e apresentar ao usuário um resumo das anotações detectadas antes de aplicar qualquer alteração. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de processar o arquivo, caso a sessão em memória esteja vazia.

#### Scenario: Upload bem-sucedido
- **WHEN** o usuário envia um arquivo `.docx` válido via upload
- **THEN** o sistema extrai o texto do arquivo e identifica as seções "Observações do Revisor" de cada aula
- **THEN** o sistema exibe no frontend o número de aulas com observações e aguarda confirmação do usuário

#### Scenario: Upload com sessão vazia recuperada do disco
- **WHEN** o usuário envia um arquivo `.docx` válido mas `sess.conteudoPorAula` está vazio
- **THEN** o sistema restaura `conteudoPorAula` a partir do disco antes de processar o arquivo
- **THEN** o processamento prossegue normalmente, identificando as observações por aula
- **THEN** a resposta retorna o número correto de aulas e de aulas com observações

#### Scenario: Arquivo inválido ou ausente
- **WHEN** o usuário envia um arquivo que não é `.docx` ou o campo `arquivo` está ausente
- **THEN** o sistema retorna erro 400 com mensagem "Arquivo .docx inválido ou não enviado"
- **THEN** nenhuma alteração é aplicada ao conteúdo

#### Scenario: Nenhuma observação encontrada
- **WHEN** o `.docx` enviado não contém texto nas seções "Observações do Revisor"
- **THEN** o sistema avisa o usuário que nenhuma anotação foi detectada
- **THEN** o sistema ainda oferece a opção de aplicar apenas as sugestões automáticas do relatório original

---

### Requirement: Aplicação de melhorias por aula com confirmação
Após o upload, o sistema SHALL exibir ao usuário um resumo das observações encontradas e aguardar confirmação explícita antes de iniciar o processamento. Somente após a confirmação o sistema SHALL revisar cada aula individualmente, aplicando as melhorias indicadas nas observações e acessando a web quando necessário para complementação de conteúdo. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de iniciar o processamento, caso a sessão em memória esteja vazia.

#### Scenario: Confirmação e início do processamento
- **WHEN** o usuário clica "Aplicar Melhorias" após visualizar o resumo
- **THEN** o sistema inicia SSE streaming processando cada aula em sequência
- **THEN** para cada aula é emitido evento `progress` com o número e título da aula sendo processada

#### Scenario: Confirmação com sessão vazia recuperada do disco
- **WHEN** o usuário confirma a aplicação de melhorias mas `sess.conteudoPorAula` está vazio
- **THEN** o sistema restaura `conteudoPorAula` a partir do disco antes de iniciar o SSE
- **THEN** o processamento prossegue normalmente para cada aula

#### Scenario: Recusa após upload
- **WHEN** o usuário visualiza o resumo e decide não confirmar
- **THEN** nenhuma alteração é aplicada ao conteúdo existente
- **THEN** o usuário pode fazer novo upload ou retornar à Etapa 5★

#### Scenario: Acesso à web durante aplicação
- **WHEN** as observações do revisor ou as sugestões do relatório indicam necessidade de aprofundamento técnico
- **THEN** a `aplicarMelhoriasSkill` usa `gpt-4o-search-preview` com `web_search_options` para buscar referências atualizadas
- **THEN** as fontes consultadas são incluídas no conteúdo revisado da aula correspondente
