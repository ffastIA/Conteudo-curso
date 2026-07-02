## MODIFIED Requirements

### Requirement: Configuração do curso e geração da ementa
O sistema SHALL atualizar `sess.config` com os dados do formulário sempre que `POST /api/config` for chamado, calculando se a ementa precisará ser regenerada: (a) nenhuma ementa existir na sessão, OU (b) ao menos um dos campos pedagógicos (`nome`, `publico`, `carga`, `duracao`, `nivel`, `objetivos`) tiver valor diferente do registrado na sessão antes da atualização. Campos operacionais (`pastaProjeto`, `modalidade`, `proporcaoTeoricoPratico`, `preRequisitos`) SHALL ser atualizados sem marcar necessidade de regeneração. A geração da ementa em si SHALL NOT ocorrer dentro de `POST /api/config` — SHALL ocorrer somente na confirmação da metodologia pedagógica (capability `pedagogical-methodology`, requisito "Confirmação explícita da metodologia definitiva"), usando a metodologia já definitiva nesse momento.

#### Scenario: Primeira configuração do curso
- **WHEN** o usuário submete a Etapa 1 pela primeira vez (sem ementa na sessão)
- **THEN** o sistema atualiza `sess.config` e marca que a ementa precisa ser gerada
- **THEN** `POST /api/config` retorna `{ ok: true }` sem o campo `ementa` (ela ainda não existe)
- **THEN** a ementa só é efetivamente gerada quando a metodologia for confirmada (`POST /api/metodologia/confirmar`)

#### Scenario: Atualização apenas de pastaProjeto
- **WHEN** o usuário submete a Etapa 1 alterando somente o campo "Pasta do projeto"
- **THEN** o sistema atualiza `sess.config.pastaProjeto`
- **THEN** NÃO marca necessidade de regeneração de ementa

#### Scenario: Atualização de campo pedagógico com ementa existente
- **WHEN** o usuário submete a Etapa 1 alterando `nome`, `publico`, `carga`, `duracao`, `nivel` ou `objetivos` de um projeto que já tem ementa
- **THEN** o sistema atualiza `sess.config` e marca que a ementa precisa ser regenerada
- **THEN** a ementa é efetivamente regenerada na próxima confirmação da metodologia, não imediatamente

#### Scenario: Atualização de campos operacionais múltiplos
- **WHEN** o usuário submete a Etapa 1 alterando `modalidade` e `proporcaoTeoricoPratico` sem alterar campos pedagógicos
- **THEN** o sistema atualiza `sess.config` sem marcar necessidade de regeneração de ementa

#### Scenario: Confirmação da metodologia gera a ementa pendente
- **WHEN** a Etapa 1 marcou necessidade de regeneração de ementa e o usuário confirma a metodologia (`POST /api/metodologia/confirmar`)
- **THEN** o sistema gera a ementa via `ementaSkill`, passando a metodologia definitiva como parâmetro
- **THEN** a ementa gerada é persistida em disco junto com a metodologia
