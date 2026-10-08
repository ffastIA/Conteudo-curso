## ADDED Requirements

### Requirement: Persistência da última pasta escolhida
O sistema SHALL gravar em disco, no servidor, o caminho da última pasta escolhida em `GET /api/escolher-pasta` sempre que o usuário confirmar uma seleção, e SHALL iniciar o diálogo nativo nessa pasta nas aberturas seguintes, inclusive após reinício do servidor. O caminho SHALL ser repassado ao PowerShell por variável de ambiente do processo filho (nunca interpolado no texto do script). Se a pasta lembrada não existir mais, o diálogo SHALL abrir como antes (raiz do usuário). Falhas ao ler ou gravar a persistência SHALL ser registradas no log e SHALL NOT impedir o funcionamento do seletor. O arquivo de persistência SHALL poder ser redirecionado pela variável de ambiente `ULTIMA_PASTA_FILE` e SHALL ser ignorado pelo controle de versão.

#### Scenario: Seleção grava a pasta
- **WHEN** o usuário escolhe uma pasta no diálogo aberto por `GET /api/escolher-pasta`
- **THEN** o servidor retorna `{ pasta }` e grava essa pasta no arquivo de persistência

#### Scenario: Próxima abertura inicia na última pasta
- **WHEN** existe uma pasta lembrada que ainda existe no disco e o cliente chama `GET /api/escolher-pasta`
- **THEN** o processo do diálogo recebe essa pasta como pasta inicial e o diálogo abre selecionando-a

#### Scenario: Cancelamento não altera a pasta lembrada
- **WHEN** o usuário cancela o diálogo
- **THEN** o servidor retorna `{ pasta: null }` e o arquivo de persistência permanece inalterado

#### Scenario: Pasta lembrada não existe mais
- **WHEN** a pasta lembrada foi removida ou renomeada
- **THEN** o diálogo abre sem pasta inicial, como antes, sem erro

#### Scenario: Persistência ilegível ou não gravável
- **WHEN** o arquivo de persistência está corrompido, ausente ou não pode ser gravado
- **THEN** o seletor continua funcionando normalmente e o problema é apenas registrado no log

#### Scenario: Ambos os botões compartilham a pasta lembrada
- **WHEN** o usuário escolhe uma pasta por "Selecionar pasta do projeto" e depois clica em "Procurar..." na Etapa 1
- **THEN** o segundo diálogo abre na pasta escolhida anteriormente
