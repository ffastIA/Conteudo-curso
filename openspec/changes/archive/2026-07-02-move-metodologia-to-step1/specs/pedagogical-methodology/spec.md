## REMOVED Requirements

### Requirement: Derivação automática de metodologia pedagógica na Etapa 0
**Reason:** A Etapa 0 deixou de conter qualquer lógica de metodologia — passou a servir apenas para abrir um projeto existente ou definir o alinhamento à BNCC. A derivação da metodologia foi movida para o final da Etapa 1, quando o perfil do curso (nome, público, carga, nível, proporção teórico/prático) já foi de fato preenchido e salvo, eliminando a dependência incoerente de dados de uma etapa posterior sendo usados numa etapa anterior.
**Migration:** Ver o novo requisito "Geração da metodologia pedagógica ao final da Etapa 1" nesta mesma capability.

## ADDED Requirements

### Requirement: Geração da metodologia pedagógica ao final da Etapa 1
O sistema SHALL oferecer a geração da metodologia pedagógica como a última ação da Etapa 1 (Configuração), acionada pelo botão "Gerar Metodologia", que primeiro salva a configuração do curso (`POST /api/config`) e em seguida deriva a metodologia via `metodologiaSkill` (gpt-4o-mini) com base no perfil recém-salvo. O resultado SHALL ser exibido para revisão antes de qualquer avanço para a Etapa 2.

#### Scenario: Geração ao final da Etapa 1
- **WHEN** o usuário preenche o formulário da Etapa 1 e clica em "Gerar Metodologia"
- **THEN** o sistema salva a configuração via `POST /api/config`
- **THEN** o sistema chama `metodologiaSkill` com os dados já salvos e armazena o resultado em `sess.metodologia`
- **THEN** o resultado é exibido num card ao final da Etapa 1, sem navegar para a Etapa 2

#### Scenario: Gerar novamente reflete os campos atuais do formulário
- **WHEN** o usuário altera algum campo do formulário da Etapa 1 e clica em "↺ Gerar novamente"
- **THEN** o sistema resubmete a configuração atual e gera uma nova metodologia com base nela

### Requirement: Metodologia exportável, editável e reimportável
A metodologia pedagógica SHALL seguir o mesmo padrão de export/import já usado pelas demais etapas do pipeline (ementa, pesquisa, plano de ensino, plano de aula, revisão de qualidade): exportável como `.docx`, editável externamente, e reimportável para substituir a versão em `sess.metodologia`.

#### Scenario: Exportar metodologia gerada
- **WHEN** o usuário clica em "Exportar .docx" no card de metodologia
- **THEN** o sistema salva `{nome-do-curso}_metodologia.docx` na pasta do projeto, seguindo o mesmo comportamento de `POST /api/export/:step` das demais etapas

#### Scenario: Reimportar metodologia editada
- **WHEN** o usuário edita o `.docx` exportado e o reimporta via "Importar versão editada"
- **THEN** o sistema detecta o stage `metodologia` automaticamente (pelo nome do arquivo, igual às demais etapas fixas)
- **THEN** `sess.metodologia` é atualizada com o texto reimportado, e o card exibe o badge "✏️ Versão do usuário"

### Requirement: Confirmação explícita da metodologia definitiva
O sistema SHALL exigir uma ação explícita de confirmação — botão "💾 Salvar e ir para Etapa 2" — antes de considerar `sess.metodologia` definitiva para as etapas seguintes. Ao confirmar, o sistema SHALL: gerar a ementa (se ainda não gerada ou se campos pedagógicos mudaram desde a última geração) usando a metodologia definitiva, persistir a metodologia em disco (`.txt` em `/scr`, `.docx` na raiz, mesmo padrão de `persistStage` das demais etapas), e só então permitir o avanço para a Etapa 2.

#### Scenario: Confirmação persiste a metodologia em disco
- **WHEN** o usuário clica em "Salvar e ir para Etapa 2" com uma metodologia gerada (ou reimportada) presente
- **THEN** o sistema grava `metodologia.txt` em `/scr` e `metodologia.docx` na raiz da pasta do projeto
- **THEN** o sistema avança para a Etapa 2

#### Scenario: Confirmação sem metodologia gerada é rejeitada
- **WHEN** o usuário tenta confirmar sem nunca ter gerado (ou importado) uma metodologia
- **THEN** o sistema retorna erro e não avança para a Etapa 2

#### Scenario: Metodologia reimportada é a versão usada na confirmação
- **WHEN** o usuário gera uma metodologia por IA, depois a exporta, edita e reimporta uma versão diferente, e então confirma
- **THEN** a versão reimportada (não a original gerada por IA) é a que fica definitiva e persistida
