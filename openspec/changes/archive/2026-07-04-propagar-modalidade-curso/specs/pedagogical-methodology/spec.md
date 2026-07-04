## MODIFIED Requirements

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

## ADDED Requirements

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
