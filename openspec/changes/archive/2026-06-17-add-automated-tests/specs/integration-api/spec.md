## ADDED Requirements

### Requirement: POST /api/config valida campos obrigatórios
O endpoint `POST /api/config` SHALL retornar `400` com `{ error: string }` quando campos obrigatórios estiverem ausentes, e `200` quando todos estiverem presentes.

#### Scenario: payload completo retorna 200
- **WHEN** `POST /api/config` é chamado com `nome`, `publico`, `carga`, `nivel`, `objetivos`, `modalidade`, `proporcaoTeoricoPratico` preenchidos
- **THEN** o servidor responde com status `200` e corpo `{ ok: true }`

#### Scenario: campo obrigatório ausente retorna 400
- **WHEN** `POST /api/config` é chamado sem o campo `modalidade`
- **THEN** o servidor responde com status `400` e corpo contendo `error`

### Requirement: GET /api/bncc retorna itens por nível
O endpoint `GET /api/bncc` SHALL retornar `{ itens: [...] }` com os dados estáticos correspondentes ao parâmetro `nivel` ou `tipo=competencias`.

#### Scenario: busca por nível ef1
- **WHEN** `GET /api/bncc?nivel=ef1` é chamado sem sessão prévia de config
- **THEN** o servidor responde com status `200` e `itens` com ao menos 1 elemento do EF1

#### Scenario: busca por competências de adultos
- **WHEN** `GET /api/bncc?tipo=competencias` é chamado
- **THEN** o servidor responde com status `200` e `itens` contendo C2 e C5

#### Scenario: nível inválido retorna 400
- **WHEN** `GET /api/bncc?nivel=invalido` é chamado
- **THEN** o servidor responde com status `400`

### Requirement: POST /api/bncc/selecionar persiste seleção na sessão
O endpoint `POST /api/bncc/selecionar` SHALL persistir `{ publico, nivel, itens }` na sessão do cookie e retornar `200`.

#### Scenario: seleção válida salva na sessão
- **WHEN** `POST /api/bncc/selecionar` é chamado com `{ publico: "basica", nivel: "ef1", itens: [{ id: "1", codigo: "EF04LP01", descricao: "..." }] }`
- **THEN** o servidor responde com status `200` e `{ ok: true }`

#### Scenario: payload sem itens retorna 400
- **WHEN** `POST /api/bncc/selecionar` é chamado com `itens: []`
- **THEN** o servidor responde com status `400`

### Requirement: POST /api/export/:step gera arquivo .docx
Os endpoints `POST /api/export/{ementa,planoEnsino,planoAula,qualidade,ppc}` SHALL retornar o arquivo binário `.docx` ou JSON `{ saved: true, path }` quando a sessão tiver o artefato correspondente.

#### Scenario: export sem sessão retorna 400
- **WHEN** `POST /api/export/ementa` é chamado sem sessão ou sem ementa gerada
- **THEN** o servidor responde com status `400`

#### Scenario: export com artefato na sessão retorna docx ou path
- **WHEN** a sessão contém uma `ementa` e `POST /api/export/ementa` é chamado
- **THEN** o servidor responde com status `200` e `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document` OU com JSON `{ saved: true }`
