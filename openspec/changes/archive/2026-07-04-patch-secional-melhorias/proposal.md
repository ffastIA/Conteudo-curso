# Proposal: patch-secional-melhorias

## Why

Mesmo com o teto de 10.000 tokens/aula e a guarda de continuação (change `teto-tokens-e-historico-uso`), a aplicação de melhorias continua truncando em aulas densas: em um ciclo real de 3 aulas, 2 falharam mesmo após a tentativa de continuação. Causa raiz: `aplicarMelhoriasSkill` (`skills.js:522-558`) pede ao modelo a **reescrita completa do conteúdo da aula** (não um diff), mais a seção `### Melhorias Aplicadas`. Para aulas com Fundamentação Técnica, Exemplos Práticos, Erros Comuns, Atividade Prática e Discussão Online, a saída legítima facilmente ultrapassa 10-16K tokens — nenhum teto prático razoável resolve isso enquanto o modelo precisar reproduzir texto que não mudou.

## What Changes

- `aplicarMelhoriasSkill` passa a pedir **apenas as seções que mudam**, delimitadas por um formato sentinela controlado pelo servidor (`<<<SECAO: <título exato ou novo>>>` ... `<<<FIM_SECAO>>>`), em vez da reescrita integral. Seções não mencionadas permanecem intocadas.
- Novo helper `mergeSecoesConteudo(textoOriginal, patchTexto)` em `server.js`: localiza cada `<<<SECAO: título>>>` pelo **título exato** (busca de string, não regex de heading — o conteúdo real varia de nível/formato de título entre aulas) no texto original e substitui o bloco correspondente até o próximo título de mesmo nível; título ausente no original → seção nova, acrescentada ao final com aviso no relatório.
- **Fallback automático para reescrita integral**: se a resposta do modelo não contiver nenhum marcador `<<<SECAO:`, o sistema trata como no comportamento atual (substituição total) — sem quebra durante a transição e para casos em que a melhoria realmente afeta a aula inteira.
- A saída por chamada cai para o tamanho das seções realmente afetadas — o teto de 10K passa a ser amplamente suficiente na prática. A guarda de truncamento e a continuação (`isRespostaMelhoriasCompleta`, `server.js:242-245`) são mantidas como rede de segurança, não removidas.
- O relatório de melhorias passa a listar quais seções foram tocadas por aula, além da rastreabilidade numerada já existente.

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `improvement-application-cycle`: a aplicação de melhorias passa a operar por patch de seção com fallback de reescrita integral, preservando a guarda de truncamento e a continuação já existentes.

## Non-goals

- Não elimina a guarda de truncamento/continuação da sessão anterior — o patch seccional reduz a necessidade dela, mas ela permanece como proteção para o caso de fallback (reescrita integral) ou seções muito longas.
- Não normaliza os títulos de seção que `conteudoSkill` gera hoje (variam por aula/objetivo) — o merge busca pelo título exato como o modelo o devolve, sem exigir um vocabulário fixo de seções.
- Não altera `realinharPlanoAulaSkill` nem o ciclo de realinhamento de planos (change `realinhar-planos-pos-melhorias`), que continuam consumindo o conteúdo final já mesclado.

## Impact

- **Código**: `skills.js` (`aplicarMelhoriasSkill` — novo formato de prompt), `server.js` (`mergeSecoesConteudo`, integração no loop de melhorias `~2170-2250`, detecção de fallback).
- **Risco**: título de seção divergente entre o que o modelo cita no patch e o texto original (typo, acentuação) pode fazer uma seção "nova" ser acrescentada em vez de substituída — mitigado por comparação tolerante a espaços/acentuação e pelo aviso no relatório sempre que uma seção for tratada como nova.
- **Testes**: unitários do merge (seção do meio, seção nova, múltiplas seções, fallback sem marcadores, título com variação de acentuação/caixa).
- **Custo**: redução de tokens de saída por chamada (menos texto redundante), portanto menor custo médio por ciclo de melhorias, apesar de nenhuma mudança de modelo.
