## Context

Os números divergentes foram verificados no código: handlers `app.get/post/...` ≈ 41 em `server.js`; cookie `sessionId` (`server.js:182,209`); `npm test` = 27 suítes e 317 testes; `PROJECT.md:75,89,282,377` e `openspec/config.yaml:11,37` citam valores antigos.

## Goals / Non-Goals

**Goals:** documentação verificável contra o código; atualização como último passo de cada change.
**Non-Goals:** documentação gerada automaticamente.

## Decisions

- **D1**: contagem de endpoints por comando reproduzível documentado no próprio `PROJECT.md` (grep dos handlers) em vez de número solto.
- **D2**: número de testes referenciado como "ver `npm test`" mais o valor da data da atualização.
- **D3**: novos gaps G11–G13 acrescentados à tabela de gaps com status e change relacionada.

## Risks / Trade-offs

- Números voltam a divergir → registrar o comando de verificação ao lado do número.
