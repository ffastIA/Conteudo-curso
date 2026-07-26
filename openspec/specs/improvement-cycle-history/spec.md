## Purpose

Registrar, para cada ciclo de aplicação de melhorias, snapshots do conteúdo
anterior, métricas de mudança (similaridade Jaccard) e um relatório
timestampado com as melhorias efetivamente aplicadas por aula.

## Requirements

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

---

### Requirement: Relatório de implementações por ciclo com timestamp
Ao final de cada ciclo de aplicação de melhorias, o sistema SHALL gerar um arquivo `melhorias_aplicadas_YYYYMMDD_HHmmss.docx` no `rootDir` do curso, onde o timestamp representa a data e hora local do servidor no momento da geração. O arquivo SHALL conter APENAS os títulos das aulas e as seções `### Melhorias Aplicadas` de cada aula — sem o conteúdo integral reescrito. O arquivo SHALL ser imutável — ciclos subsequentes criam novos arquivos sem sobrescrever os anteriores. Os arquivos `conteudo.docx` e `conteudo.txt` SHALL permanecer sem alteração. Quando a seção `### Melhorias Aplicadas` não for encontrada no output do modelo para uma aula, o relatório SHALL registrar `_(seção não gerada)_` para essa aula.

#### Scenario: Ciclo concluído com sucesso
- **WHEN** o loop de aplicação de melhorias conclui sem erro
- **THEN** o sistema grava `melhorias_aplicadas_YYYYMMDD_HHmmss.docx` em `rootDir`
- **THEN** o arquivo contém para cada aula: o título da aula como cabeçalho `## Aula N: Título` e apenas a seção `### Melhorias Aplicadas`
- **THEN** o arquivo NÃO contém o conteúdo integral reescrito das aulas

#### Scenario: Modelo não gera seção de melhorias para uma aula
- **WHEN** o output do modelo para uma aula não contém `### Melhorias Aplicadas`
- **THEN** o relatório registra `_(seção não gerada)_` para essa aula
- **THEN** o relatório é gerado normalmente para as demais aulas

#### Scenario: Múltiplos ciclos acumulam relatórios distintos
- **WHEN** o usuário executa o ciclo N vezes
- **THEN** existem N arquivos `melhorias_aplicadas_*.docx` em `rootDir`, um por ciclo
- **THEN** nenhum arquivo anterior é sobrescrito

#### Scenario: Falha ao gerar o relatório timestampado
- **WHEN** ocorre erro ao gerar ou gravar o arquivo timestampado
- **THEN** o erro é logado silenciosamente
- **THEN** o ciclo já concluído não é afetado — a resposta SSE permanece intacta

---

### Requirement: Auditoria Jaccard embutida no relatório de ciclo
Quando uma ou mais aulas apresentam similaridade Jaccard > 90% em relação ao ciclo anterior, o relatório timestampado SHALL incluir uma seção `## Auditoria do Ciclo` ao final do documento. Quando **todas** as aulas do ciclo estão acima do limiar, a seção SHALL iniciar com a declaração "Nenhuma nova implementação detectada neste ciclo". A auditoria SHALL ser exclusiva do arquivo timestampado — `conteudo.docx` e `sess.conteudo` não são alterados.

#### Scenario: Todas as aulas sem alteração significativa
- **WHEN** todas as aulas do ciclo têm similaridade Jaccard > 90%
- **THEN** o relatório timestampado inclui `## Auditoria do Ciclo` com "Nenhuma nova implementação detectada neste ciclo"
- **THEN** cada aula afetada é listada com sua porcentagem de similaridade
- **THEN** `conteudo.docx` não contém a seção de auditoria

#### Scenario: Parte das aulas sem alteração significativa
- **WHEN** apenas algumas aulas têm similaridade > 90% (não todas)
- **THEN** o relatório timestampado inclui `## Auditoria do Ciclo` listando somente as aulas afetadas
- **THEN** a mensagem não diz "nenhuma implementação" — apenas lista as aulas com pouca alteração

#### Scenario: Todas as aulas com alterações significativas
- **WHEN** nenhuma aula tem similaridade > 90%
- **THEN** o relatório timestampado não inclui a seção `## Auditoria do Ciclo`
- **THEN** o documento contém apenas o conteúdo das aulas com suas seções "Melhorias Aplicadas"
