## ADDED Requirements

### Requirement: Gate de aceite por score no ciclo de melhorias
Após `mergeSecoesConteudo` produzir o candidato revisado de uma aula (patch já mesclado) e antes de persisti-lo, o sistema SHALL julgar original e candidato de forma pareada (ver `quality-scoring`) e SHALL persistir o candidato somente se `scoreCandidato >= scoreOriginal + 0.02`. Quando o candidato for rejeitado, o sistema SHALL preservar o conteúdo anterior da aula, registrar os dois scores no relatório de melhorias, e a aula SHALL permanecer elegível ao realinhamento de plano quando tiver melhorias pendentes (mesma regra já aplicada a aulas truncadas).

#### Scenario: Candidato aceito por elevar o score
- **WHEN** o julgamento pareado retorna `scoreCandidato = 0.81` e `scoreOriginal = 0.76`
- **THEN** o candidato é persistido normalmente (mesclado no conteúdo, salvo em `aulaNN_conteudo.txt`)

#### Scenario: Candidato rejeitado por não elevar o score o suficiente
- **WHEN** o julgamento pareado retorna `scoreCandidato = 0.77` e `scoreOriginal = 0.76` (delta 0.01, abaixo do limiar de 0.02)
- **THEN** o conteúdo anterior da aula é preservado, o relatório registra "Aula N: melhorias descartadas — score não melhorou (antes 0.76 → depois 0.77)"

#### Scenario: Candidato rejeitado por piorar o score
- **WHEN** o julgamento pareado retorna `scoreCandidato < scoreOriginal`
- **THEN** o conteúdo anterior é preservado (mesmo comportamento do cenário anterior), evitando que uma "melhoria" persista uma regressão de qualidade

#### Scenario: Aula rejeitada por score permanece elegível ao realinhamento de plano
- **WHEN** uma aula tem o candidato de conteúdo rejeitado pelo gate de score mas possui melhorias pendentes
- **THEN** a aula participa normalmente da fase de realinhamento de plano, permitindo que melhorias referentes ao plano de aula sejam aplicadas independente do resultado do gate de conteúdo

#### Scenario: Falha no julgamento pareado não interrompe o ciclo
- **WHEN** a chamada do julgamento pareado falha (erro de rede, resposta malformada)
- **THEN** o sistema registra o erro, trata a aula como não avaliada (mesma politica de preservação do conteúdo anterior) e o ciclo continua para as demais aulas

---

### Requirement: Histórico de scores por ciclo
O sistema SHALL persistir, ao final de cada ciclo de melhorias, um registro em `scr/score_historico.json` contendo `{ ciclo, dataHora, porAula: [{ aula, titulo, scoreOriginal, scoreCandidato, aceita }], ganhoMedio }`, onde `ganhoMedio` é a média de `(scoreCandidato - scoreOriginal)` sobre as aulas avaliadas pelo gate (aulas puladas por truncamento não entram na média). A leitura e escrita SHALL ser tolerante a arquivo ausente ou corrompido.

#### Scenario: Primeiro ciclo de um projeto
- **WHEN** `scr/score_historico.json` não existe
- **THEN** o sistema cria o arquivo com o registro do ciclo atual, sem erro

#### Scenario: Ciclos subsequentes acumulam histórico
- **WHEN** já existe histórico de ciclos anteriores
- **THEN** o novo ciclo é acrescentado à lista, preservando os registros anteriores

#### Scenario: Arquivo corrompido não interrompe o ciclo
- **WHEN** `score_historico.json` contém JSON inválido
- **THEN** o sistema trata como histórico vazio e grava o registro do ciclo atual normalmente

---

### Requirement: Aviso de convergência no upload de revisão anotada
Ao processar o upload de um documento de revisão anotado (`POST /api/aplicar-melhorias`), o sistema SHALL ler `score_historico.json`; se o `ganhoMedio` do último ciclo registrado for menor que 0.02, a resposta SHALL incluir `avisoConvergencia` com o ganho médio e o detalhamento por aula. O frontend SHALL exibir esse aviso no mesmo padrão visual e de confirmação já usado para o aviso de upload duplicado, com opções de aplicar mesmo assim ou cancelar.

#### Scenario: Ganho baixo no último ciclo dispara aviso
- **WHEN** o último ciclo registrado teve `ganhoMedio = 0.01`
- **THEN** a resposta do upload inclui `avisoConvergencia` e o frontend exibe o banner de confirmação

#### Scenario: Ganho suficiente não dispara aviso
- **WHEN** o último ciclo registrado teve `ganhoMedio >= 0.02`
- **THEN** a resposta do upload não inclui `avisoConvergencia`

#### Scenario: Sem histórico, sem aviso
- **WHEN** `score_historico.json` não existe ou está vazio
- **THEN** a resposta do upload não inclui `avisoConvergencia`

---

### Requirement: Seção de scores no relatório de melhorias
O relatório `melhorias_aplicadas_<timestamp>.docx` SHALL incluir uma seção `## Scores do Ciclo` listando, para cada aula avaliada pelo gate, o score antes, o score depois e se o candidato foi aceito ou rejeitado.

#### Scenario: Ciclo com aulas aceitas e rejeitadas
- **WHEN** o ciclo processa 3 aulas, 2 aceitas e 1 rejeitada pelo gate
- **THEN** a seção `## Scores do Ciclo` lista as 3 aulas com seus scores antes/depois e o resultado (aceita/rejeitada) de cada uma
