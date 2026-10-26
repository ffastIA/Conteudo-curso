# heygen-avatar-listing Specification

## Purpose
TBD - created by archiving change verificacao-pesquisa-e-prazos. Update Purpose after archive.
## Requirements
### Requirement: Listagem de avatares resiliente ao sunset da API v2
`listarAvataresHeygen` SHALL listar somente os avatares do usuário pelo endpoint v3 `GET /v3/avatars/looks` com `ownership=private`, seguindo a paginação (`has_more`, `next_token`), e SHALL NOT chamar nenhum endpoint v2. Cada item SHALL ser devolvido como `id`, `name`, `avatar_type` e `preview_image_url`. Looks cujo `status` exista e não seja `completed` SHALL ser omitidos. O filtro `HEYGEN_AVATAR_IDS`, quando definido, SHALL continuar valendo. A resposta de `GET /api/heygen/avatares` SHALL conter `avatares` e SHALL NOT conter o campo `legado`.

#### Scenario: Listagem pela v3
- **WHEN** `/v3/avatars/looks?ownership=private` responde 200 com dois looks
- **THEN** a rota devolve os dois avatares e nenhum endpoint v2 é chamado

#### Scenario: Paginação
- **WHEN** a primeira página tem `has_more: true` e `next_token`
- **THEN** a segunda página é buscada com `token` e os avatares das duas aparecem

#### Scenario: Look ainda em processamento
- **WHEN** um look vem com `status: "processing"`
- **THEN** ele não aparece na lista

#### Scenario: Filtro por ambiente
- **WHEN** `HEYGEN_AVATAR_IDS` lista um subconjunto de ids
- **THEN** só esses avatares são devolvidos

### Requirement: Entrada manual de avatarId
A Etapa 10 SHALL aceitar `avatarId` digitado manualmente quando a listagem falhar, de modo que a geração de vídeo nunca seja bloqueada pela listagem.

#### Scenario: Listagem falha
- **WHEN** a chamada à v3 retorna erro HTTP
- **THEN** a rota responde 500 com a mensagem do erro, a UI mostra o campo de `avatarId` manual e a geração prossegue com o valor informado

