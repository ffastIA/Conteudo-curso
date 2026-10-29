## Context

O consumo do projeto está espalhado em três lugares, nenhum deles mostra "tokens × tarifa = valor":

- `scr/token_usage.json` (`addUsage`, `server.js`): total e por dia, só `prompt`, `completion` e `total`. Sem modelo, sem tokens em cache, sem valor.
- `scr/uso.json` (`contabilizar`, `orcamento.js`): gasto em US$ por dia, por etapa e por modelo; por modelo guarda também `chamadas`, `tokensEntrada` e `tokensSaida`. O valor foi calculado no momento da chamada (`calcularCusto`, `observabilidade.js`) com a tabela de preços da época. Não guarda tokens em cache nem chamadas de busca web.
- `GET /api/orcamento` devolve `porModelo` e `etapa.porEtapa`, mas o painel 💲 só desenha o gasto por etapa.

A conta real da OpenAI tem quatro parcelas: tokens de entrada fora do cache, tokens de entrada em cache (metade do preço), tokens de saída e a tarifa por chamada de busca web. Hoje o usuário só vê o resultado somado. Com a escolha de modelo por papel (`model-selection`) e o cache de prompt (`prompt-caching`), cada modelo tem tarifas diferentes e a transparência passou a importar.

O ponto único de acerto de cada chamada é `governanca.depois(...)` (`orcamento.js`), chamado de `registrar` em `chamarOpenAI` (`server.js`), que já recebe `usage` (com `cached_tokens` normalizado nas respostas de chat e Responses) e `tarifaUsd`. O número de buscas (`buscas`) existe localmente ali e não é repassado.

## Goals / Non-Goals

**Goals:**
- Mostrar, por modelo, os tokens (entrada, entrada em cache, saída), a tarifa da tabela de preços e o valor em US$ calculado a partir dela, mais a busca web e o total do projeto.
- Quebrar o mesmo consumo por etapa e por dia.
- Deixar visível quando o valor recalculado difere do gasto registrado.
- Calcular tudo no servidor, com a mesma função de preço usada na cobrança interna.

**Non-Goals:**
- Previsão de custo, tetos, pausa e disjuntor (já existem e não mudam).
- Reproduzir a fatura da OpenAI; consumo de HeyGen e Gamma; outras moedas; exportação; reconstruir projetos antigos.

## Decisions

**D1. Guardar contadores brutos por etapa × modelo e por dia × modelo, e calcular o valor na leitura.** Em `uso.json` entra `consumo: { porEtapa: { <etapa>: { <modelo>: C } }, porDia: { <dia>: { <modelo>: C } } }`, com `C = { chamadas, tokensEntrada, tokensEntradaEmCache, tokensSaida, buscasWeb }`. O consumo por modelo é a soma das etapas, então não há terceira cópia. O valor em US$ nunca é gravado nessa estrutura: é `tokens × tarifa` calculado a cada consulta. Alternativa descartada: gravar o US$ de cada chamada (já existe em `uso.modelos` e `etapas`); isso congela a tabela de preços da época e não permite mostrar a conta pela tabela atual. Outra descartada: estender só `uso.modelos`; a quebra por etapa em US$ ficaria impossível de recalcular (uma etapa mistura modelos).

**D2. Mesma fórmula da cobrança interna.** Uma função `valorDoConsumo(contadores, modelo, precos)` em `custo.js` aplica `((entrada − emCache) × entrada + emCache × entradaEmCache + saída × saída) / 1.000.000` e soma `buscasWeb × buscaWebPorChamadaUsd`, usando `carregarPrecos` e a regra de prefixo mais longo de `calcularCusto`. Para não duplicar a fórmula, `calcularCusto` passa a ser chamado com um `usage` montado dos contadores. O bloco fixo de 8.000 tokens dos modelos mini só entra se `buscaWebBlocoTokensMiniSomar` for `true` (hoje `false`), igual a `custoBlocoBuscaMini`.

**D3. Conciliação com o gasto registrado.** `GET /api/consumo` devolve `registradoUsd` (soma de `uso.modelos[*].usd`, o que o orçamento usou para os tetos) e `recalculadoUsd`, com `diferencaUsd` e `divergente = |dif| > max(0,0001; 1% do registrado)`. A causa mais comum é a tabela de preços ter mudado depois da geração. A tela explica em uma frase e não corrige o histórico (o orçamento continua usando o valor registrado).

**D4. Consumo anterior à change fica como "parcial".** Projetos antigos não têm `consumo`. A resposta traz `parcial: true` quando a soma das chamadas de `uso.modelos` é maior que a soma das chamadas de `consumo`, e a tela mostra "consumo anterior a esta versão não detalhado" com o gasto registrado dessa parte (registrado − recalculado de `consumo`, quando positivo). Sem migração: os contadores nascem em zero e o `versao` do arquivo não muda (campos aditivos; a leitura trata ausência como `{}`).

**D5. Rota nova `GET /api/consumo`, sem mudar `/api/tokens` nem `/api/orcamento`.** Resposta: `{ moeda, vigenciaPrecos, modelos: [{ modelo, chamadas, tokens: {entrada, entradaEmCache, saida}, tarifa: {entrada, entradaEmCache, saida}|null, buscasWeb, valorUsd|null }], buscaWeb: { chamadas, tarifaPorChamadaUsd, valorUsd }, porEtapa, porDia, totalUsd, registradoUsd, diferencaUsd, divergente, parcial, semPreco: [modelo] }`. Modelo sem preço traz `tarifa: null` e `valorUsd: null`, fica fora de `totalUsd` e entra em `semPreco`. Mantém os formatos antigos para não quebrar a interface atual nem os testes existentes. O contador do cabeçalho pega o `totalUsd` desta rota.

**D6. Interface: seção "Consumo do projeto" dentro do painel 💲.** Reusa `orcFetch` e `renderPainelOrcamento` (`public/orcamento.js`), em tabelas HTML simples, sem biblioteca de gráfico. A seção é atualizada nos mesmos momentos em que o painel já atualiza (abertura, fim de etapa, `alerta_orcamento`); nenhum SSE novo. O contador do cabeçalho (`public/app.js`, `tokenCounter`) mostra `🔢 N tokens · US$ X,XX` quando há `totalUsd`, mantendo só os tokens quando não há projeto.

**D7. Quem alimenta os contadores.** `registrar` em `chamarOpenAI` passa `buscasWeb: buscas` (só na Responses) para `governanca.depois`, que chama `contabilizar` com `usage` (já traz `cached_tokens`, via `tokensEmCache`). `contabilizar` ganha a gravação de `consumo.porEtapa` e `consumo.porDia`. Chamadas com erro e sem `usage` não gravam nada (como hoje com o custo).

## Risks / Trade-offs

- [Valor recalculado diferente do registrado quando o preço muda] → conciliação visível (D3), vigência da tabela exibida; o orçamento segue usando o valor registrado.
- [Crescimento de `uso.json`] → dias × etapas × modelos é pequeno (dezenas de linhas por curso); a gravação já é atômica e a cada chamada, sem custo novo relevante.
- [Cache de prompt diferente entre as famílias de modelo] → `tokensEmCache` já trata os três formatos de `usage`; modelo sem `entradaEmCache` na tabela cobra tudo pelo preço de entrada (regra existente).
- [Estimativa da OpenAI com bloco fixo de busca em mini] → segue o interruptor `buscaWebBlocoTokensMiniSomar`, verificado em 2026-10-26.
- [Projeto antigo mostra números menores que o gasto] → marcado como "parcial" (D4), nunca apresentado como total confiável.
- [Duas cópias de `modelos` em `uso.json`, o gasto e o consumo] → `uso.modelos` continua sendo a fonte do orçamento; `consumo` é só para exibição, e os dois são conferidos pela conciliação.

## Migration Plan

Sem migração de dados: campos aditivos, leitura tolerante, projetos antigos abrem como estão. Implantação normal (reiniciar o servidor). Reversão: voltar o código; o campo `consumo` extra em `uso.json` é ignorado pela versão anterior.

## Open Questions

- Mostrar também o valor em reais (câmbio manual)? Fora de escopo desta change; se for pedido, entra como outra change, com a cotação como configuração do usuário.
