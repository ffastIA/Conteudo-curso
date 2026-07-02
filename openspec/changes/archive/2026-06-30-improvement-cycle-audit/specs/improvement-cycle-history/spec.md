## ADDED Requirements

### Requirement: Persistência de observações do revisor em disco
O sistema SHALL gravar as observações extraídas do `.docx` em `scr/observacoes_pendentes.json` imediatamente após a extração em `POST /api/aplicar-melhorias`, antes de qualquer confirmação do usuário. O arquivo SHALL ser sobrescrito a cada novo upload, refletindo sempre as observações da rodada mais recente.

#### Scenario: Upload com observações identificadas
- **WHEN** o usuário envia um `.docx` válido com seções "Observações do Revisor" preenchidas
- **THEN** o sistema grava `scr/observacoes_pendentes.json` com `{ dataUpload: ISO8601, aulas: [{ titulo, observacoes }] }`
- **THEN** o arquivo é persistido antes de retornar a resposta JSON ao frontend

#### Scenario: Upload com observações vazias
- **WHEN** o `.docx` não contém observações preenchidas
- **THEN** `observacoes_pendentes.json` é gravado com `observacoes: ""` em todas as aulas
- **THEN** o comportamento do endpoint é idêntico ao atual (sem observações)

#### Scenario: Falha ao gravar observacoes_pendentes.json
- **WHEN** ocorre erro de I/O ao gravar o arquivo (ex.: permissão negada)
- **THEN** o erro é logado silenciosamente
- **THEN** o fluxo continua normalmente — a falha de persistência não bloqueia o upload

---

### Requirement: Snapshot de conteúdo anterior por ciclo de melhoria
O sistema SHALL criar um snapshot imutável do conteúdo de todas as aulas e das observações que guiaram o ciclo antes de sobrescrever qualquer arquivo em `GET /api/aplicar-melhorias/confirmar`. Cada ciclo SHALL ser armazenado em `scr/ciclo_{NNN}/` onde NNN é o número sequencial do ciclo com zero-padding de 3 dígitos.

#### Scenario: Criação do snapshot no início do ciclo
- **WHEN** o usuário confirma a aplicação de melhorias
- **THEN** o sistema determina o número do próximo ciclo contando subpastas `ciclo_NNN` existentes em `scr/`
- **THEN** cria `scr/ciclo_{NNN}/` e copia cada `aula{NN}_conteudo.txt` atual para dentro
- **THEN** grava `scr/ciclo_{NNN}/observacoes.json` com o conteúdo de `sess.observacoesMelhorias`
- **THEN** somente então inicia o loop de processamento das aulas

#### Scenario: Falha na criação do snapshot
- **WHEN** ocorre erro ao criar o diretório ou copiar arquivos do snapshot
- **THEN** o erro é logado mas o ciclo de melhorias prossegue normalmente
- **THEN** o snapshot faltante é indicado no log mas não bloqueia o usuário

#### Scenario: Múltiplos ciclos executados
- **WHEN** o usuário executa o ciclo N vezes
- **THEN** existem N subpastas `ciclo_001/`, `ciclo_002/`, ... `ciclo_{NNN}/` em `scr/`
- **THEN** cada subpasta contém o estado do conteúdo imediatamente antes daquele ciclo

---

### Requirement: Métricas de mudança por ciclo
O sistema SHALL calcular a similaridade Jaccard entre o conteúdo antigo e novo de cada aula após a aplicação de melhorias e registrar essas métricas em `scr/ciclo_{NNN}/meta.json`. Quando a similaridade de uma aula superar 90%, o sistema SHALL emitir um evento SSE de aviso informativo.

#### Scenario: Registro de métricas ao final de cada aula
- **WHEN** o novo conteúdo de uma aula é gerado
- **THEN** o sistema calcula `similaridade = textSimilarity(textoAntigo, textoNovo)`
- **THEN** registra `{ aulaIndex, titulo, similaridade }` na lista de métricas do ciclo

#### Scenario: Aviso de conteúdo pouco alterado
- **WHEN** a similaridade Jaccard entre o conteúdo antigo e novo de uma aula é > 0.90 (90%)
- **THEN** o sistema emite evento SSE `{ type: 'progress', message: 'Aula N: conteúdo pouco alterado (XX% similar ao original) — verifique se as observações foram aplicadas' }`
- **THEN** o processamento continua normalmente (o aviso é informativo, não blocante)

#### Scenario: Gravação de meta.json ao final do ciclo
- **WHEN** todas as aulas do ciclo são processadas
- **THEN** o sistema grava `scr/ciclo_{NNN}/meta.json` com:
  `{ ciclo, dataHora: ISO8601, totalAulas, totalComObservacoes, similaridadeMedia, similaridadePorAula: [{ aulaIndex, titulo, similaridade }] }`
