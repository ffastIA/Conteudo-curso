## ADDED Requirements

### Requirement: Plano de aula retomável
`/api/plano-aula` SHALL gravar `plano_aulaNN.txt` à medida que cada aula termina, consolidar `plano_de_aula.txt` e `.docx` ao final, aplicar `max_tokens` e timeout de inatividade, e retomar de onde parou em uma nova execução.

#### Scenario: Queda no meio
- **WHEN** o servidor cai após 4 de 10 aulas e a etapa é reiniciada
- **THEN** apenas as aulas 5 a 10 são geradas e o consolidado final contém as 10

### Requirement: Conteúdo sem recomeço
`/api/conteudo` SHALL pular aulas já `completa`, e SHALL oferecer a opção explícita "refazer tudo" para regenerar todas.

#### Scenario: Reexecução
- **WHEN** a Etapa 5 é executada com 6 de 10 aulas completas
- **THEN** só as 4 restantes são geradas

#### Scenario: Refazer tudo
- **WHEN** o usuário escolhe "refazer tudo"
- **THEN** todas as aulas são regeneradas

### Requirement: Retomada de polling Gamma e HeyGen
O sistema SHALL gravar `generationId` (Gamma) e `videoId` (HeyGen) em `projeto.json` ao criar a geração, e SHALL retomar o polling com esses ids após queda.

#### Scenario: Retomada após queda
- **WHEN** o servidor reinicia com `videoId` gravado e sem arquivo baixado
- **THEN** o polling continua no mesmo `videoId`, sem criar nova geração

### Requirement: Downloads robustos
Os downloads de `exportUrl` (Gamma) e `videoUrl` (HeyGen) SHALL usar timeout, limite de tamanho e gravação em disco por stream, sem carregar o arquivo inteiro na memória, usando apenas APIs nativas do Node.

#### Scenario: Download lento
- **WHEN** o download excede o timeout
- **THEN** a operação é abortada, o arquivo temporário é removido e um erro SSE é enviado

#### Scenario: Arquivo acima do limite
- **WHEN** o tamanho excede `MAX_DOWNLOAD_BYTES`
- **THEN** o download é interrompido com erro claro

### Requirement: Abort signal propagado
O abort signal do cliente SHALL ser passado às chamadas de score, realinhamento, PPC, metodologia, ementa e estilos visuais.

#### Scenario: Cliente desconecta no PPC
- **WHEN** o cliente fecha a conexão durante a geração do PPC
- **THEN** a chamada à OpenAI é abortada
