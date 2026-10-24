# Decisão: API de pesquisa web (Etapa 2)

Data: 2026-10-24 — verificação real com `scripts/smoke-pesquisa.js` (dados em `pesquisa-api.json`).

## Resultado

| Variante | Status | Citações | Fontes / domínios | Latência | Resultado |
|---|---|---|---|---|---|
| Chat Completions `gpt-4o` + `web_search_options` | 400 | 0 | 0 / 0 | 2,0 s | rejeitada |
| Chat Completions `gpt-4o-search-preview` + `web_search_options` | 404 | 0 | 0 / 0 | 0,6 s | rejeitada |
| Responses API `gpt-4o` + `web_search` | 200 | 15 | 11 / 9 | 11,2 s | **web** |

Mensagens da API:
- `gpt-4o` + `web_search_options`: `400 Web search options not supported with this model.`
- `gpt-4o-search-preview`: `404 The model gpt-4o-search-preview has been deprecated`.

## Decisão

- **Caminho da change `pesquisa-web-real`:** Responses API com `tools: [{ type: 'web_search' }]`.
- **`OPENAI_RESEARCH_MODEL` padrão:** `gpt-4o`.
- A chamada atual (`chat.completions` + `web_search_options` com `gpt-4o`) está quebrada: a Etapa 2 retorna 400, que `isRetriable` trata como não repetível, e a Etapa 6 (aplicar melhorias, `server.js` ~3666) usa o mesmo parâmetro e sofre o mesmo problema. O modelo `gpt-4o-search-preview` foi descontinuado (404), então voltar a ele não é opção.

## Impacto

- `pesquisa-web-real` deve cobrir também a chamada de `streamSkillToClient` com `skill.web_search_options` (conteúdo e melhorias).
- O mock da OpenAI deve rejeitar `web_search_options` com `gpt-4o` (change `base-de-testes-realista`).
- Latência ~11 s por consulta: considerar nas estimativas de tempo da pesquisa em 3–5 consultas e por módulo.
