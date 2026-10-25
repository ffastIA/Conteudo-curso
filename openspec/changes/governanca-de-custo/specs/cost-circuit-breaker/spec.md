## ADDED Requirements

### Requirement: Gatilhos do disjuntor por unidade de trabalho
Além das falhas consecutivas da API, o disjuntor SHALL disparar por quatro gatilhos avaliados por unidade de trabalho (módulo ou aula): (1) o custo real de uma aula passa de `DISJUNTOR_FATOR_CUSTO` (padrão 2) vezes a estimativa dela; (2) o mesmo código de erro se repete `DISJUNTOR_ERROS_SEGUIDOS` (padrão 3) vezes em sequência; (3) um ciclo de melhoria termina com ganho médio menor que `DISJUNTOR_GANHO_MIN` (padrão igual a `EPSILON_CONVERGENCIA`); (4) as continuações de uma unidade esgotam `MAX_CONTINUACOES_*` sem terminar. Os limites SHALL ser configuráveis por variável. O gatilho (3) SHALL interromper a etapa nos perfis Econômico e Padrão e SHALL apenas avisar no Premium. Sem teto de orçamento configurado, os gatilhos SHALL continuar ativos, pois protegem de comportamento anormal e não do total.

#### Scenario: Gatilho de custo
- **WHEN** uma aula estimada em US$ 0,05 já custou US$ 0,11 e ainda não terminou
- **THEN** o disjuntor dispara com o motivo `custo`

#### Scenario: Gatilho de erro repetido
- **WHEN** a mesma falha ocorre três vezes seguidas na mesma etapa
- **THEN** o disjuntor dispara com o motivo `erro_repetido`

#### Scenario: Gatilho de ciclo sem ganho
- **WHEN** um ciclo de melhoria no perfil Padrão termina com ganho médio abaixo de `DISJUNTOR_GANHO_MIN`
- **THEN** o disjuntor dispara com o motivo `sem_ganho` e a etapa para

#### Scenario: Ciclo sem ganho no Premium
- **WHEN** o mesmo ocorre no perfil Premium
- **THEN** o sistema emite um aviso e a etapa continua

#### Scenario: Continuações esgotadas
- **WHEN** uma seção atinge o limite de continuações sem terminar
- **THEN** o disjuntor dispara com o motivo `continuacoes`

#### Scenario: Falhas da API continuam contando
- **WHEN** a API falha `DISJUNTOR_FALHAS` vezes seguidas
- **THEN** o disjuntor existente recusa novas chamadas pelo tempo de espera configurado, como antes desta capability

#### Scenario: Valores configuráveis
- **WHEN** `DISJUNTOR_FATOR_CUSTO=3`
- **THEN** o gatilho de custo só dispara acima de três vezes a estimativa

### Requirement: Efeito do disparo e decisão do usuário
Ao disparar, o disjuntor SHALL interromper a etapa, registrar o motivo em `scr/uso.json` e no log, marcar a unidade como incompleta com o texto parcial gravado somente em `.partial` (nunca no arquivo oficial), emitir o evento SSE `disjuntor` com o motivo, a unidade e as opções `aumentar-limite`, `trocar-perfil` e `pular`, e aguardar a decisão do usuário por `POST /api/orcamento`. O reset SHALL ser manual, isto é, apenas pela decisão do usuário. Pular uma unidade SHALL mantê-la marcada como incompleta e SHALL NOT incluí-la como concluída em nenhum arquivo consolidado.

#### Scenario: Aula incompleta preservada como parcial
- **WHEN** o disjuntor dispara durante a geração da aula 5
- **THEN** o texto gerado até ali fica em `aula05_conteudo.partial.txt`, o arquivo oficial da aula 5 não é criado e o evento `disjuntor` é emitido

#### Scenario: Decisão de aumentar o limite
- **WHEN** o usuário escolhe `aumentar-limite` para o gatilho de custo
- **THEN** o novo limite vale, o estado do disjuntor é limpo e a etapa pode ser executada de novo para retomar

#### Scenario: Decisão de pular
- **WHEN** o usuário escolhe `pular` a aula 5
- **THEN** a aula 5 continua marcada como incompleta, a etapa segue para a aula 6 ao ser executada de novo, e a aula 5 não aparece como concluída

#### Scenario: Reset só manual
- **WHEN** o disjuntor disparou e o usuário não decidiu
- **THEN** executar a etapa de novo interrompe de imediato com a mesma mensagem, sem nenhuma chamada à OpenAI

#### Scenario: Troca de perfil como decisão
- **WHEN** o usuário escolhe `trocar-perfil` para o Econômico
- **THEN** o perfil passa a valer, o estado do disjuntor é limpo e a retomada usa o novo perfil

### Requirement: Registro auditável dos disparos
Cada disparo do disjuntor SHALL ser registrado em `scr/uso.json` com o motivo, a unidade de trabalho, os valores que o causaram (por exemplo custo real e estimativa) e o momento, e SHALL aparecer no log estruturado com o mesmo identificador do trace. Com o Langfuse habilitado, o `generation` ou span da unidade SHALL levar o nível de aviso e o motivo como metadado.

#### Scenario: Registro do disparo
- **WHEN** o gatilho de custo dispara
- **THEN** `uso.json` registra o motivo `custo`, o custo real, a estimativa, a unidade e o momento

#### Scenario: Correlação com o trace
- **WHEN** o disparo ocorre com o Langfuse habilitado
- **THEN** o log do disparo contém o `traceId` da requisição e o span correspondente leva o motivo como metadado
