## ADDED Requirements

### Requirement: Diretrizes de nível governam a geração de todas as etapas
As skills de geração que recebem o parâmetro `nivel` (`metodologiaSkill`, `ementaSkill`, `planoEnsinoSkill`, `planLessonsSkill`, `planoAulaSkill`, `conteudoSkill`, `estiloVisualSkill`) SHALL injetar no prompt o bloco `## Diretrizes de Nível` correspondente ao nível declarado (`NIVEL_DIRETRIZES`), definindo profundidade, vocabulário, pré-requisitos assumíveis, tipo de exemplos/atividades e nível-alvo da Taxonomia de Bloom. O lookup SHALL ser tolerante a caixa e acentuação e SHALL omitir o bloco (sem erro) quando o nível estiver ausente ou fora do enum.

#### Scenario: Conteúdo de nível básico
- **WHEN** o conteúdo de uma aula é gerado para um curso com `nivel: "Básico"`
- **THEN** o prompt contém as diretrizes de nível básico (definir todos os termos técnicos, não assumir pré-requisitos, exemplos cotidianos, Bloom: lembrar/entender/aplicar, evitar aprofundar internals)

#### Scenario: Conteúdo de nível avançado
- **WHEN** o conteúdo da mesma aula é gerado com `nivel: "Avançado"`
- **THEN** o prompt contém as diretrizes de nível avançado (uso livre de vocabulário técnico, pré-requisitos assumidos, exemplos de cenários reais complexos, Bloom: analisar/avaliar/criar, evitar gastar tempo em fundamentos)

#### Scenario: Nível ausente ou não reconhecido (projeto legado)
- **WHEN** qualquer skill é chamada com `nivel` vazio, nulo ou fora do enum
- **THEN** o bloco de diretrizes é omitido e o prompt permanece como antes desta change, sem erro

#### Scenario: Mesmo curso, níveis diferentes, saídas diferentes
- **WHEN** o mesmo curso é gerado uma vez como `Básico` e outra como `Avançado`
- **THEN** ementa, plano de ensino, plano de aula e conteúdo apresentam diferenças observáveis de profundidade, vocabulário e complexidade de atividades

#### Scenario: Nível com peso alto declarado no system prompt
- **WHEN** `ementaSkill`, `planoEnsinoSkill`, `planoAulaSkill` ou `conteudoSkill` é chamada com nível reconhecido
- **THEN** o prompt `system` da skill declara explicitamente que o nível configurado é um fator de PESO ALTO na definição de profundidade, vocabulário e complexidade do conteúdo, subordinado apenas à Metodologia Pedagógica definida

---

### Requirement: Cabeçalho de identificação com o nível nos documentos gerados
Os documentos gerados de ementa, plano de ensino e plano de aula SHALL exibir no cabeçalho de identificação o **Nível** configurado (Básico, Intermediário ou Avançado), ao lado dos demais dados do curso. Os prompts das skills correspondentes SHALL instruir explicitamente o modelo a produzir essa linha (hoje o nível é apenas dado de entrada do prompt, sem garantia de aparecer no documento).

#### Scenario: Documentos exibem o nível no cabeçalho
- **WHEN** a ementa, o plano de ensino ou um plano de aula é gerado para um curso com `nivel: "Intermediário"`
- **THEN** o documento inicia com cabeçalho de identificação exibindo `Nível: Intermediário`

#### Scenario: Nível ausente (projeto legado)
- **WHEN** o projeto não possui `nivel` reconhecido
- **THEN** a linha de nível é omitida do cabeçalho, sem erro

---

### Requirement: Pesquisa web direcionada pelo nível
As skills `pesquisaWebSkill` e `pesquisaFallbackSkill` SHALL injetar a variante `pesquisa` das diretrizes de nível, direcionando o tipo de fonte e material buscado.

#### Scenario: Pesquisa para curso básico
- **WHEN** a pesquisa web é executada para um curso com `nivel: "Básico"`
- **THEN** o prompt orienta a busca a priorizar guias introdutórios, fundamentos e materiais didáticos de entrada

#### Scenario: Pesquisa para curso avançado
- **WHEN** a pesquisa web é executada para um curso com `nivel: "Avançado"`
- **THEN** o prompt orienta a busca a priorizar documentação avançada, benchmarks, tendências de ponta e certificações profissionais avançadas
