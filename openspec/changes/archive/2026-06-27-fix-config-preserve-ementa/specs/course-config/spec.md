## MODIFIED Requirements

### Requirement: Configuração do curso e geração da ementa
O sistema SHALL atualizar `sess.config` com os dados do formulário sempre que `POST /api/config` for chamado. A ementa SHALL ser regenerada via OpenAI somente se: (a) nenhuma ementa existir na sessão, OU (b) ao menos um dos campos pedagógicos (`nome`, `publico`, `carga`, `duracao`, `nivel`, `objetivos`) tiver valor diferente do registrado na sessão antes da atualização. Campos operacionais (`pastaProjeto`, `modalidade`, `proporcaoTeoricoPratico`, `preRequisitos`) SHALL ser atualizados sem disparar regeneração de ementa.

#### Scenario: Primeira configuração do curso
- **WHEN** o usuário submete a Etapa 1 pela primeira vez (sem ementa na sessão)
- **THEN** o sistema atualiza `sess.config` e gera a ementa via OpenAI
- **THEN** retorna `{ ok: true, ementa: "<texto>" }`

#### Scenario: Atualização apenas de pastaProjeto
- **WHEN** o usuário submete a Etapa 1 alterando somente o campo "Pasta do projeto"
- **THEN** o sistema atualiza `sess.config.pastaProjeto`
- **THEN** NÃO gera nova ementa via OpenAI
- **THEN** retorna `{ ok: true, ementa: "<ementa_existente>" }` com a ementa já existente

#### Scenario: Atualização de campo pedagógico com ementa existente
- **WHEN** o usuário submete a Etapa 1 alterando `nome`, `publico`, `carga`, `duracao`, `nivel` ou `objetivos`
- **THEN** o sistema atualiza `sess.config` e regenera a ementa via OpenAI
- **THEN** retorna `{ ok: true, ementa: "<nova_ementa>" }`

#### Scenario: Atualização de campos operacionais múltiplos
- **WHEN** o usuário submete a Etapa 1 alterando `modalidade` e `proporcaoTeoricoPratico` sem alterar campos pedagógicos
- **THEN** o sistema atualiza `sess.config` sem regenerar a ementa
- **THEN** retorna `{ ok: true, ementa: "<ementa_existente>" }`
