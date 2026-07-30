## ADDED Requirements

### Requirement: Erro claro quando HEYGEN_API_KEY não está configurada
O sistema SHALL verificar, antes de qualquer chamada de rede à API do HeyGen, se a variável de ambiente `HEYGEN_API_KEY` está definida e não vazia, e SHALL retornar um erro citando explicitamente o nome da variável e apontando para `.env.example` quando ela estiver ausente — em vez de deixar a chamada prosseguir e falhar com um erro genérico de autenticação da API do HeyGen.

#### Scenario: HEYGEN_API_KEY ausente ao listar avatares ou vozes
- **WHEN** o usuário aciona `GET /api/heygen/avatares` ou `GET /api/heygen/vozes` com `HEYGEN_API_KEY` ausente ou vazia no `.env`
- **THEN** o sistema responde com um erro citando `HEYGEN_API_KEY` e `.env.example`, sem chegar a chamar a API do HeyGen

#### Scenario: HEYGEN_API_KEY ausente ao gerar o vídeo
- **WHEN** o usuário aciona `GET /api/video-avatar/gerar` com `HEYGEN_API_KEY` ausente ou vazia no `.env`
- **THEN** o evento SSE `error` cita `HEYGEN_API_KEY` e `.env.example`, e nenhum arquivo `.mp4` é gerado

#### Scenario: HEYGEN_API_KEY presente segue o fluxo normal
- **WHEN** `HEYGEN_API_KEY` está definida e não vazia
- **THEN** o sistema chama a API do HeyGen normalmente, sem nenhuma mudança de comportamento em relação ao existente
