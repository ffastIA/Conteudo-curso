## MODIFIED Requirements

### Requirement: Roteamento de modelos por papel
O sistema SHALL escolher o modelo de cada chamada por papel: pesquisa (`OPENAI_RESEARCH_MODEL`), resumos e roteiros (`OPENAI_SUMMARY_MODEL`), redação (`OPENAI_CONTENT_MODEL`), avaliação de primeira passada (`OPENAI_EVAL_MODEL`) e juiz final (`OPENAI_JUDGE_MODEL`). O padrão de resumos e de avaliação SHALL ser o modelo de economia configurado, e o do juiz final SHALL ser o modelo de redação. O modelo SHALL ser resolvido na hora da chamada, considerando o perfil ativo, e nenhum nome de modelo SHALL ficar fixo no código fora dos valores padrão de `config/modelos.js`. A escolha do usuário na tela (capability `model-selection`), quando existir para o papel, SHALL ter prioridade sobre o perfil, as variáveis e os padrões. Cada `generation` SHALL registrar o papel como metadado.

#### Scenario: Papel com variável própria
- **WHEN** `OPENAI_EVAL_MODEL=gpt-4o-mini` e `OPENAI_CONTENT_MODEL=gpt-4o`
- **THEN** a avaliação de primeira passada usa `gpt-4o-mini` e a redação usa `gpt-4o`

#### Scenario: Herança do padrão
- **WHEN** `OPENAI_SUMMARY_MODEL` não está definida
- **THEN** resumos e roteiros usam o modelo de economia configurado

#### Scenario: Juiz herda a redação
- **WHEN** `OPENAI_JUDGE_MODEL` não está definida
- **THEN** o juiz final usa o modelo de redação

#### Scenario: Troca sem reiniciar
- **WHEN** o perfil muda de Padrão para Econômico entre duas aulas
- **THEN** a próxima chamada de redação resolve o modelo do Econômico

#### Scenario: Escolha do usuário vence o perfil e a variável
- **WHEN** o usuário escolheu `gpt-4o` para `avaliacao` e `OPENAI_EVAL_MODEL=gpt-4o-mini`
- **THEN** a avaliação de primeira passada usa `gpt-4o`

### Requirement: Modelo de pesquisa por perfil
O perfil de custo SHALL poder definir `modeloPesquisa` em `config/perfis-custo.json`. Quando ausente, a pesquisa SHALL usar o modelo do papel `pesquisa` (`OPENAI_RESEARCH_MODEL`, padrão `gpt-4o`). Quando presente, o modelo do perfil SHALL valer para as consultas de pesquisa geral e por módulo, SHALL ser conferido na validação de capacidades (busca web) e SHALL aparecer no registro da pesquisa e no cache (a chave de cache inclui o modelo). O perfil Econômico incluído SHALL definir `modeloPesquisa: "gpt-4o-mini"` (experimento de 2026-10-26: pesquisa 81% mais barata com fontes e nota equivalentes à linha de base); Padrão e Premium SHALL continuar sem o campo. A escolha do usuário para o papel `pesquisa` SHALL prevalecer sobre o `modeloPesquisa` do perfil.

#### Scenario: Perfil sem modelo de pesquisa
- **WHEN** o perfil ativo não define `modeloPesquisa`
- **THEN** a pesquisa usa `OPENAI_RESEARCH_MODEL`

#### Scenario: Perfil com modelo próprio
- **WHEN** o perfil Econômico define `modeloPesquisa: "gpt-4o-mini"`
- **THEN** as consultas de pesquisa executadas nesse perfil usam `gpt-4o-mini` e o registro da pesquisa informa esse modelo

#### Scenario: Modelo sem busca web
- **WHEN** o `modeloPesquisa` de um perfil aponta para um modelo sem a capacidade de busca web
- **THEN** a validação de capacidades emite aviso, sem impedir o uso

#### Scenario: Escolha do usuário vence o modelo do perfil
- **WHEN** o perfil Econômico define `modeloPesquisa: "gpt-4o-mini"` e o usuário escolheu `gpt-4o` para `pesquisa`
- **THEN** as consultas de pesquisa usam `gpt-4o`
