## Context

`/api/conteudo` gera cada aula em uma única chamada em streaming limitada por `MAX_TOKENS_AULA=16_000`. O ciclo de melhorias já usa seções fixas (`parseSecoesFixas`, `mergeSecoesConteudo`) e continuação por `finish_reason` apenas em `/api/aplicar-melhorias/confirmar`.

## Goals / Non-Goals

**Goals:** 0 aulas truncadas; 100% das seções planejadas; tamanho médio ≥ 2× a linha de base; Jaccard entre aulas < 55%.
**Non-Goals:** paralelismo; mudar a rubrica de avaliação.

## Decisions

- **D1**: roteiro da aula em JSON validado; falha de parse → 1 retentativa e depois fallback para geração de passada única com completude mecânica.
- **D2**: títulos de seção vêm do roteiro e se tornam a lista fixa de seções, compatível com `parseSecoesFixas`.
- **D3**: continuação reutiliza a lógica de `MAX_CONTINUACOES_MELHORIA`, extraída para helper `gerarComContinuacao`.
- **D4**: estado da aula em `projeto.json`: `completa | curta | incompleta`; `.partial.txt` só para incompletas.
- **D5**: metas de palavras: mínimo = 80% da meta da seção; abaixo disso, passada de expansão apenas naquela seção.
- **D6**: `OPENAI_CONTENT_MODEL` centralizado em constante `MODEL_CONTENT` (config de modelos).

- **D7**: `CONTEUDO_MODO=unico` mantém a passada única (legado/rollback) com a mesma continuação e verificação de completude; o padrão é `secoes`. Os testes herdados de `/api/conteudo` rodam em `unico` (`tests/setup-env.js`).
- **D8**: lógica pura (roteiro, metas, completude) em `conteudo-secoes.js`; síntese sempre por último; referências só entram com a change `conteudo-fundamentado-em-pesquisa`.
- **D9**: aula incompleta bloqueia por middleware as rotas que dependem do conteúdo (qualidade, ppc, revisão, melhorias, slides, vídeo); regeneração por `GET /api/conteudo?aulas=N`. Aula já incompleta não gasta chamadas de expansão.

## Risks / Trade-offs

- Mais chamadas por aula → custo/tempo maiores; mitigado por estimativa e espera adaptativa.
- Perda de coesão entre seções → resumo das anteriores no prompt, roteiro na 1ª passada, checagem global na avaliação.
- Projetos antigos sem estado → ausente = `completa` (`fonte: 'legado'`).
