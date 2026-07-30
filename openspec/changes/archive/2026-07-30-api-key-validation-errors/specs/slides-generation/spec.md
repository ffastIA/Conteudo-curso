## ADDED Requirements

### Requirement: Erro claro quando GAMMA_API_KEY não está configurada
O sistema SHALL verificar, antes de qualquer chamada de rede à API do Gamma, se a variável de ambiente `GAMMA_API_KEY` está definida e não vazia, e SHALL retornar um erro citando explicitamente o nome da variável e apontando para `.env.example` quando ela estiver ausente — em vez de deixar a chamada prosseguir e falhar com um erro genérico de autenticação da API do Gamma.

#### Scenario: GAMMA_API_KEY ausente ao gerar estilos visuais
- **WHEN** o usuário aciona `GET /api/estilos-visuais` (ou qualquer rota que dependa do Gamma) com `GAMMA_API_KEY` ausente ou vazia no `.env`
- **THEN** o sistema responde com um erro citando `GAMMA_API_KEY` e `.env.example`, sem chegar a chamar a API do Gamma

#### Scenario: GAMMA_API_KEY ausente ao gerar slides
- **WHEN** o usuário aciona `GET /api/slides/gerar` com `GAMMA_API_KEY` ausente ou vazia no `.env`
- **THEN** o evento SSE `error` cita `GAMMA_API_KEY` e `.env.example`, e nenhum arquivo `.pptx` é gerado

#### Scenario: GAMMA_API_KEY presente segue o fluxo normal
- **WHEN** `GAMMA_API_KEY` está definida e não vazia
- **THEN** o sistema chama a API do Gamma normalmente, sem nenhuma mudança de comportamento em relação ao existente
