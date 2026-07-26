## Purpose

Gerar, revisar e confirmar a metodologia pedagógica do curso ao final da
Etapa 1, garantindo que ela seja compatível com a modalidade escolhida e
injetada como contexto pedagógico em todas as skills de geração
subsequentes.

## Requirements

### Requirement: Geração da metodologia pedagógica ao final da Etapa 1
O sistema SHALL oferecer a geração da metodologia pedagógica como a última ação da Etapa 1 (Configuração), acionada pelo botão "Gerar Metodologia", que primeiro salva a configuração do curso (`POST /api/config`) e em seguida deriva a metodologia via `metodologiaSkill` (gpt-4o-mini) com base no perfil recém-salvo, **incluindo a modalidade do curso**. O prompt da `metodologiaSkill` SHALL conter a modalidade e a instrução explícita de que a metodologia recomendada DEVE ser compatível e operacionalizável na modalidade escolhida. O resultado SHALL ser exibido para revisão antes de qualquer avanço para a Etapa 2.

#### Scenario: Geração ao final da Etapa 1
- **WHEN** o usuário preenche o formulário da Etapa 1 e clica em "Gerar Metodologia"
- **THEN** o sistema salva a configuração via `POST /api/config`
- **THEN** o sistema chama `metodologiaSkill` com os dados já salvos e armazena o resultado em `sess.metodologia`
- **THEN** o resultado é exibido num card ao final da Etapa 1, sem navegar para a Etapa 2

#### Scenario: Gerar novamente reflete os campos atuais do formulário
- **WHEN** o usuário altera algum campo do formulário da Etapa 1 e clica em "↺ Gerar novamente"
- **THEN** o sistema resubmete a configuração atual e gera uma nova metodologia com base nela

#### Scenario: Metodologia compatível com a modalidade EaD
- **WHEN** o usuário gera a metodologia para um curso com `modalidade: "EaD"`
- **THEN** o prompt enviado à `metodologiaSkill` contém `Modalidade: EaD` e a instrução de compatibilidade obrigatória, e a metodologia recomendada é operacionalizável a distância (sem depender de dinâmicas exclusivamente presenciais)

---

### Requirement: Metodologia exportável, editável e reimportável
A metodologia pedagógica SHALL seguir o mesmo padrão de export/import já usado pelas demais etapas do pipeline (ementa, pesquisa, plano de ensino, plano de aula, revisão de qualidade): exportável como `.docx`, editável externamente, e reimportável para substituir a versão em `sess.metodologia`.

#### Scenario: Exportar metodologia gerada
- **WHEN** o usuário clica em "Exportar .docx" no card de metodologia
- **THEN** o sistema salva `{nome-do-curso}_metodologia.docx` na pasta do projeto, seguindo o mesmo comportamento de `POST /api/export/:step` das demais etapas

#### Scenario: Reimportar metodologia editada
- **WHEN** o usuário edita o `.docx` exportado e o reimporta via "Importar versão editada"
- **THEN** o sistema detecta o stage `metodologia` automaticamente (pelo nome do arquivo, igual às demais etapas fixas)
- **THEN** `sess.metodologia` é atualizada com o texto reimportado, e o card exibe o badge "✏️ Versão do usuário"

---

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

---

### Requirement: Metodologias pedagógicas consideradas pelo modelo
O prompt da `metodologiaSkill` SHALL instruir o modelo a selecionar e justificar a metodologia mais adequada dentre: Aprendizagem Baseada em Problemas (ABP), Instrução Direta, Sala de Aula Invertida, Andragogia, Aprendizagem por Projetos, Ensino Híbrido — usando a Taxonomia de Bloom como estrutura de objetivos de aprendizagem.

#### Scenario: Curso técnico para adultos com carga alta
- **WHEN** o perfil indica público adulto profissional, nível avançado e carga ≥ 40h
- **THEN** o modelo prioriza Andragogia ou ABP com justificativa baseada no perfil

#### Scenario: Curso introdutório para jovens com carga baixa
- **WHEN** o perfil indica público jovem, nível básico e carga ≤ 20h
- **THEN** o modelo prioriza Instrução Direta ou Sala Invertida com justificativa adequada ao perfil

---

### Requirement: Contexto pedagógico injetado em todas as skills de geração
O sistema SHALL passar `session.metodologia` como parâmetro `metodologia` para todas as skills existentes que geram conteúdo: `ementaSkill`, `planoEnsinoSkill`, `planoAulaSkill`, `conteudoSkill`, `expansaoConteudoSkill`. O bloco de contexto pedagógico SHALL incluir também a modalidade do curso (`sess.config.modalidade`) e as diretrizes de modalidade correspondentes (mapa `MODALIDADE_DIRETRIZES`), com a regra de precedência: em caso de conflito, a Metodologia Pedagógica definida prevalece sobre as diretrizes genéricas de modalidade.

#### Scenario: Skill recebe contexto de metodologia
- **WHEN** qualquer skill de geração é chamada e `session.metodologia` está preenchida
- **THEN** o prompt inclui bloco `## Metodologia Pedagógica` com a metodologia e instruções para o modelo observar e justificar as boas práticas didáticas correspondentes ao longo do conteúdo gerado

#### Scenario: Skill chamada sem metodologia definida
- **WHEN** `session.metodologia` está vazia ou nula
- **THEN** a skill se comporta exatamente como antes desta change, sem alteração de prompt

#### Scenario: Bloco de modalidade presente no contexto pedagógico
- **WHEN** qualquer skill de geração é chamada e `sess.config.modalidade` está preenchida com valor reconhecido (`presencial`, `EaD` ou `híbrido`)
- **THEN** o prompt inclui bloco `## Modalidade do Curso` com a modalidade, as diretrizes correspondentes de `MODALIDADE_DIRETRIZES` e a regra de precedência da metodologia

#### Scenario: Modalidade ausente ou não reconhecida (projeto legado)
- **WHEN** `sess.config.modalidade` está ausente ou contém valor fora do enum
- **THEN** o bloco de modalidade é omitido e o prompt permanece como antes desta change, sem erro

#### Scenario: Pesquisa web direcionada pela modalidade
- **WHEN** `pesquisaWebSkill` ou `pesquisaFallbackSkill` é chamada para um curso EaD
- **THEN** o prompt de pesquisa contém a modalidade, orientando a busca a considerar recursos e práticas compatíveis (ex.: AVAs, atividades assíncronas)

---

### Requirement: Proporção teórico/prático refletida no conteúdo gerado
O sistema SHALL incluir a proporção teórico/prático definida na Etapa 1 como restrição explícita nos prompts de `planoAulaSkill` e `conteudoSkill`, garantindo que o balanceamento seja observado na estrutura de cada aula.

#### Scenario: Proporção 70/30 definida
- **WHEN** `session.config.proporcaoTeoricoPratico = "70% teoria / 30% prática"` e `planoAulaSkill` é chamada
- **THEN** o prompt instrui o modelo a estruturar cada aula respeitando aproximadamente essa proporção, com atividades práticas claramente identificadas

---

### Requirement: Fallback de leitura em disco para a metodologia nas etapas geradoras
Todos os endpoints geradores que consomem a metodologia SHALL aplicar o padrão `sess.metodologia || readMemory(sess, 'metodologia')`, espelhando o fallback já existente para ementa e planos, de modo que a metodologia (inclusive versão editada e reimportada pelo usuário) esteja garantidamente disponível mesmo após perda da sessão in-memory.

#### Scenario: Sessão perdida após restart do servidor
- **WHEN** o servidor é reiniciado (sessão in-memory vazia), o projeto possui `scr/metodologia.txt` gravado e o usuário dispara a geração de uma etapa (ex.: plano de ensino) sem recarregar o projeto
- **THEN** o endpoint lê a metodologia do disco via `readMemory` e o prompt da skill contém o bloco `## Metodologia Pedagógica` com o texto persistido

#### Scenario: Metodologia editada propagada após reimportação
- **WHEN** o usuário reimporta uma metodologia editada (capability `stage-import`) e em seguida gera qualquer etapa subsequente
- **THEN** o texto usado no prompt é a versão editada (da sessão ou do disco), nunca a versão original da IA

#### Scenario: Projeto sem metodologia persistida
- **WHEN** não há `sess.metodologia` nem `scr/metodologia.txt`
- **THEN** o comportamento atual é mantido (geração sem bloco de metodologia), sem erro
