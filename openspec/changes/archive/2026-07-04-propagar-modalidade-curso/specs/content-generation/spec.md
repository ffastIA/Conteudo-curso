## ADDED Requirements

### Requirement: Conteúdo e planos refletem a modalidade do curso
As skills de geração do pipeline (`ementaSkill`, `planoEnsinoSkill`, `planLessonsSkill`, `planoAulaSkill`, `conteudoSkill`) SHALL receber a modalidade do curso e gerar atividades, recursos didáticos, formas de interação e instrumentos de avaliação compatíveis com ela, conforme as diretrizes de `MODALIDADE_DIRETRIZES`.

#### Scenario: Plano de aula presencial
- **WHEN** o plano de aula é gerado para um curso com `modalidade: "presencial"`
- **THEN** as atividades propostas assumem sala/laboratório físico e interação síncrona em turma (dinâmicas em grupo, prática supervisionada em laboratório)

#### Scenario: Conteúdo EaD
- **WHEN** o conteúdo de uma aula é gerado para um curso com `modalidade: "EaD"`
- **THEN** o texto propõe atividades autoinstrucionais e assíncronas, recursos de AVA e formas de avaliação aplicáveis a distância, sem depender de presença física

#### Scenario: Divisão em aulas de curso híbrido
- **WHEN** `planLessonsSkill` divide o curso com `modalidade: "híbrido"` em aulas
- **THEN** o planejamento pode distinguir momentos presenciais e a distância, coerentes com a proporção teórico/prático configurada

#### Scenario: Mesmo curso, modalidades diferentes, saídas diferentes
- **WHEN** o mesmo curso é gerado uma vez como `presencial` e outra como `EaD`
- **THEN** ementa, plano de ensino, plano de aula e conteúdo apresentam diferenças observáveis em atividades, recursos e avaliação coerentes com cada modalidade

---

### Requirement: Cabeçalho de identificação com a modalidade nos documentos gerados
Os documentos gerados de ementa, plano de ensino e plano de aula SHALL iniciar com um cabeçalho de identificação contendo, no mínimo: nome do curso, carga horária e **Modalidade** (presencial, EaD ou híbrido). Os prompts das skills correspondentes SHALL instruir explicitamente o modelo a produzir esse cabeçalho.

#### Scenario: Ementa com cabeçalho de modalidade
- **WHEN** a ementa é gerada para um curso com `modalidade: "EaD"`
- **THEN** o documento inicia com cabeçalho de identificação exibindo `Modalidade: EaD` antes do texto da ementa

#### Scenario: Plano de ensino e plano de aula com cabeçalho
- **WHEN** o plano de ensino ou um plano de aula é gerado
- **THEN** o documento inicia com o cabeçalho de identificação incluindo a modalidade do curso

#### Scenario: Modalidade ausente (projeto legado)
- **WHEN** o projeto não possui `modalidade` configurada
- **THEN** a linha de modalidade é omitida do cabeçalho, sem erro
