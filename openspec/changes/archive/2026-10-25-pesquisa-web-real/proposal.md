## Why

A Etapa 2 pode estar sem busca web real (`gpt-4o` + `web_search_options`), é rasa (`max_tokens: 2000`, uma única consulta, "tendências 2024-2025" fixo) e, quando a busca falha, o fallback grava texto de memória como `pesquisa.txt`, indistinguível de pesquisa real (achados A1, A3, B5 parcial, B9). Resolve o **Gap G05** (confiabilidade) para a pesquisa.

## What Changes

- Nova função `executarPesquisaWeb(consulta, opcoes)` baseada no caminho provado em `verificacao-pesquisa-e-prazos` (padrão esperado: Responses API com `web_search`), com streaming nativo, `max_output_tokens` 6.000, timeout 90 s e até 2 retentativas.
- Modelo configurável por `OPENAI_RESEARCH_MODEL`, validado na inicialização.
- Etapa 2 executa 3 a 5 consultas planejadas; ano via `new Date().getFullYear()`; prompt pede fontes primárias.
- Três estados da pesquisa: `web`, `sem_web`, `falhou`. Resposta sem `url_citation` conta como falha; mínimo de 3 fontes em 2 domínios.
- Fallback para `gpt-4o-mini` deixa de ser automático: exige decisão explícita do usuário e grava `fonte: 'modelo_sem_busca'` com selo "sem pesquisa web".
- `scr/pesquisa.json` estruturado (consultas, fontes, achados); `pesquisa.txt` e `pesquisa.docx` continuam e passam a listar fontes com URL.
- `saveProject`, `carregar-projeto` e importar/confirmar preservam `pesquisa.json`; `.docx` reimportado vira `fonte: 'usuario'`.
- `isRetriable` trata erro de parâmetro de busca como configuração inválida, com mensagem clara.

## Capabilities

### New Capabilities
- `web-research`: pesquisa web real, estados, resultado estruturado e selo de origem.

### Modified Capabilities
*(nenhuma — substitui o comportamento da change arquivada/ativa `search-resilience-fix` dentro da nova capability)*

## Impact

- **`server.js`**: `/api/search` (~2290-2392), `tentarPesquisaWeb`, `isRetriable`, `persistStage`, `saveProject`, `carregar-projeto`, importar
- **`skills.js`**: `pesquisaWebSkill`, `pesquisaFallbackSkill`, remoção de `MODEL_RESEARCH` fixo
- **`public/app.js` / `public/index.html`**: botões "tentar novamente" / "continuar sem pesquisa", selo
- **`.env.example`**: `OPENAI_RESEARCH_MODEL`
- Sem dependência npm nova.

## Non-goals

- Não pesquisar por módulo (é `conteudo-fundamentado-em-pesquisa`).
- Não injetar a pesquisa no conteúdo das aulas.
- Verificação de URL por `fetch` é opcional e não bloqueante.
- Não cachear resultados entre cursos.
