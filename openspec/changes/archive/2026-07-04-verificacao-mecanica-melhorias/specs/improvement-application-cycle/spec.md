## ADDED Requirements

### Requirement: Verificação mecânica de melhorias autorrelatadas
O sistema SHALL verificar, de forma independente e determinística (sem chamada de API adicional), se as edições de conteúdo e de plano de aula produzidas no ciclo de melhorias correspondem a mudanças reais, em vez de confiar apenas na autoavaliação do modelo (`### Melhorias Aplicadas`). Para cada seção **substituída** (não para seções novas) em `mergeSecoesConteudo` e para cada seção de plano de aula realinhada, o sistema SHALL calcular a similaridade (`textSimilarity`) entre o texto antigo e o novo; seções com similaridade ≥ 0.85 SHALL ser sinalizadas como possivelmente sem mudança real. Adicionalmente, para cada melhoria que mencione um termo entre aspas ou uma sigla em maiúsculas, o sistema SHALL verificar a presença literal (tolerante a acento e caixa) desse termo no conteúdo final da aula ou no plano de aula atualizado; ausência em ambos SHALL ser sinalizada. As sinalizações SHALL ser agregadas numa seção `## Verificação Automática — Possíveis Inconsistências` no relatório de melhorias, distinta da seção autorrelatada pelo modelo, sem alterar ou bloquear a persistência do conteúdo.

#### Scenario: Seção substituída mas textualmente inalterada
- **WHEN** o patch de uma aula substitui uma seção cujo corpo novo é idêntico ou quase idêntico ao original (similaridade ≥ 0.85)
- **THEN** o relatório inclui essa seção na lista de "Verificação Automática — Possíveis Inconsistências", identificando a aula e o título da seção

#### Scenario: Reescrita genuína não é sinalizada
- **WHEN** o patch substitui uma seção com conteúdo substancialmente diferente do original (similaridade < 0.85)
- **THEN** essa seção NÃO aparece na lista de inconsistências

#### Scenario: Seção nova nunca é sinalizada por similaridade
- **WHEN** uma seção é acrescentada como nova (título não existia no texto original)
- **THEN** ela não participa da checagem de similaridade (só seções substituídas são comparadas)

#### Scenario: Termo esperado ausente do resultado final
- **WHEN** uma melhoria menciona um termo entre aspas (ex.: `"Círculo de Histórias"`) ou uma sigla (ex.: `BNCC`) e esse termo não aparece, nem por aproximação de caixa/acento, no conteúdo final da aula nem no plano de aula atualizado
- **THEN** o relatório sinaliza essa melhoria como "termo esperado ausente: <termo>"

#### Scenario: Termo presente em qualquer um dos dois documentos não é sinalizado
- **WHEN** o termo mencionado por uma melhoria aparece no conteúdo da aula OU no plano de aula (não precisa estar nos dois)
- **THEN** nenhuma sinalização é gerada para essa melhoria

#### Scenario: Verificação é informativa, não bloqueante
- **WHEN** uma ou mais inconsistências são detectadas em um ciclo
- **THEN** o conteúdo e o plano continuam sendo persistidos normalmente; nenhuma nova chamada de correção é disparada automaticamente

#### Scenario: Verificação aplicada também ao realinhamento de plano
- **WHEN** `realinharPlanoAulaSkill` substitui a seção do plano de uma aula com texto de similaridade ≥ 0.85 em relação à seção anterior
- **THEN** a mesma sinalização de possível inconsistência aparece no relatório, identificando que o item verificado é do plano de aula
