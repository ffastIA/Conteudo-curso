## ADDED Requirements

### Requirement: PROJECT.md sincronizado com o código
`PROJECT.md` SHALL refletir o cookie de sessão real (`sessionId`), a contagem real de endpoints com o comando que a reproduz, o número atual de testes, os modelos em uso, os modelos de dados novos (`pesquisa.json`, `pesquisa_modulos.json`, estados de aula, `geracao_log.json`) e os gaps G11, G12 e G13.

#### Scenario: Cookie
- **WHEN** um leitor consulta a seção de sessão
- **THEN** o cookie documentado é `sessionId`

#### Scenario: Novos gaps
- **WHEN** a tabela de gaps é consultada
- **THEN** G11, G12 e G13 estão listados com status

### Requirement: README cobre todas as etapas e endpoints
O `README.md` SHALL descrever as Etapas 1 a 10 e a lista atual de endpoints.

#### Scenario: Etapas 9 e 10
- **WHEN** um leitor procura roteiros e vídeo com avatar
- **THEN** o README descreve as Etapas 9 e 10

### Requirement: Configuração OpenSpec atual
`openspec/config.yaml` SHALL NOT referenciar `specs.yaml` inexistente e SHALL listar os modelos e gaps atuais.

#### Scenario: Referência obsoleta
- **WHEN** `openspec/config.yaml` é lido
- **THEN** não há menção a `specs.yaml`

### Requirement: Status dos planos atualizado
`plans/README.md` SHALL refletir o status real dos planos 001 a 005.

#### Scenario: Plano concluído
- **WHEN** um plano já foi implementado
- **THEN** o `plans/README.md` não o marca como TODO
