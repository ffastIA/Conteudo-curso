# cost-budget Specification

## Purpose
TBD - created by archiving change governanca-de-custo. Update Purpose after archive.
## Requirements
### Requirement: Tetos de orçamento por escopo
O sistema SHALL aceitar tetos de gasto em USD para três escopos: projeto (`ORCAMENTO_MAX_USD`), dia (`ORCAMENTO_DIA_MAX_USD`) e etapa (`ORCAMENTO_ETAPA_MAX_USD`). `ORCAMENTO_USD` SHALL continuar aceita como sinônimo de `ORCAMENTO_MAX_USD`, com um aviso de depreciação único no log. Um escopo sem teto SHALL não aplicar nenhuma trava, e valores não numéricos, zero ou negativos SHALL ser tratados como "sem teto". Sem nenhum teto configurado, nenhuma chamada SHALL ser reservada com efeito, barrada, alertada nem ter o perfil degradado por orçamento, e o perfil padrão não SHALL impor limite de ciclos de melhoria; os gatilhos do disjuntor por unidade de trabalho (`cost-circuit-breaker`) continuam ativos.

#### Scenario: Teto por projeto
- **WHEN** `ORCAMENTO_MAX_USD=5` e o gasto acertado do projeto é US$ 4,99 com uma chamada estimada em US$ 0,05
- **THEN** a chamada é barrada antes de ser feita

#### Scenario: Teto por etapa
- **WHEN** `ORCAMENTO_ETAPA_MAX_USD=1` e a etapa `conteudo` já gastou US$ 0,98 no projeto
- **THEN** uma nova chamada da etapa `conteudo` estimada em US$ 0,05 é barrada, e uma chamada da etapa `revisao` não é afetada por esse teto

#### Scenario: Sinônimo antigo
- **WHEN** só `ORCAMENTO_USD=5` está definida
- **THEN** o teto do projeto é US$ 5 e o log registra uma vez que `ORCAMENTO_USD` foi substituída por `ORCAMENTO_MAX_USD`

#### Scenario: Sem teto
- **WHEN** nenhuma variável de teto está definida
- **THEN** nenhuma chamada é barrada e nenhum alerta é emitido

#### Scenario: Valor inválido
- **WHEN** `ORCAMENTO_DIA_MAX_USD=abc`
- **THEN** o escopo dia fica sem teto e o log registra um aviso

### Requirement: Reserva antes da chamada e acerto depois
Antes de cada chamada à OpenAI, o sistema SHALL estimar o custo (com a calibração e a margem de segurança de `cost-estimation`), reservar esse valor em todos os escopos com teto e só então fazer a chamada. Se algum escopo não comporta a reserva, a chamada SHALL NOT ser feita. Depois da resposta, o sistema SHALL substituir a reserva pelo custo real calculado a partir do `usage`; se a chamada falhar antes de gastar, SHALL liberar a reserva. Reservas em voo SHALL contar para o saldo das demais chamadas concorrentes. Nenhuma chamada à OpenAI SHALL ocorrer fora desse fluxo.

#### Scenario: Chamadas concorrentes dividem o saldo
- **WHEN** restam US$ 0,10 no teto e três chamadas simultâneas estimadas em US$ 0,06 cada pedem reserva
- **THEN** só a primeira reserva é aceita e as outras duas são barradas

#### Scenario: Acerto corrige a reserva
- **WHEN** uma chamada reservou US$ 0,06 e o `usage` real custou US$ 0,04
- **THEN** o gasto acertado aumenta US$ 0,04 e a diferença volta ao saldo

#### Scenario: Falha libera a reserva
- **WHEN** a chamada falha por erro de rede antes de qualquer resposta
- **THEN** a reserva é liberada e o gasto acertado não muda

#### Scenario: Excesso limitado a uma chamada
- **WHEN** o custo real de uma chamada supera a reserva
- **THEN** o gasto acertado reflete o custo real e a chamada seguinte já encontra o saldo corrigido

#### Scenario: Nenhuma chamada fora do wrapper
- **WHEN** o teste estático varre o código do servidor
- **THEN** nenhuma chamada a `chat.completions.create`, `responses.create` ou `images.generate` existe fora do wrapper que faz a reserva

### Requirement: Alerta antes do teto
Ao atingir `ORCAMENTO_ALERTA_PCT` (padrão 80) do teto de um escopo, o sistema SHALL emitir o evento SSE `alerta_orcamento` com o escopo, o gasto e o teto, uma única vez por escopo e por valor de teto. Aumentar o teto SHALL rearmar o alerta.

#### Scenario: Alerta único
- **WHEN** o gasto do projeto passa de 80% de US$ 5
- **THEN** um único `alerta_orcamento` é emitido, e novas chamadas abaixo do teto não repetem o evento

#### Scenario: Alerta rearmado
- **WHEN** o usuário aumenta o teto de US$ 5 para US$ 10 e o gasto volta a passar de 80%
- **THEN** um novo `alerta_orcamento` é emitido

### Requirement: Pausa ao atingir o teto
Quando uma reserva é negada por teto, a etapa SHALL parar sem perder o trabalho já salvo, e o sistema SHALL emitir o evento SSE `pausado_orcamento` com `escopo`, `gastoUsd`, `tetoUsd`, `estimativaProximaUsd` e as opções `aumentar-teto`, `trocar-perfil` e `cancelar`. O estado `pausado_orcamento` SHALL ser gravado em `scr/uso.json`. A etapa SHALL NOT terminar com o evento `done` de sucesso nem gravar arquivo parcial como oficial.

#### Scenario: Pausa em plena geração de aulas
- **WHEN** o teto é atingido após a 3ª de 10 aulas
- **THEN** as aulas 1 a 3 permanecem salvas, a etapa emite `pausado_orcamento`, e as aulas 4 a 10 não são geradas

#### Scenario: Estado gravado
- **WHEN** a pausa ocorre
- **THEN** `scr/uso.json` registra o estado pausado, o escopo e o momento

#### Scenario: Sem `done` de sucesso
- **WHEN** a etapa é pausada
- **THEN** o fluxo SSE termina sem o `done` de conclusão da etapa e a interface exibe a decisão

### Requirement: Retomada depois da pausa
Depois de uma pausa, o usuário SHALL poder aumentar o teto ou trocar o perfil por `POST /api/orcamento` e executar a etapa de novo, que SHALL retomar do ponto em que parou usando a retomada já existente, sem regenerar o que está pronto. Aumentar o teto SHALL limpar o estado de pausa. Enquanto o teto não for aumentado, executar a etapa de novo SHALL pausar de imediato, sem nenhuma chamada à OpenAI.

#### Scenario: Retomada após aumento
- **WHEN** a etapa pausou na aula 4 e o usuário aumenta o teto e executa a etapa novamente
- **THEN** as aulas 1 a 3 não são regeneradas e a geração segue da aula 4

#### Scenario: Reexecução sem aumentar o teto
- **WHEN** o usuário executa a etapa de novo sem alterar o teto
- **THEN** a etapa pausa imediatamente e nenhuma chamada à OpenAI é feita

#### Scenario: Troca de perfil
- **WHEN** o usuário troca para o perfil Econômico e executa a etapa de novo
- **THEN** a etapa retoma com os parâmetros do Econômico

### Requirement: Gasto persistido por projeto
O sistema SHALL gravar em `scr/uso.json` o gasto por dia, por etapa e por modelo, a calibração da estimativa, os tetos ajustados pelo usuário, o perfil e o estado de pausa. A gravação SHALL ser atômica (arquivo temporário seguido de renomeação). Arquivo ausente ou corrompido SHALL resultar em estado vazio com um aviso no log, sem impedir a geração. O arquivo SHALL ser preservado por carregar-projeto e por importar, e as reservas em voo SHALL NOT ser persistidas.

#### Scenario: Gravação atômica
- **WHEN** o servidor é encerrado durante uma gravação de `uso.json`
- **THEN** o arquivo contém o JSON anterior íntegro ou o novo íntegro, nunca um JSON truncado

#### Scenario: Arquivo corrompido
- **WHEN** `scr/uso.json` contém JSON inválido ao carregar o projeto
- **THEN** o sistema inicia com o gasto zerado nesse arquivo, registra um aviso e a geração continua funcionando

#### Scenario: Preservado ao carregar
- **WHEN** o usuário carrega um projeto com `scr/uso.json`
- **THEN** o gasto, o perfil e os tetos do projeto são restaurados

#### Scenario: Reservas não persistem
- **WHEN** o servidor cai com chamadas em voo e é reiniciado
- **THEN** o saldo considera apenas o gasto acertado

### Requirement: Teto diário entre projetos
O teto diário (`ORCAMENTO_DIA_MAX_USD`) SHALL somar o gasto do dia corrente (data local) de todos os projetos da máquina, guardado em um arquivo global (`.uso-diario.json`, redirecionável por `USO_DIARIO_FILE`). Se esse arquivo não puder ser lido ou gravado, o escopo dia SHALL ficar desligado com um aviso, e a geração SHALL NOT ser bloqueada por essa falha.

#### Scenario: Dois projetos no mesmo dia
- **WHEN** o projeto A gastou US$ 3 e o projeto B gasta mais US$ 2,50 com `ORCAMENTO_DIA_MAX_USD=5`
- **THEN** a chamada do projeto B que ultrapassaria US$ 5 no total é barrada

#### Scenario: Virada do dia
- **WHEN** a data local muda
- **THEN** o gasto diário recomeça em zero

#### Scenario: Arquivo global inacessível
- **WHEN** `.uso-diario.json` não pode ser gravado
- **THEN** o escopo dia fica desligado, o log registra um aviso e as chamadas não são barradas por esse escopo

### Requirement: Consulta e ajuste do orçamento
O sistema SHALL expor `GET /api/orcamento` com os tetos, o gasto por escopo, etapa e modelo, o saldo restante, o perfil ativo, os alertas, o estado de pausa ou de disjuntor, a calibração e, por papel, o modelo efetivo e a origem (`modelos` e `modelosOrigem`), a escolha do usuário (`modelosEscolhidos`) e os modelos permitidos (`modelosDisponiveis`), e `POST /api/orcamento` para ajustar tetos, trocar o perfil, escolher o modelo de cada papel (`modelos`, papel → modelo, `null` remove a escolha) e registrar a decisão após uma pausa ou um disparo do disjuntor. Os valores SHALL ser validados (números positivos; perfil conhecido; papel conhecido e modelo da lista permitida) e valores inválidos SHALL ser recusados com HTTP 400 e uma mensagem. Nenhuma das respostas SHALL conter chaves de API ou caminhos fora do projeto.

#### Scenario: Consulta
- **WHEN** a interface faz `GET /api/orcamento` com `ORCAMENTO_MAX_USD=5` e gasto de US$ 1,20
- **THEN** a resposta traz `projeto.tetoUsd = 5`, `projeto.gastoUsd = 1.2` e `projeto.restanteUsd = 3.8`

#### Scenario: Ajuste válido
- **WHEN** a interface envia `POST /api/orcamento` com um novo teto de projeto de US$ 10
- **THEN** o teto passa a valer, é gravado em `uso.json` e o estado de pausa é limpo

#### Scenario: Ajuste inválido
- **WHEN** a interface envia um teto negativo ou um perfil desconhecido
- **THEN** a resposta é HTTP 400 com a mensagem do erro e nada é alterado

#### Scenario: Escolha de modelo válida
- **WHEN** a interface envia `POST /api/orcamento` com `{ "modelos": { "pesquisa": "gpt-4o-mini" } }`
- **THEN** a escolha é gravada em `uso.json`, a resposta traz `modelosEscolhidos.pesquisa = "gpt-4o-mini"` e `modelosOrigem.pesquisa = "usuario"`

### Requirement: Painel e confirmação na interface
A interface SHALL exibir um painel com o saldo restante, o gasto por etapa, o perfil ativo e os alertas, atualizado pelos eventos SSE `alerta_orcamento`, `pausado_orcamento` e `perfil_alterado`, e uma área "Modelos" com um seletor por papel (opção "Padrão do perfil" mais os modelos permitidos), que indica o modelo efetivo e se ele está fixado pelo usuário e exibe o aviso de mistura de modelos quando o servidor o enviar. Antes de iniciar uma etapa pesada, quando a faixa máxima da estimativa for maior que o saldo restante de algum escopo, a interface SHALL pedir a confirmação do usuário, que pode cancelar, aumentar o teto ou continuar.

#### Scenario: Confirmação por estimativa acima do saldo
- **WHEN** o saldo restante é US$ 0,50 e a estimativa máxima da etapa de conteúdo é US$ 2,00
- **THEN** a interface exibe a confirmação antes de iniciar a etapa e nada é gerado até a resposta do usuário

#### Scenario: Estimativa dentro do saldo
- **WHEN** a estimativa máxima cabe no saldo restante
- **THEN** nenhuma confirmação extra é exibida

#### Scenario: Painel atualizado em tempo real
- **WHEN** um `alerta_orcamento` chega por SSE durante a geração
- **THEN** o painel destaca o escopo em alerta sem recarregar a página

#### Scenario: Seletores de modelo
- **WHEN** o usuário abre o painel de um projeto sem escolha de modelo
- **THEN** cada papel mostra "Padrão do perfil" selecionado, o modelo efetivo e as opções permitidas

### Requirement: Mesmos números no Langfuse
Com o Langfuse habilitado, o sistema SHALL enviar o perfil ativo e o saldo restante do projeto como metadados do trace (`perfil`, `orcamento_restante_usd`) e o papel do modelo como metadado de cada `generation`. O custo por etapa mostrado no painel e o somado no Langfuse SHALL partir do mesmo `usage`.

#### Scenario: Metadados do trace
- **WHEN** uma etapa termina com o Langfuse habilitado
- **THEN** o span raiz leva `langfuse.trace.metadata.perfil` e `langfuse.trace.metadata.orcamento_restante_usd`

#### Scenario: Papel por generation
- **WHEN** uma chamada de redação é registrada como `generation`
- **THEN** ela leva o metadado do papel `redacao`

#### Scenario: Sem Langfuse
- **WHEN** o Langfuse está desligado
- **THEN** o painel e os tetos funcionam normalmente

