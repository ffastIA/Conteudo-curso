# Design: verificacao-mecanica-melhorias

## Context

O ciclo de melhorias tem duas skills que editam texto e se autoavaliam ao final: `aplicarMelhoriasSkill` (produz `### Melhorias Aplicadas`) e `realinharPlanoAulaSkill` (não tem autoavaliação explícita, mas suas edições no plano também carecem de verificação, especialmente após a mudança `melhorias-plano-aula-nao-so-conteudo`, que passou a depender dela para corrigir itens do plano). Em ambos os casos, hoje o único registro de "o que mudou" é a palavra do próprio modelo.

### Calibração do limiar (evidência empírica desta investigação)

Usando a `textSimilarity` já existente no sistema (Jaccard por palavras >3 caracteres), comparei três pares de texto real/reproduzido:

| Caso | Descrição | Similaridade |
|---|---|---|
| 1 | Seção "Revisão dos Conceitos Básicos" devolvida **idêntica** pelo `gpt-4o-search-preview` (ciclo real de produção), apesar de listada como "revisada" e a melhoria pedida ser "resumir" | **1.000** |
| 2 | Mesma seção, reproduzida com `gpt-4o-mini`: o modelo **alongou** o texto (mais qualificadores por bullet) em vez de resumir, mas declarou "Resumiu e reestruturou... contextualização mais clara" | **0.931** |
| 3 (controle) | Seção "Exemplos Práticos" genuinamente reescrita pelo `gpt-4o-search-preview` (bullets substituídos, exemplos reformulados) — mudança real e substancial | **0.431** |

Gap de quase 0.5 entre o grupo "não mudou de verdade" (0.93–1.00) e o grupo "mudou de verdade" (0.43) — um limiar em 0.85 tem folga confortável dos dois lados.

## Goals / Non-Goals

**Goals:** dar ao revisor humano um sinal objetivo e barato de que uma "melhoria aplicada" pode não ter acontecido de verdade; cobrir tanto o conteúdo quanto o plano de aula (ambos editados por skills com o mesmo tipo de risco).

**Non-Goals:** corrigir automaticamente o que for sinalizado; avaliar qualidade semântica da edição; aplicar a etapas fora do ciclo de melhorias.

## Decisions

1. **Checagem em duas frentes: similaridade de seção + presença de termo-chave.**
   A similaridade pega o caso "declarou mudança, mas o texto é o mesmo/quase o mesmo" (casos 1 e 2 da calibração). Sozinha, ela não pega o caso "incorporar BNCC" (nenhuma menção a "BNCC" em lugar nenhum) porque a seção pode ter mudado bastante por outros motivos e ainda assim nunca ter tocado no termo pedido — daí a segunda checagem, independente: para melhorias que citam um termo entre aspas ou uma sigla em maiúsculas, verificar presença literal (tolerante a acento/caixa) no resultado final. As duas juntas cobrem os dois modos de falha observados empiricamente.

2. **Similaridade calculada dentro de `mergeSecoesConteudo`, não em uma função separada.**
   A função já tem o texto antigo e o novo de cada seção substituída no mesmo escopo (`antes`/`corpo`, linhas onde a substituição acontece) — calcular ali evita reprocessar o texto inteiro de novo no chamador. Retorno estendido: `{ texto, substituidas, novas, suspeitas: [{ titulo, similaridade }] }`, populando `suspeitas` apenas para seções em `substituidas` (nunca para `novas`, que por definição são conteúdo adicional, não substituição).

3. **Mesmo cálculo, aplicado inline no loop de realinhamento de plano.**
   `planoAulaTrechoAtual` (antes) e `corpo` (depois) já estão em escopo na chamada existente (`server.js`, loop de `realinharPlanoAulaSkill`) — basta rodar `textSimilarity` ali e acumular num array paralelo ao `realinhamentoLog`, sem alterar `replaceLessonBlock`.

4. **Checagem de termo-chave como função nova e pura, rodada uma vez ao final do ciclo (após conteúdo e plano finalizados).**
   `extrairTermosEsperados(melhoria)`: regex de aspas (`/"([^"]{3,60})"/g`) + regex de sigla maiúscula (`/\b[A-ZÇÃÕÁÉÍÓÚÊÂÀ]{2,8}\b/g`). Para cada termo extraído, checar presença normalizada (mesmo padrão `normalizeTitulo` já usado) no conteúdo final da aula E no plano de aula final; ausente dos dois → sinalizar. Rodar depois de ambas as fases (conteúdo e plano) porque um termo pode legitimamente ter sido endereçado em qualquer um dos dois documentos — checar antes disso arriscaria falso positivo.

5. **Seção de relatório separada, não misturada com "Melhorias Aplicadas".**
   `## Verificação Automática — Possíveis Inconsistências`, agregada uma vez ao final do relatório (mesmo padrão de "Realinhamento de Planos", que já é uma seção agregada separada). Mantém a declaração do modelo intacta e visível, com o sinal mecânico ao lado — o revisor vê os dois e decide.

6. **Sem retry automático.**
   Uma correção automática dispararia mais uma chamada ao mesmo tipo de modelo que acabamos de mostrar não ser confiável em autoavaliação — arriscaria só trocar uma alegação falsa por outra. Fica como possível iteração futura, não coberta aqui.

## Risks / Trade-offs

- [Falso positivo: edição pequena porém suficiente (ex.: correção pontual de um dado) fica com similaridade alta] → é informativo, não bloqueante; o revisor confirma com um olhar rápido. Limiar 0.85 já foi calibrado com folga para reduzir a taxa.
- [Sigla maiúscula comum (ex.: nome de ferramenta) gera aviso sem necessidade real de aparecer literalmente] → mesmo racional acima: aviso é barato de descartar, o custo de não avisar (caso real observado) é maior.
- [Termo pode aparecer em uma forma parafraseada, não literal, e ainda assim ser sinalizado como ausente] → limitação aceita conscientemente: o objetivo é pegar os casos claros (ausência total), não avaliar paráfrase — false negatives residuais ficam para uma iteração com LLM-judge, fora do escopo desta mudança.

## Migration Plan

Sem migração. Efeito no próximo ciclo de melhorias de qualquer projeto. Rollback = revert do commit.

## Open Questions

- Se a taxa de falsos positivos em uso real for alta, considerar elevar o limiar (ex.: 0.90) ou adicionar uma segunda camada (LLM-judge) — decisão adiada até haver mais dados de uso.
