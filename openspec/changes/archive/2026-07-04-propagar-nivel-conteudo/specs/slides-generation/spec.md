## ADDED Requirements

### Requirement: Slides adequados ao nível declarado
A `slidesSkill` SHALL receber o parâmetro `nivel` e injetar as diretrizes de nível correspondentes, adequando densidade de informação por slide e vocabulário ao nível do curso.

#### Scenario: Slides de curso básico
- **WHEN** os slides são gerados para um curso com `nivel: "Básico"`
- **THEN** o prompt contém as diretrizes de nível básico e os slides resultantes privilegiam pouco texto por slide, termos definidos e progressão gradual

#### Scenario: Slides de curso avançado
- **WHEN** os slides são gerados para um curso com `nivel: "Avançado"`
- **THEN** o prompt contém as diretrizes de nível avançado, permitindo maior densidade técnica e vocabulário especializado sem definições introdutórias

#### Scenario: Nível ausente
- **WHEN** a `slidesSkill` é chamada sem `nivel` reconhecido
- **THEN** o comportamento atual é mantido, sem erro
