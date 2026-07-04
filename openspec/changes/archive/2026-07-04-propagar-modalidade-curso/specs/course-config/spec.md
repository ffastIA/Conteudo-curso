## ADDED Requirements

### Requirement: Campo condicional de distribuição híbrida
O modelo `CourseConfig` SHALL incluir o campo opcional `distribuicaoHibrida` (string, texto livre), que descreve como o curso híbrido divide momentos presenciais e a distância (ex.: "prática presencial, teoria a distância" ou "40% presencial / 60% EaD"). O formulário da Etapa 1 SHALL exibir esse campo somente quando `modalidade = "híbrido"`. O valor SHALL ser persistido em `projeto.json` e restaurado ao carregar o projeto, como os demais campos do `CourseConfig`.

#### Scenario: Campo exibido apenas para modalidade híbrida
- **WHEN** o usuário seleciona `modalidade: "híbrido"` no formulário da Etapa 1
- **THEN** o campo "Distribuição híbrida" torna-se visível; ao trocar para `presencial` ou `EaD`, o campo é ocultado e seu valor não é enviado

#### Scenario: Distribuição preenchida é respeitada na geração
- **WHEN** o usuário preenche `distribuicaoHibrida` e gera qualquer etapa do pipeline
- **THEN** o bloco `## Modalidade do Curso` do prompt inclui a distribuição informada com instrução de respeitá-la rigorosamente na organização de atividades presenciais e a distância

#### Scenario: Curso híbrido sem distribuição definida
- **WHEN** o usuário mantém `distribuicaoHibrida` vazio em um curso híbrido e gera uma etapa
- **THEN** o sistema aceita normalmente e as diretrizes de modalidade instruem o modelo a propor uma distribuição justificada (prática presencial, teoria a distância como padrão recomendado)

#### Scenario: Persistência e restauração
- **WHEN** o usuário salva a configuração com `distribuicaoHibrida` preenchida e recarrega o projeto
- **THEN** o campo é restaurado no formulário com o valor persistido em `projeto.json`

---

### Requirement: Campo condicional de carga síncrona por aula (EaD)
O modelo `CourseConfig` SHALL incluir o campo opcional `cargaSincronaPorAula` (string, texto livre), que descreve a janela de interação síncrona online com o instrutor prevista em cada aula de um curso EaD (ex.: "15 min de interação síncrona com o instrutor por aula"). O formulário da Etapa 1 SHALL exibir esse campo somente quando `modalidade = "EaD"`. O valor SHALL ser persistido em `projeto.json` e restaurado ao carregar o projeto.

#### Scenario: Campo exibido apenas para modalidade EaD
- **WHEN** o usuário seleciona `modalidade: "EaD"` no formulário da Etapa 1
- **THEN** o campo "Carga síncrona por aula" torna-se visível; ao trocar para outra modalidade, o campo é ocultado e seu valor não é enviado

#### Scenario: Janela síncrona reservada no plano de aula
- **WHEN** o usuário preenche `cargaSincronaPorAula` com "15 min" em um curso EaD com aulas de 120 min e gera um plano de aula
- **THEN** a sequência didática reserva explicitamente a janela síncrona com objetivo definido (tira-dúvidas, feedback ou demonstração ao vivo) e organiza os demais ~105 min como trilha autoinstrucional no AVA

#### Scenario: Curso EaD sem carga síncrona definida
- **WHEN** o usuário mantém `cargaSincronaPorAula` vazio em um curso EaD
- **THEN** o sistema aceita normalmente e as diretrizes EaD seguem o padrão assíncrono, com encontros síncronos apenas como complemento
