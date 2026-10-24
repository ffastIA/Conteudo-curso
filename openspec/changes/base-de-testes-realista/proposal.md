## Why

O mock da OpenAI não tem `AuthenticationError`, `BadRequestError` nem `RateLimitError`, não simula a Responses API nem valida parâmetros, e não produz `finish_reason: 'length'` (achado B6); por isso a regressão do commit `dbc35cc` (`web_search_options` em modelo sem suporte) passou despercebida. Além disso, `isRetriable` usa `instanceof OpenAI.AuthenticationError`, que no mock é `undefined`, causando `TypeError` se esse caminho for exercitado. O trecho de `/api/search` (linhas ~2294-2392) não tem teste (achado A8). Resolve parcialmente **G07**.

## What Changes

- Mock da OpenAI: `AuthenticationError`, `BadRequestError`, `RateLimitError` (com `headers`), `responses.create` com ferramenta `web_search`, texto de saída, anotações `url_citation` e eventos de streaming.
- Validação de parâmetros como a API real: rejeitar `web_search_options` em modelos que não sejam `*-search-preview` (ou a regra confirmada na Fase 0).
- Respostas com `finish_reason: 'length'` configuráveis.
- Gate de cobertura sobe de 40% para 60% após a pesquisa-web-real e para 70% no fim do plano; `/api/search` entra na cobertura.
- `scripts/smoke-pesquisa.js` documentado como verificação real antes de releases que toquem a Etapa 2.
- Reexecução da linha de base (2 cursos) ao fim de cada fase.

## Capabilities

### New Capabilities
*(nenhuma)*

### Modified Capabilities
- `test-verification-baseline`: novos requisitos de realismo do mock, cobertura e verificação real (adicionados, sem alterar os existentes).

## Impact

- **`tests/__mocks__/openai.js`**, **`jest.config.js`** (gate), **`tests/integration/`** (novos testes de busca)
- O item "erros no mock" é pré-requisito de `geracao-retomavel` e pode ser antecipado.
- Sem dependência npm nova.

## Non-goals

- Não incluir chamadas reais à API na suíte nem na CI.
- Não perseguir 100% de cobertura; apenas subir o gate ao nível real.

## Gap resolvido

G07 (testes) — parcial.
