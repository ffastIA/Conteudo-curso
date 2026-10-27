## ADDED Requirements

### Requirement: Escolha do modelo por papel
O sistema SHALL permitir que o usuário escolha, na tela, o modelo da OpenAI de cada papel (`pesquisa`, `resumos`, `redacao`, `avaliacao`, `juiz`), por projeto. A escolha SHALL ficar em `scr/uso.json` (campo `modelosEscolhidos`, mapa papel → modelo), SHALL ser restaurada ao carregar ou importar o projeto e SHALL valer a partir da próxima chamada, sem reiniciar o servidor. Papel sem escolha SHALL usar a resolução existente (perfil de custo, variáveis `OPENAI_*_MODEL` e padrões de `config/modelos.js`), sem mudança de comportamento. Um `uso.json` sem o campo SHALL valer como "nenhuma escolha".

#### Scenario: Escolha vale na próxima chamada
- **WHEN** o usuário escolhe `gpt-4o` para o papel `redacao` e a próxima seção de conteúdo é gerada
- **THEN** a chamada usa `gpt-4o` e o `geracao_log.json` registra `gpt-4o` para ela

#### Scenario: Sem escolha, nada muda
- **WHEN** o projeto não tem o campo `modelosEscolhidos` e o perfil ativo é Econômico
- **THEN** cada papel usa o modelo que usaria antes desta funcionalidade

#### Scenario: Escolha restaurada
- **WHEN** o usuário reabre um projeto cujo `uso.json` tem `modelosEscolhidos: { pesquisa: "gpt-4o-mini" }`
- **THEN** o painel mostra `gpt-4o-mini` no papel `pesquisa` e a próxima pesquisa usa esse modelo

#### Scenario: Voltar ao padrão do perfil
- **WHEN** o usuário seleciona "Padrão do perfil" no papel `pesquisa`
- **THEN** a escolha é removida de `uso.modelosEscolhidos` e a pesquisa volta a usar a resolução do perfil

### Requirement: Lista de modelos permitidos
O sistema SHALL oferecer, para cada papel, somente modelos que tenham preço em `config/precos-modelos.json` e capacidades em `config/modelos-capacidades.json` e que cumpram as exigências do papel naquela tabela (o papel `pesquisa` exige `busca_web`). A lista SHALL ser calculada a cada consulta, de modo que editar os dois arquivos a amplie sem alterar o código. O servidor SHALL recusar com HTTP 400 e uma mensagem qualquer papel desconhecido ou modelo fora da lista, sem alterar nada, e SHALL NOT aceitar nome de modelo livre.

#### Scenario: Lista da pesquisa
- **WHEN** a interface consulta `GET /api/orcamento` e as tabelas trazem `gpt-4o` e `gpt-4o-mini` com `busca_web`
- **THEN** `modelosDisponiveis.pesquisa` contém exatamente esses dois modelos

#### Scenario: Modelo sem preço
- **WHEN** `gpt-4.1` está em `modelos-capacidades.json` mas não em `precos-modelos.json`
- **THEN** `gpt-4.1` não aparece em nenhum papel

#### Scenario: Modelo fora da lista
- **WHEN** a interface envia `POST /api/orcamento` com `{ "modelos": { "redacao": "gpt-9-fantasia" } }`
- **THEN** a resposta é HTTP 400 com a mensagem do erro e `uso.modelosEscolhidos` não muda

#### Scenario: Papel desconhecido
- **WHEN** a interface envia `{ "modelos": { "traducao": "gpt-4o" } }`
- **THEN** a resposta é HTTP 400 e nada é alterado

#### Scenario: Escolha que deixou de ser permitida
- **WHEN** o `uso.json` guarda um modelo que foi removido da tabela de preços
- **THEN** a chamada ignora a escolha, usa a resolução do perfil, o log registra um aviso e o painel indica que a escolha é inválida

### Requirement: Resolução única do modelo
O modelo efetivo de cada papel SHALL ser resolvido por uma única função, usada pela chamada à OpenAI, pela estimativa prévia, pela chave do cache de pesquisa e pelo painel. A escolha do usuário SHALL ter a maior prioridade; sem ela, a resolução existente SHALL valer sem alteração. O modelo registrado em cada `generation` e no `geracao_log.json` SHALL ser o efetivamente usado.

#### Scenario: Estimativa usa o modelo escolhido
- **WHEN** o usuário escolhe `gpt-4o` para `redacao` e a interface pede a estimativa da etapa de conteúdo
- **THEN** a estimativa é calculada com o preço do `gpt-4o`

#### Scenario: Cache de pesquisa por modelo
- **WHEN** o usuário troca o modelo de `pesquisa` de `gpt-4o` para `gpt-4o-mini` e repete a mesma pesquisa
- **THEN** a chave do cache muda, a pesquisa é executada de novo e a do `gpt-4o` continua guardada

#### Scenario: Papel sem nome de chamada
- **WHEN** uma chamada não tem papel conhecido (nome genérico)
- **THEN** o modelo da skill vale, como antes

### Requirement: Escolha preservada na degradação de perfil
A descida automática de perfil por alerta de orçamento SHALL NOT alterar nem remover `uso.modelosEscolhidos`. O estado SHALL informar, por papel, o modelo efetivo e a origem (`usuario` ou `perfil`), e o painel SHALL indicar quando o modelo está fixado pelo usuário.

#### Scenario: Degradação com modelo fixado
- **WHEN** o usuário fixou `gpt-4o` em `redacao` e o orçamento atinge o alerta, descendo o perfil de Padrão para Econômico
- **THEN** `redacao` continua em `gpt-4o`, a origem informada é `usuario` e o painel mostra que o modelo está fixado

### Requirement: Aviso ao trocar o modelo com o projeto em andamento
Quando a troca de um modelo ocorrer num projeto que já tem gasto registrado, a resposta de `POST /api/orcamento` SHALL incluir um aviso de que o conteúdo anterior usou outro modelo e de que a calibração da estimativa pode misturar modelos. O aviso SHALL NOT bloquear a troca.

#### Scenario: Troca depois de gerar conteúdo
- **WHEN** o projeto tem US$ 0,30 de gasto e o usuário troca o modelo de `redacao`
- **THEN** a resposta é bem-sucedida e traz o aviso de mistura de modelos

#### Scenario: Troca em projeto novo
- **WHEN** o projeto não tem gasto e o usuário troca o modelo
- **THEN** a resposta não traz o aviso
