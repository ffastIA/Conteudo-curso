# Tasks: teto-tokens-e-historico-uso

## 1. Teto de tokens

- [x] 1.1 Constante `MAX_TOKENS_AULA = 10_000` em `server.js`; aplicar nos dois ramos de `streamSkillToClient` (web-search substitui 16000; streaming não tinha limite)
- [x] 1.2 Capturar `finish_reason`/completion_tokens no parâmetro `meta` nos dois ramos; aviso SSE `warning` também no ramo streaming

## 2. Histórico de tokens por projeto

- [x] 2.1 Helpers `acumulaTokenUsage` (puro, exportado), `readTokenUsage`, `persistTokenUsage` (`scr/token_usage.json`, tolerante a corrupção)
- [x] 2.2 `addUsage(usage, sess)` retrocompatível com guard de projeto identificável; passar `sess` nos ~18 call sites e em `streamSkillToClient(res, skill, sess, meta)`
- [x] 2.3 `GET /api/tokens` inclui campo `projeto`; `refreshTokenCounter` exibe "sessão · projeto: N"

## 3. Guarda de truncamento nas melhorias

- [x] 3.1 Helper exportado `isRespostaMelhoriasCompleta(texto, finishReason)`
- [x] 3.2 Loop de melhorias: log por aula, 1 continuação encadeando a resposta parcial (assistant + instrução com âncora dos últimos 200 chars), revalidação
- [x] 3.3 Falha final → preservar conteúdo anterior (sem persistir), aviso SSE, linha no relatório, `similaridade: 1, truncada: true` (exclui do realinhamento)

## 4. Testes e documentação

- [x] 4.1 `tests/unit/token-usage.test.js`: acumulação (mesmo dia, dias distintos, corrompido, usage vazio) + completude (length, sem seção, com seção, sem finish)
- [x] 4.2 `npx jest` completo verde + `node --check`
- [x] 4.3 `PROJECT.md`/`specs.yaml`: documentar teto e histórico
- [ ] 4.4 E2E manual (servidor REINICIADO — obrigatório): ciclo de melhorias com logs `finish=` por aula; `scr/token_usage.json` crescendo; contador da UI com acumulado do projeto; aulas terminando com `### Melhorias Aplicadas`
- [ ] 4.5 Restaurar conteúdo truncado do episódio anterior a partir de `scr/ciclo_NNN/` do projeto do usuário (manual)
