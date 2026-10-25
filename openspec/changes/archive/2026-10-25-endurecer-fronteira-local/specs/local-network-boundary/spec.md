## ADDED Requirements

### Requirement: Bind padrão em loopback
O servidor SHALL escutar em `127.0.0.1` por padrão e SHALL aceitar a variável `HOST` para alterar o endereço de bind.

#### Scenario: Sem HOST definido
- **WHEN** o servidor inicia sem `HOST`
- **THEN** `app.listen` é chamado com `127.0.0.1`

#### Scenario: HOST definido
- **WHEN** `HOST=0.0.0.0` está no ambiente
- **THEN** o servidor escuta em `0.0.0.0`

### Requirement: Cookie de sessão com SameSite
O cookie `sessionId` SHALL ser emitido com `httpOnly` e `SameSite=Lax`.

#### Scenario: Sessão criada
- **WHEN** uma nova sessão é criada
- **THEN** o `Set-Cookie` contém `HttpOnly` e `SameSite=Lax`

### Requirement: Rota de seed condicionada
A rota `/api/dev/seed` SHALL ser registrada somente quando `ENABLE_DEV_SEED=true`.

#### Scenario: Seed desligado
- **WHEN** `ENABLE_DEV_SEED` não é `true`
- **THEN** `GET /api/dev/seed` responde 404

### Requirement: Verificação de origem em rotas com efeito
As rotas que alteram estado ou consomem crédito de API SHALL rejeitar com 403 requisições cujo `Origin` ou `Host` não seja o do próprio app.

#### Scenario: Origem estranha
- **WHEN** uma requisição POST chega com `Origin: https://outro-site.com`
- **THEN** a resposta é 403 e nenhuma chamada externa é feita

### Requirement: Seletor de pasta restrito a loopback
`/api/escolher-pasta` SHALL responder 403 a requisições cujo IP de origem não seja loopback.

#### Scenario: Requisição remota
- **WHEN** o IP de origem é 192.168.x.x
- **THEN** a resposta é 403

### Requirement: Pastas de projeto validadas
`/api/carregar-projeto` e `pastaProjeto` SHALL aceitar apenas pasta vazia ou que contenha `scr/projeto.json`, e SHALL registrar no log o caminho aceito.

#### Scenario: Pasta arbitrária
- **WHEN** o caminho aponta para uma pasta não vazia sem `scr/projeto.json`
- **THEN** a resposta é 400 com mensagem clara

### Requirement: Limites de upload e expiração de sessão
O upload via `multer` SHALL ter limite de tamanho e tipo (`.docx`), e sessões inativas por mais de 12 horas SHALL ser removidas por limpeza periódica.

#### Scenario: Arquivo grande demais
- **WHEN** o upload excede o limite
- **THEN** a resposta é 4xx sem processar o arquivo

#### Scenario: Sessão inativa
- **WHEN** a sessão passa de 12 h sem acesso e a limpeza executa
- **THEN** a sessão é removida de `sessions`
