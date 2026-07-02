## MODIFIED Requirements

### Requirement: Geração do relatório de revisão de qualidade
O sistema SHALL gerar um relatório de revisão de qualidade para o conteúdo da Etapa 5, analisando cada aula individualmente contra os artefatos do curso (ementa, plano de ensino, plano de aula) e, quando BNCC ativo, contra as competências/habilidades selecionadas. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de validar a pré-condição, caso a sessão em memória esteja vazia. O relatório SHALL ser entregue via SSE streaming e persistido em disco.

#### Scenario: Geração com sessão populada normalmente
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` com `sess.conteudoPorAula` já preenchido
- **THEN** o sistema usa os dados da sessão diretamente e inicia o streaming
- **THEN** o comportamento é idêntico ao anterior ao fix

#### Scenario: Geração com sessão vazia recuperada do disco
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` e `sess.conteudoPorAula` está vazio (ex: após restart do servidor)
- **THEN** o sistema chama `restoreConteudoPorAula(sess)` antes de validar a pré-condição
- **THEN** se o projeto for encontrado em disco, a sessão é restaurada e o streaming inicia normalmente
- **THEN** nenhuma mensagem de erro é exibida ao usuário

#### Scenario: Pré-condição não satisfeita mesmo após tentativa de restauração
- **WHEN** `restoreConteudoPorAula(sess)` não encontra dados em disco (projeto não existe ou não foi gerado até a Etapa 5)
- **THEN** o sistema retorna HTTP 400 com `{ error: "Conclua a Etapa 5 antes de gerar a revisão de qualidade." }`

#### Scenario: Geração com BNCC inativo
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` com sessão que tem `bncc.ativo === false`
- **THEN** o sistema gera um relatório por aula cobrindo: compatibilidade com plano de aula, plano de ensino e ementa; adequação à faixa etária e perfil de público; sobreposições Jaccard; deficiências e sugestões
- **THEN** a seção "Alinhamento BNCC" é omitida do relatório

#### Scenario: Geração com BNCC ativo
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` com sessão que tem `bncc.ativo === true` e itens selecionados
- **THEN** o relatório inclui para cada aula uma seção "Alinhamento BNCC" avaliando competências/habilidades contempladas, parcialmente cobertas e ausentes
