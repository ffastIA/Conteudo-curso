## ADDED Requirements

### Requirement: Endpoints SSE emitem sequência correta de eventos
Todo endpoint SSE SHALL emitir eventos na ordem: um ou mais `progress`, um ou mais `token`, seguido de `done` com o texto completo; ou `error` em caso de falha.

#### Scenario: stream completo emite progress → token → done
- **WHEN** `GET /api/ementa` é chamado com sessão de config válida e o mock OpenAI retorna "texto da ementa"
- **THEN** o stream emite ao menos um evento `progress`, ao menos um evento `token` e termina com um evento `done` contendo `fullText`

#### Scenario: falha na OpenAI emite evento error
- **WHEN** `GET /api/ementa` é chamado e o mock OpenAI lança `new Error("timeout")`
- **THEN** o stream emite um evento `error` com `message` contendo a descrição do erro

### Requirement: GET /api/ementa exige sessão de config
O endpoint `GET /api/ementa` SHALL retornar `400` quando a sessão não tiver config configurada.

#### Scenario: chamada sem config retorna 400
- **WHEN** `GET /api/ementa` é chamado sem `POST /api/config` prévio
- **THEN** o servidor responde com status `400`

### Requirement: GET /api/qualidade exige conclusão da Etapa 5
O endpoint `GET /api/qualidade` SHALL retornar `400` quando a sessão não tiver o conteúdo das aulas (`conteudo`) gerado.

#### Scenario: chamada sem conteúdo retorna 400
- **WHEN** `GET /api/qualidade` é chamado sem que a sessão contenha `conteudo`
- **THEN** o servidor responde com status `400` com mensagem sobre pré-condição

#### Scenario: chamada com sessão completa emite eventos SSE
- **WHEN** a sessão contém config, ementa, planoEnsino, planoAula e conteudo, e `GET /api/qualidade` é chamado
- **THEN** o stream emite ao menos um evento `progress` e termina com `done`

### Requirement: GET /api/ppc exige conclusão da Etapa 5
O endpoint `GET /api/ppc` SHALL retornar `400` quando a sessão não tiver `conteudo` gerado.

#### Scenario: chamada sem conteúdo retorna 400
- **WHEN** `GET /api/ppc` é chamado sem que a sessão contenha `conteudo`
- **THEN** o servidor responde com status `400`

#### Scenario: chamada com sessão completa emite progresso das 4 skills complementares
- **WHEN** a sessão está completa e `GET /api/ppc` é chamado
- **THEN** o stream emite eventos `progress` identificando cada skill (perfil egresso, competências, perfil docente, infraestrutura) antes do evento `done`
