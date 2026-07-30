## Purpose

Padronizar rotas consumidas via `EventSource` para entregar recusas de
pré-condição como um evento SSE de erro (sempre HTTP 200), em vez de um
status HTTP 4xx, preservando as mensagens já existentes.

## Requirements

### Requirement: Recusa de pré-condição em rota SSE é entregue como evento SSE
Toda rota consumida via `EventSource` que recuse a requisição por pré-condição não satisfeita SHALL responder com status 200, `Content-Type: text/event-stream`, um único evento `{"type":"error","message":"<motivo>"}` e o encerramento do stream. A rota SHALL NOT responder com status HTTP 4xx nesse caso.

#### Scenario: Qualidade sem conteúdo gerado
- **WHEN** `GET /api/qualidade` é chamado com sessão sem conteúdo da Etapa 5
- **THEN** a resposta tem status 200, `Content-Type` contém `text/event-stream` e o corpo contém um evento `data:` com `"type":"error"` e a mensagem "Conclua ao menos a Etapa 5 antes de gerar o relatório de qualidade."

#### Scenario: Revisão de qualidade sem conteúdo
- **WHEN** `GET /api/revisao-qualidade` é chamado com sessão sem conteúdo
- **THEN** a resposta é 200 + evento `error` com a mensagem "Conclua a Etapa 5 antes de gerar a revisão de qualidade."

#### Scenario: Slides sem parâmetros aprovados
- **WHEN** `GET /api/slides/gerar` é chamado sem que `POST /api/slides/parametros` tenha aprovado quantidade/observação da aula antes
- **THEN** a resposta é 200 + evento `error` com a mensagem "Nenhum parâmetro de slides aprovado. Monte e confirme os parâmetros da aula antes de gerar."

Nota: a checagem de estilo visual ausente (`sess.estiloVisual`) migrou para
`GET /api/slides/parametros`, uma rota `fetch`/JSON comum — hoje responde
400 (ver "Rotas não-SSE mantêm recusa HTTP convencional" abaixo), não mais
um evento SSE.

### Requirement: Mensagens de pré-condição preservadas
As mensagens exibidas ao usuário nas recusas SHALL permanecer idênticas às previamente retornadas no campo `error` do JSON 400 correspondente.

#### Scenario: Comparação com o texto original
- **WHEN** qualquer uma das recusas de pré-condição convertidas para SSE é acionada (ex.: `/api/qualidade`, `/api/revisao-qualidade`, `/api/slides/gerar`, `/api/roteiro/gerar`, `/api/video-avatar/roteiro/gerar`, `/api/video-avatar/gerar`, entre outras)
- **THEN** o campo `message` do evento SSE é byte a byte igual ao antigo campo `error` do JSON que a rota retornava antes de adotar o contrato SSE

### Requirement: Rotas não-SSE mantêm recusa HTTP convencional
Rotas consumidas via `fetch` (POST) SHALL continuar recusando pré-condições com status 4xx e corpo JSON `{error}`.

#### Scenario: POST com campo obrigatório ausente
- **WHEN** `POST /api/carregar-projeto` é chamado sem o campo `pasta`
- **THEN** a resposta é 400 com JSON contendo `error`
