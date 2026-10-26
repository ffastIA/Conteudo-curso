## Why

A governança de custo (change `governanca-de-custo`) passou a medir e limitar o gasto, mas deixou as otimizações de tokens da Fase 1C.5 do plano para uma change própria. Os dados da linha de base `capcut` (3 aulas, `docs/baseline/capcut/geracao_log.json`, custo medido de US$ 0,50 sem a tarifa da busca) mostram onde o gasto está:

| Etapa | Chamadas | Tokens de entrada | Custo | Parte do total |
|---|---|---|---|---|
| Pesquisa geral (`gpt-4o` + busca web) | 4 | 76 mil | US$ 0,234 | 47% |
| Pesquisa por módulo (`gpt-4o` + busca web) | 3 | 57 mil | US$ 0,194 | 39% |
| Conteúdo das aulas (`gpt-4o-mini`) | 21 | 292 mil | US$ 0,051 | 10% |
| Revisão de qualidade | 3 | 53 mil | US$ 0,010 | 2% |
| Planos, metodologia | 7 | 37 mil | US$ 0,008 | 1% |

A pesquisa web é 86% do custo, e cada chamada de busca gasta cerca de 19 mil tokens de entrada, quase todos do conteúdo das páginas lidas. Acrescentando a tarifa da ferramenta (US$ 0,01 por chamada, 7 chamadas), a pesquisa passa de 87%. Otimizar a revisão (2%) ou as chamadas pequenas quase não muda o total. Por isso esta change prioriza o que tem peso e deixa de fora o que não compensa.

## What Changes

- **Cache de pesquisa (`research-cache`):** o resultado de cada consulta de pesquisa web é guardado em disco, com chave igual ao hash do prompt final, do modelo e dos parâmetros da ferramenta. Repetir a mesma consulta com a mesma entrada (reexecutar a etapa, refazer o curso, retomar após falha) custa zero e mostra a data do resultado. Validade padrão de 30 dias.
- **Cache de prompt (`prompt-caching`):** nas skills chamadas várias vezes por aula, o conteúdo estável (instruções, plano, ementa, dossiê) vem primeiro e o variável (seção atual, resumo do que foi escrito) vem por último, para aproveitar o desconto automático de prefixos repetidos da OpenAI. O app passa a registrar os tokens em cache de cada chamada.
- **Cobrança de tokens em cache (`cost-estimation`):** o cálculo do custo aplica o preço de entrada em cache (`gpt-4o` US$ 1,25, `gpt-4o-mini` US$ 0,075 por milhão, da página de preços de 2026-10-25) e soma o bloco fixo de tokens que a OpenAI cobra por chamada de busca nos modelos mini.
- **Modelo de pesquisa por perfil (`cost-profiles`):** o perfil pode definir um modelo de pesquisa próprio. O mecanismo entra nesta change; trocar o modelo do perfil Econômico só vale se o experimento da tarefa 4 mostrar qualidade equivalente.
- **Pré-checagem antes da avaliação (`evaluation-efficiency`):** aulas marcadas incompletas ou puladas não gastam chamadas de revisão, e as checagens determinísticas (bloco de código aberto, ids `[F#]` inválidos, palavras abaixo da meta) rodam antes de qualquer chamada.

## Non-goals

- **Avaliação incremental por hash de seção:** descartada. A revisão é 2% do custo e, na linha de base, as três aulas coubem em chamada única (20 mil tokens estimados, limite de 24 mil); o modo por seção só entra em aulas maiores. O juiz de melhorias já avalia só as seções alteradas (`secoesAlteradas`).
- **Melhoria só das seções abaixo do limite:** adiada. Reescrever a aula inteira custa cerca de US$ 0,002 por ciclo no `gpt-4o-mini`; o ganho seria de qualidade (evitar regressões), não de custo, e merece uma change própria.
- **Parada do ciclo por ganho de nota:** já existe (`EPSILON_CONVERGENCIA` e o gatilho `sem_ganho` do disjuntor).
- **Batch API:** descartada. O resultado chega em até 24 horas e exige consulta periódica, o que contraria a regra do projeto de usar SSE para toda operação assíncrona, e a avaliação em lote seria 2% do custo.
- **Reaproveitar pesquisa entre cursos "parecidos":** o cache só acerta quando o prompt é idêntico. Correspondência por semelhança exigiria embeddings, que não são justificados pelo ganho.
- Nenhuma dependência npm nova.

## Impact

- `server.js` (wrapper `chamarOpenAI`, `executarPesquisaWeb`, rotas `/api/search` e pesquisa por módulo, revisão), `skills.js` (ordem dos blocos), `custo.js` (`calcularCusto`), `orcamento.js` (não aprender calibração com acertos de cache), `config/precos-modelos.json`, `config/perfis-custo.json`, `observabilidade.js` (tokens em cache), `.gitignore`, `.env.example`, documentação e testes.
- Capabilities novas: `prompt-caching`, `research-cache`, `evaluation-efficiency`. Alteradas: `cost-estimation`, `cost-profiles`.
