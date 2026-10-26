## ADDED Requirements

### Requirement: Perfis de custo
O sistema SHALL oferecer os perfis Econômico, Padrão e Premium, escolhidos por `CUSTO_PERFIL` (padrão `padrao`) e guardados por projeto. Cada perfil SHALL ser um pacote de parâmetros lido de `config/perfis-custo.json` em tempo de execução, contendo o número de consultas de pesquisa por módulo, o contexto da busca web, o papel do modelo de redação, o máximo de ciclos de melhoria, o número de achados da pesquisa que entram no dossiê de cada aula (`achadosDossie`; o padrão 6 mantém o comportamento anterior) e a política do juiz final. A consulta extra de referências educacionais (BNCC ativa) SHALL NOT contar no número de consultas. O máximo de ciclos SHALL ser imposto somente quando houver algum teto configurado ou o perfil tiver sido escolhido de propósito (`CUSTO_PERFIL` ou a interface); sem isso os ciclos continuam ilimitados. Um perfil desconhecido em `CUSTO_PERFIL` SHALL cair no `padrao` com um aviso. Os valores do arquivo SHALL ser configuráveis sem alterar o código.

#### Scenario: Perfil padrão
- **WHEN** `CUSTO_PERFIL` não está definida
- **THEN** o perfil ativo é `padrao` e o painel o exibe

#### Scenario: Econômico reduz o gasto por aula
- **WHEN** o perfil ativo é Econômico
- **THEN** a pesquisa por módulo usa o número de consultas do Econômico, o contexto de busca baixo e no máximo um ciclo de melhoria

#### Scenario: Máximo de ciclos só com teto ou perfil escolhido
- **WHEN** o projeto já tem 2 ciclos de melhoria, não há teto e o perfil é o padrão não escolhido
- **THEN** um novo ciclo é permitido; com o perfil Econômico (máx. 1 ciclo) escolhido de propósito, o disjuntor barra o ciclo com o motivo `limite_ciclos`

#### Scenario: Perfil inválido
- **WHEN** `CUSTO_PERFIL=ultra`
- **THEN** o perfil ativo é `padrao` e o log registra um aviso

#### Scenario: Valores editáveis
- **WHEN** o usuário altera o número de consultas do Premium em `config/perfis-custo.json`
- **THEN** a próxima pesquisa no perfil Premium usa o novo número, sem reiniciar o servidor

### Requirement: Degradação automática de perfil
Quando qualquer escopo com teto atingir o alerta de `ORCAMENTO_ALERTA_PCT` e o perfil ativo não for o Econômico, o sistema SHALL descer um nível de perfil (Premium para Padrão, Padrão para Econômico), somente entre unidades de trabalho (módulo, aula ou seção) e nunca no meio de uma, e SHALL emitir o evento SSE `perfil_alterado` com o motivo. O sistema SHALL NOT subir de perfil sozinho. `CUSTO_DEGRADACAO_AUTOMATICA=false` SHALL desligar a degradação. Sem teto configurado, o perfil nunca SHALL degradar.

#### Scenario: Padrão passa a Econômico
- **WHEN** o gasto do projeto passa de 80% do teto durante a geração de aulas no perfil Padrão
- **THEN** a aula seguinte já usa o Econômico, e `perfil_alterado` informa o motivo

#### Scenario: Sem queda no meio da aula
- **WHEN** o alerta ocorre durante a geração de uma aula
- **THEN** a aula em curso termina com o perfil em que começou

#### Scenario: Econômico não degrada mais
- **WHEN** o perfil ativo é Econômico e o alerta é atingido
- **THEN** nenhum `perfil_alterado` é emitido

#### Scenario: Degradação desligada
- **WHEN** `CUSTO_DEGRADACAO_AUTOMATICA=false` e o alerta é atingido
- **THEN** o perfil permanece o mesmo e apenas o `alerta_orcamento` é emitido

#### Scenario: Sem teto
- **WHEN** nenhum teto está configurado
- **THEN** o perfil nunca é alterado automaticamente

### Requirement: Roteamento de modelos por papel
O sistema SHALL escolher o modelo de cada chamada por papel: pesquisa (`OPENAI_RESEARCH_MODEL`), resumos e roteiros (`OPENAI_SUMMARY_MODEL`), redação (`OPENAI_CONTENT_MODEL`), avaliação de primeira passada (`OPENAI_EVAL_MODEL`) e juiz final (`OPENAI_JUDGE_MODEL`). O padrão de resumos e de avaliação SHALL ser o modelo de economia configurado, e o do juiz final SHALL ser o modelo de redação. O modelo SHALL ser resolvido na hora da chamada, considerando o perfil ativo, e nenhum nome de modelo SHALL ficar fixo no código fora dos valores padrão de `config/modelos.js`. Cada `generation` SHALL registrar o papel como metadado.

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

### Requirement: Validação dos modelos na inicialização
Na inicialização, o sistema SHALL conferir cada papel contra a tabela de capacidades `config/modelos-capacidades.json` (busca web para pesquisa e saída estruturada onde exigida). Modelo ausente da tabela, ou sem a capacidade exigida pelo papel, SHALL gerar um aviso no log e no painel de orçamento, e SHALL NOT impedir o uso nem derrubar o servidor.

#### Scenario: Modelo sem busca web na pesquisa
- **WHEN** `OPENAI_RESEARCH_MODEL` aponta para um modelo marcado sem busca web
- **THEN** o log e o painel exibem um aviso, e a pesquisa continua sendo tentada

#### Scenario: Modelo desconhecido
- **WHEN** um papel usa um modelo que não está na tabela
- **THEN** o aviso informa que a capacidade não pôde ser conferida, e o servidor sobe normalmente

#### Scenario: Configuração válida
- **WHEN** todos os papéis usam modelos da tabela com as capacidades exigidas
- **THEN** nenhum aviso é emitido

### Requirement: Juiz final em cascata
O juiz forte (papel `juiz final`) SHALL ser acionado somente quando o ganho de nota do candidato ficar a até `JUIZ_MARGEM_GANHO` do limiar de aceitação existente (`EPSILON_CONVERGENCIA`) ou quando a nota da rubrica e o componente determinístico divergirem em mais que `JUIZ_DIVERGENCIA_MAX`. Casos claramente bons ou claramente ruins SHALL ser decididos sem o juiz forte. O perfil Premium SHALL acionar o juiz forte sempre e o Econômico nunca. Quando o modelo do juiz final for o mesmo da avaliação de primeira passada, o sistema SHALL NOT refazer o julgamento, pois não traria informação nova.

#### Scenario: Caso claramente bom
- **WHEN** o ganho de nota do candidato está bem acima do limiar e a rubrica concorda com o determinístico
- **THEN** a decisão é tomada sem chamar o juiz forte

#### Scenario: Caso duvidoso
- **WHEN** o ganho de nota está a menos de `JUIZ_MARGEM_GANHO` do limiar
- **THEN** o juiz forte é chamado para decidir

#### Scenario: Divergência entre rubrica e determinístico
- **WHEN** a rubrica e o componente determinístico divergem em mais que `JUIZ_DIVERGENCIA_MAX`
- **THEN** o juiz forte é chamado

#### Scenario: Premium sempre aciona
- **WHEN** o perfil é Premium e o caso é claramente bom
- **THEN** o juiz forte é chamado mesmo assim

#### Scenario: Econômico nunca aciona
- **WHEN** o perfil é Econômico e o caso é duvidoso
- **THEN** a decisão fica com o juiz de primeira passada
