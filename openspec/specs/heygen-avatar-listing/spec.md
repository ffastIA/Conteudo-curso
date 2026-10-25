# heygen-avatar-listing Specification

## Purpose
TBD - created by archiving change verificacao-pesquisa-e-prazos. Update Purpose after archive.
## Requirements
### Requirement: Listagem de avatares resiliente ao sunset da API v2
`listarAvataresHeygen` SHALL tentar `/v3/avatar_groups` antes dos endpoints v2 e SHALL cair para v2 apenas quando a v3 retornar 404, preservando o escopo "somente avatares do usuário".

#### Scenario: v3 disponível
- **WHEN** `/v3/avatar_groups` responde 200
- **THEN** a lista de avatares vem da v3 e nenhum endpoint v2 é chamado

#### Scenario: v3 indisponível, v2 ativo
- **WHEN** `/v3/avatar_groups` responde 404 e a v2 responde 200
- **THEN** a lista vem da v2 e a UI exibe aviso de endpoint legado

### Requirement: Entrada manual de avatarId
A Etapa 10 SHALL aceitar `avatarId` digitado manualmente quando a listagem falhar, de modo que a geração de vídeo nunca seja bloqueada pela listagem.

#### Scenario: Listagem falha após o sunset
- **WHEN** v3 e v2 falham
- **THEN** a UI mostra o campo de `avatarId` manual e a geração prossegue com o valor informado

