# Otimização de tokens (cache de pesquisa, cache de prompt e tokens em cache)

> Complementa `docs/governanca-de-custo.md`. Os números abaixo vêm da linha de base `capcut`
> (3 aulas, `docs/baseline/capcut/`): a **pesquisa web é cerca de 86% do custo**, o conteúdo das aulas
> 10%, a revisão 2%. Por isso as otimizações miram a pesquisa primeiro.

## Cache de pesquisa

Cada consulta de pesquisa web bem-sucedida é guardada em `.cache-pesquisa/` (um JSON por consulta,
ignorado pelo git). Repetir a **mesma consulta com a mesma entrada** (reexecutar a Etapa 2, refazer o
curso, retomar depois de uma falha) devolve o resultado guardado: não chama a OpenAI, não gasta orçamento
e não entra na calibração da estimativa. O progresso mostra "resultado do cache (pesquisado em DD/MM/AAAA)".

- **Chave:** hash do prompt final, do modelo, do contexto de busca e do teto de saída. Mudar ementa, nível,
  público, modalidade, metodologia, consulta, ano, perfil de custo (contexto de busca) ou modelo gera outra
  chave. O cache **só acerta com entrada idêntica**; cursos parecidos, mas diferentes, não reaproveitam.
- **Só sucesso:** entram no cache apenas respostas com texto e ao menos uma citação. Falha, resposta de
  memória e o fallback "sem pesquisa web" nunca são guardados.
- **Validade:** 30 dias (`PESQUISA_CACHE_TTL_DIAS`; 0 desliga a leitura). Como a pesquisa trata de tendências
  do ano, entradas velhas são consultadas de novo; o ano está no prompt, então a virada de ano invalida tudo.
- **Forçar nova pesquisa:** `GET /api/search?semCache=1` (geral) ou `GET /api/pesquisa-modulos?semCache=1`
  (por módulo; `?refazer=1` também ignora o cache). Para limpar tudo, apague a pasta `.cache-pesquisa/`.
- **Rastreio:** as consultas atendidas pelo cache ficam marcadas com `deCache: true` e `pesquisadoEm` em
  `pesquisa.json` e `pesquisa_modulos.json`; o Langfuse recebe o span `pesquisa.cache`.
- **Desligar:** `PESQUISA_CACHE=false`. Arquivo corrompido ou de outra versão é ignorado com aviso.

## Cache de prompt da OpenAI

A OpenAI dá desconto automático (50% para `gpt-4o` e `gpt-4o-mini`) em prompts de 1.024 tokens ou mais cujo
**início** repete o de uma chamada recente. Não há parâmetro a ligar: o app só precisa manter o conteúdo
estável no começo do prompt. As skills chamadas várias vezes com o mesmo contexto (`secaoConteudoSkill`,
`revisaoSecaoSkill`, `scoreAulaSkill`) montam primeiro o contexto da aula (plano, ementa, mapa das aulas,
dossiê de fontes, nível, contexto pedagógico) e por último o trecho variável (resumo das seções escritas,
seção atual, texto a avaliar). O conteúdo é o mesmo; só a ordem mudou. O ganho esperado é pequeno
(cerca de 2% a 4% do custo por curso, a medir) porque o conteúdo é a menor parte do gasto.

## Tokens em cache na contabilidade

A OpenAI informa quantos tokens de entrada vieram do cache (`prompt_tokens_details.cached_tokens` no chat,
`input_tokens_details.cached_tokens` na Responses API). O app registra esse número como `entradaEmCache`
(`geracao_log.json`, contexto do trace, `input_cached_tokens` na `generation` do Langfuse) e cobra esses
tokens pelo preço `entradaEmCache` de `config/precos-modelos.json` (`gpt-4o` US$ 1,25 e `gpt-4o-mini`
US$ 0,075 por milhão, da página de preços de 2026-10-25). Sem esse campo para um modelo, tudo é cobrado
pelo preço de entrada. A **estimativa prévia não presume cache**: o desconto só aparece no custo real.

## Modelo de pesquisa por perfil

O perfil de custo aceita o campo opcional `modeloPesquisa` em `config/perfis-custo.json`. Sem ele, a
pesquisa usa `OPENAI_RESEARCH_MODEL` (padrão `gpt-4o`). O painel 💲 mostra o modelo de pesquisa do perfil
ativo, e a validação de capacidades avisa se o modelo não tiver busca web. **O perfil Econômico usa
`gpt-4o-mini`** (decisão de 2026-10-26, após o experimento da tarefa 4.3: pesquisa 81% mais barata, com
fontes e nota equivalentes à linha de base). Padrão e Premium seguem com `gpt-4o`.

## Bloco fixo da busca nos modelos mini

Segundo a página de preços, nos modelos mini a OpenAI cobra um bloco fixo de 8.000 tokens de entrada por
chamada de busca. `buscaWebBlocoTokensMini` guarda o valor e `buscaWebBlocoTokensMiniSomar` (padrão `false`)
liga a soma ao custo. **Verificado em 2026-10-26** com 8 buscas reais em `gpt-4o-mini`: o `usage` já inclui o
bloco (todas as chamadas vieram com 8.174 tokens de entrada, os 8.000 do bloco mais o prompt), então a soma
fica desligada. Uma busca em mini custa cerca de US$ 0,0115, quase só a tarifa de US$ 0,01 por chamada. Com
`gpt-4o` (padrão) nada é somado.

## Verificação real (2026-10-26, curso `capcut`, 3 aulas)

| | `gpt-4o` na pesquisa | `gpt-4o-mini` na pesquisa |
|---|---|---|
| Pesquisa geral + por módulo | US$ 0,496 | US$ 0,094 (inclui 1 retentativa) |
| Custo do curso | US$ 0,543 | US$ 0,128 |
| Fontes / domínios distintos | 31 / 20 | 18 / 14 |
| Nota média das aulas | 0,81 (linha de base 0,85) | 0,84 |

- **Cache de pesquisa:** a 2ª pesquisa geral na mesma sessão veio inteira do cache, sem chamada nem gasto.
- **Cache de prompt:** nas aulas, 67% dos tokens de entrada (160.768 de 240.730) vieram do cache; o conteúdo
  custou US$ 0,030, contra US$ 0,051 na linha de base. A revisão não ganha cache (uma chamada por aula).
- **Ruído da nota:** duas execuções com o mesmo modelo deram 0,85 e 0,81; a tolerância de 0,03 do experimento
  é menor que essa oscilação, então a comparação de nota é indicativa.
- **Confiabilidade do mini:** 1 de 8 buscas voltou sem fontes (módulo 3); a retentativa do app resolveu.

## Variáveis

| Variável | Padrão | Efeito |
|---|---|---|
| `PESQUISA_CACHE` | ligado | `false` desliga leitura e gravação do cache de pesquisa |
| `PESQUISA_CACHE_TTL_DIAS` | 30 | validade das entradas; 0 desliga a leitura |
| `PESQUISA_CACHE_DIR` | `.cache-pesquisa/` | pasta do cache |

## O que ficou de fora (e por quê)

- **Avaliação incremental por hash de seção:** a revisão é 2% do custo e as aulas da linha de base cabem
  em uma chamada; o juiz de melhorias já avalia só as seções alteradas.
- **Pré-checagem determinística na revisão:** já existe. A revisão fica bloqueada enquanto houver aula
  incompleta ou pulada, e a geração já detecta código aberto, tamanho abaixo da meta e ids `[F#]` inválidos.
- **Batch API:** contraria a regra do projeto de usar SSE para operações assíncronas e a avaliação em lote
  seria 2% do custo.
- **Cache entre cursos parecidos:** exigiria embeddings; o cache só acerta com entrada idêntica.
