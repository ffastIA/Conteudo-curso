## Context

A `revisaoQualidadeSkill` em `skills.js` monta um prompt com seções fixas e instrui o modelo a responder com exatamente aquelas seções. O output é acumulado via SSE e depois convertido para `.docx` pela função `buildDocx`. Adicionar uma nova seção é puramente uma mudança de prompt — sem novos endpoints, dados ou dependências.

`config.publico` já está disponível como parâmetro da skill (recebido pelo handler em `server.js` a partir de `sess.config`), portanto nenhum dado novo precisa ser coletado ou transmitido.

## Goals / Non-Goals

**Goals:**
- Inserir a seção "Adequação à Faixa Etária e Perfil de Público" no prompt de `revisaoQualidadeSkill`
- Posicionar a nova seção entre "Compatibilidade com Plano de Ensino e Ementa" e "Sobreposições Detectadas"
- Instruir o modelo a avaliar linguagem, complexidade, exemplos e abordagem didática em relação a `config.publico`
- Atualizar o spec canônico `content-quality-review`

**Non-Goals:**
- Criar campo novo no formulário ou schema de sessão
- Modificar qualquer endpoint ou contrato de API
- Alterar a skill `qualidadeSkill` (Etapa 7)
- Introduzir avaliação binária (aprovado/reprovado) — a seção é analítica

## Decisions

**Posição da nova seção:** Entre "Compatibilidade com Plano de Ensino e Ementa" e "Sobreposições Detectadas". Justificativa: segue a ordem lógica de análise (conteúdo → adequação ao público → problemas estruturais de sobreposição). Inserir antes de sobreposições evita interromper o fluxo analítico dos itens de coerência curricular.

**Parâmetro de público:** Usar `config.publico` (já passado para a skill). Não criar campo separado de "faixa etária" — `publico` já captura essa informação em linguagem natural, e o modelo é capaz de inferir faixa etária, maturidade e contexto a partir desse campo.

**Critérios avaliados pela nova seção:**
1. Linguagem e vocabulário (acessibilidade ao nível do público)
2. Complexidade dos conceitos e ritmo de introdução
3. Adequação dos exemplos e analogias ao contexto do público
4. Tom e abordagem didática (ex.: mais exploratória para jovens, mais objetiva para profissionais)
5. Sugestões de ajuste quando inadequações forem identificadas

## Risks / Trade-offs

**Aumento de tokens por aula** → o prompt fica ~200-300 tokens maior por chamada. Com `gpt-4o-mini` o custo é marginal. Mitigação: nenhuma necessária.

**Subjetividade da avaliação** → o modelo pode ser menos preciso para públicos muito específicos (ex.: "adultos com deficiência visual"). Mitigação: a seção é explicitamente qualitativa e requer revisão humana — o campo "Observações do Revisor" existe para correções.

**Condicional de BNCC ausente** → ao contrário da seção BNCC (que é omitida quando `bncc.ativo === false`), a seção de faixa etária é sempre presente (todo curso tem `publico`). Se `config.publico` estiver vazio, o modelo deve informar que não foi possível avaliar por falta de dados.
