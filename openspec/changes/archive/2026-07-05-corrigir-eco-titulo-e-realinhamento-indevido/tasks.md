# Tasks: corrigir-eco-titulo-e-realinhamento-indevido

## 1. Sanitização de eco de título (server.js)

- [x] 1.1 Nova função `removerEcoTitulo(corpo, tituloNorm)`: pula linhas em branco iniciais; se a primeira linha não-vazia normaliza para exatamente `tituloNorm`, remove essa linha (e as linhas em branco antes/depois dela); retorna o corpo resultante (ou o original, sem alteração, se a primeira linha não for um eco)
- [x] 1.2 Aplicar `removerEcoTitulo` ao corpo de cada bloco do patch, no momento em que ele é escolhido como alvo de uma seção existente (mesmo ponto onde hoje `corpoPorSecao.set(idx, corpo)` é chamado em `mergeSecoesConteudo`) — usar o `alvo` (título normalizado da seção) já calculado ali
- [x] 1.3 Não aplicar a sanitização a blocos tratados como seção nova (`novas`) — não há título "esperado" para comparar

## 2. Filtro de elegibilidade para realinhamento (server.js)

- [x] 2.1 Simplificar o filtro `alteradas` (bloco de realinhamento, dentro de `/api/aplicar-melhorias/confirmar`) para `metricasPorAula.filter(m => m.similaridade <= 0.90)`, removendo a condição `|| (observacoes[...]?.melhorias?.length > 0)`
- [x] 2.2 Revisar o comentário acima do filtro para refletir a nova regra (elegibilidade só por mudança real de conteúdo)

## 3. Testes

- [x] 3.1 `removerEcoTitulo` (ou teste direto via `mergeSecoesConteudo`): corpo cuja primeira linha ecoa o título é sanitizado antes da substituição, e o merge NÃO é rejeitado pela rede de segurança nesse caso
- [x] 3.2 Corpo que NÃO começa com eco do título permanece inalterado (nenhuma remoção indevida)
- [x] 3.3 Corpo cuja primeira linha é uma menção parcial ou diferente do título (não é o título completo) NÃO é removida — só remove eco exato
- [x] 3.4 A rede de segurança continua rejeitando um merge quando o corpo introduz um cabeçalho DIFERENTE por acidente (regressão do teste já existente — deve continuar passando)
- [x] 3.5 `npx jest` completo verde + `node --check`

## 4. Fechamento

- [x] 4.1 Sync das specs (`improvement-application-cycle`), arquivar o change, commit, push
- [x] 4.2 Avisar o usuário para revisar manualmente o `plano_de_aula` atual do curso Capcut Oficina, já que ciclos anteriores rodaram com o comportamento antigo
