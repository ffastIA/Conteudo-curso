## Why

Duas incertezas bloqueiam o restante do plano `Implementacoes231016`: (1) não se sabe se a Etapa 2 realmente faz busca web — o commit `dbc35cc` trocou `gpt-4o-search-preview` por `gpt-4o`, mas `web_search_options` em Chat Completions só é aceito por modelos `*-search-preview` (achados A1/B9); (2) os endpoints v2 de avatares da HeyGen têm sunset em **2026-10-31**, o que quebra a Etapa 10 (achado B3). Resolve parcialmente o **Gap G05**.

## What Changes

- Script manual `scripts/smoke-pesquisa.js` (fora da suíte e da CI) que testa 3 variantes de busca com a chave real: Chat Completions `gpt-4o` + `web_search_options`, Chat Completions `*-search-preview`, Responses API com `web_search`; registra status, presença de `url_citation`, nº de fontes e latência.
- Documento de decisão (`docs/decisoes/pesquisa-api.md`) que define o caminho da change `pesquisa-web-real`.
- `listarAvataresHeygen` migra para `/v3/avatar_groups` se disponível; senão mantém v2 com aviso na UI e aceita `avatarId` digitado manualmente.
- Linha de base de 2 cursos de referência (um técnico, um infantil): tamanho das aulas, nº de fontes, aulas truncadas, nota média.

## Capabilities

### New Capabilities
- `research-api-verification`: verificação manual e registrada da API de busca web.
- `heygen-avatar-listing`: listagem de avatares resiliente ao sunset da v2.

### Modified Capabilities
*(nenhuma)*

## Impact

- **`scripts/smoke-pesquisa.js`** (novo), **`docs/decisoes/`** e **`docs/baseline/`** (novos)
- **`server.js`**: `listarAvataresHeygen` (~1149) e rota de avatares
- **`public/app.js` / `public/index.html`**: aviso e campo manual de `avatarId` na Etapa 10
- Nenhuma dependência npm nova (SDK `openai` 4.104.0 já expõe `responses`).

## Non-goals

- Não trocar a chamada de pesquisa do `/api/search` (é a change `pesquisa-web-real`).
- Não incluir o smoke test na suíte Jest nem na CI.
- Não automatizar a linha de base além de salvar os artefatos dos 2 cursos.
