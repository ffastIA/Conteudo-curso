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

#### Scenario: Slides sem estilo visual selecionado
- **WHEN** `GET /api/slides` é chamado com conteúdo presente mas sem estilo visual
- **THEN** a resposta é 200 + evento `error` com a mensagem "Escolha um estilo visual antes de gerar os slides."

### Requirement: Mensagens de pré-condição preservadas
As mensagens exibidas ao usuário nas recusas SHALL permanecer idênticas às previamente retornadas no campo `error` do JSON 400 correspondente.

#### Scenario: Comparação com o texto original
- **WHEN** qualquer uma das 6 recusas convertidas é acionada
- **THEN** o campo `message` do evento SSE é byte a byte igual ao antigo campo `error` do JSON

### Requirement: Rotas não-SSE mantêm recusa HTTP convencional
Rotas consumidas via `fetch` (POST) SHALL continuar recusando pré-condições com status 4xx e corpo JSON `{error}`.

#### Scenario: POST com campo obrigatório ausente
- **WHEN** `POST /api/carregar-projeto` é chamado sem o campo `pasta`
- **THEN** a resposta é 400 com JSON contendo `error`
