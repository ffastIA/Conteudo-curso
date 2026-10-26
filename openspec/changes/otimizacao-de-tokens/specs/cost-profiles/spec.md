## ADDED Requirements

### Requirement: Modelo de pesquisa por perfil
O perfil de custo SHALL poder definir `modeloPesquisa` em `config/perfis-custo.json`. Quando ausente, a pesquisa SHALL usar o modelo do papel `pesquisa` (`OPENAI_RESEARCH_MODEL`, padrão `gpt-4o`). Quando presente, o modelo do perfil SHALL valer para as consultas de pesquisa geral e por módulo, SHALL ser conferido na validação de capacidades (busca web) e SHALL aparecer no registro da pesquisa e no cache (a chave de cache inclui o modelo). Os perfis incluídos SHALL continuar sem `modeloPesquisa` até que o experimento descrito no design comprove qualidade equivalente com um modelo mais barato.

#### Scenario: Perfil sem modelo de pesquisa
- **WHEN** o perfil ativo não define `modeloPesquisa`
- **THEN** a pesquisa usa `OPENAI_RESEARCH_MODEL`

#### Scenario: Perfil com modelo próprio
- **WHEN** o perfil Econômico define `modeloPesquisa: "gpt-4o-mini"`
- **THEN** as consultas de pesquisa executadas nesse perfil usam `gpt-4o-mini` e o registro da pesquisa informa esse modelo

#### Scenario: Modelo sem busca web
- **WHEN** o `modeloPesquisa` de um perfil aponta para um modelo sem a capacidade de busca web
- **THEN** a validação de capacidades emite aviso, sem impedir o uso
