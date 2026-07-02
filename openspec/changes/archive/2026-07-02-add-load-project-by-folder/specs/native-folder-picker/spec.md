## ADDED Requirements

### Requirement: Seletor nativo de pasta via servidor local
O sistema SHALL fornecer um endpoint `GET /api/escolher-pasta` que abre um diálogo nativo de seleção de pasta do Windows no processo do servidor e retorna ao cliente o caminho absoluto escolhido pelo usuário. Este mecanismo SHALL depender apenas de ferramentas já presentes no Windows (PowerShell e `System.Windows.Forms`), sem exigir novas dependências npm.

#### Scenario: Usuário escolhe uma pasta
- **WHEN** o cliente chama `GET /api/escolher-pasta` e o usuário seleciona uma pasta no diálogo nativo exibido
- **THEN** o servidor retorna `{ pasta: "<caminho absoluto escolhido>" }`

#### Scenario: Usuário cancela o diálogo
- **WHEN** o cliente chama `GET /api/escolher-pasta` e o usuário fecha/cancela o diálogo sem escolher nada
- **THEN** o servidor retorna `{ pasta: null }`

#### Scenario: Diálogo nativo indisponível
- **WHEN** o processo PowerShell falha, expira (timeout) ou não está disponível no sistema
- **THEN** o servidor retorna um erro claro (`{ error: "..." }`) sem travar a requisição indefinidamente
- **THEN** o cliente mantém o campo de texto correspondente editável manualmente, sem bloquear o fluxo do usuário

### Requirement: Constraint de uso local (mesma máquina)
Este mecanismo SHALL ser usado apenas em cenários onde o servidor e o navegador do usuário rodam na mesma máquina (uso local, sem autenticação/deploy remoto), já que o diálogo nativo é exibido no desktop de onde o processo do servidor está rodando.

#### Scenario: Documentação da constraint
- **WHEN** o endpoint `GET /api/escolher-pasta` é implementado
- **THEN** essa constraint de arquitetura está documentada no design da capability, vinculada ao gap conhecido de ausência de autenticação (G02)
