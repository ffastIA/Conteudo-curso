## ADDED Requirements

### Requirement: Upload do documento de revisão anotado
O sistema SHALL aceitar o upload de um arquivo `.docx` contendo o relatório de revisão anotado pelo revisor humano. O arquivo SHALL ser enviado via `multipart/form-data` ao endpoint `POST /api/aplicar-melhorias`. O sistema SHALL extrair o texto do `.docx` e apresentar ao usuário um resumo das anotações detectadas antes de aplicar qualquer alteração.

#### Scenario: Upload bem-sucedido
- **WHEN** o usuário envia um arquivo `.docx` válido via upload
- **THEN** o sistema extrai o texto do arquivo e identifica as seções "Observações do Revisor" de cada aula
- **THEN** o sistema exibe no frontend o número de aulas com observações e aguarda confirmação do usuário

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
Após o upload, o sistema SHALL exibir ao usuário um resumo das observações encontradas e aguardar confirmação explícita antes de iniciar o processamento. Somente após a confirmação o sistema SHALL revisar cada aula individualmente, aplicando as melhorias indicadas nas observações e acessando a web quando necessário para complementação de conteúdo.

#### Scenario: Confirmação e início do processamento
- **WHEN** o usuário clica "Aplicar Melhorias" após visualizar o resumo
- **THEN** o sistema inicia SSE streaming processando cada aula em sequência
- **THEN** para cada aula é emitido evento `progress` com o número e título da aula sendo processada

#### Scenario: Recusa após upload
- **WHEN** o usuário visualiza o resumo e decide não confirmar
- **THEN** nenhuma alteração é aplicada ao conteúdo existente
- **THEN** o usuário pode fazer novo upload ou retornar à Etapa 5★

#### Scenario: Acesso à web durante aplicação
- **WHEN** as observações do revisor ou as sugestões do relatório indicam necessidade de aprofundamento técnico
- **THEN** a `aplicarMelhoriasSkill` usa `gpt-4o-search-preview` com `web_search_options` para buscar referências atualizadas
- **THEN** as fontes consultadas são incluídas no conteúdo revisado da aula correspondente

---

### Requirement: Ciclo iterativo de revisão
O sistema SHALL permitir que o usuário execute o ciclo Etapa 5★ → Etapa 6 quantas vezes considerar necessário. Após cada aplicação de melhorias, a Etapa 5★ SHALL estar disponível para gerar um novo relatório sobre o conteúdo atualizado. O ciclo SHALL ser interrompido apenas quando o usuário acionar explicitamente a conclusão.

#### Scenario: Início de novo ciclo após aplicação
- **WHEN** o stream de aplicação de melhorias conclui com evento `done`
- **THEN** o frontend exibe o botão "Gerar Nova Revisão" (Etapa 5★) habilitado
- **THEN** o usuário pode executar nova revisão sobre o conteúdo recém-aplicado

#### Scenario: Múltiplas iterações
- **WHEN** o usuário executa o ciclo N vezes consecutivas
- **THEN** cada iteração sobrescreve `sess.conteudoPorAula` e `sess.conteudo` com o conteúdo mais recente
- **THEN** os arquivos `aula{NN}_conteudo.txt` em disco são atualizados a cada iteração

---

### Requirement: Geração do documento final consolidado
Quando o usuário indicar que o conteúdo está concluído, o sistema SHALL gerar um único arquivo `.docx` consolidado contendo o conteúdo revisado de todas as aulas em sequência, com formatação padrão do sistema (capa, cabeçalho, rodapé, numeração de páginas).

#### Scenario: Acionamento da conclusão
- **WHEN** o usuário clica "Conteúdo Concluído" na Etapa 6
- **THEN** o sistema chama `POST /api/finalizar-conteudo`
- **THEN** é gerado `conteudo_final.docx` com todas as aulas consolidadas em sequência
- **THEN** o arquivo é disponibilizado para download e gravado em `saídas/{curso-slug}/conteudo_final.docx`
- **THEN** `sess.conteudoFinal` é populado com o texto consolidado

#### Scenario: Conclusão sem nenhum ciclo de melhoria
- **WHEN** o usuário clica "Conteúdo Concluído" sem ter executado nenhum ciclo de melhoria
- **THEN** o sistema gera o `.docx` final a partir do conteúdo da Etapa 5 sem modificações
- **THEN** o arquivo é nomeado `conteudo_final.docx` e disponibilizado para download
