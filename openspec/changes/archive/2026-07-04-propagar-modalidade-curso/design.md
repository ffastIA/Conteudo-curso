# Design: propagar-modalidade-curso

## Context

A modalidade flui corretamente do formulário até a persistência (`public/index.html:143-150` → `public/app.js:322` → `POST /api/config`, `server.js:734-758` → `saveProject`, `server.js:305`) e é usada apenas em skills periféricas (`estiloVisualSkill`, `qualidadeSkill`, `perfilDocenteSkill`, `infraestruturaSkill`, `ppcAssemblySkill`). Nenhuma skill central do pipeline a recebe.

O sistema já possui o mecanismo ideal de propagação: `buildPedagogicalContext(sess)` (`server.js:102-114`) monta o bloco `## Metodologia Pedagógica` + BNCC e o entrega como `bnccContext` às etapas; `pedagCtxBlock(metodologia, bnccContext)` (`skills.js:20-25`) injeta o bloco nos prompts. A capability `pedagogical-methodology` formaliza esse canal ("Contexto pedagógico injetado em todas as skills de geração").

Lacuna de robustez descoberta na investigação: os endpoints geradores têm fallback de disco para ementa/planos (`sess.ementa || readMemory(sess, 'ementa')`, ex.: `server.js:884`), mas **nunca** para a metodologia (`server.js:790, 812, 889, 977, 1181, 1771, 1977` usam `sess.metodologia` direto). Após restart do servidor (Gap G04), as etapas geram sem metodologia, silenciosamente.

## Goals / Non-Goals

**Goals:**
- Metodologia gerada ciente e compatível com a modalidade.
- Modalidade + diretrizes presentes nos prompts de todas as etapas geradoras, com uma única fonte de verdade.
- Metodologia (inclusive versão editada/reimportada) garantidamente disponível em toda etapa, mesmo após perda da sessão in-memory.

**Non-Goals:**
- Skills especializadas por modalidade.
- Mudanças de formulário, API ou schema de persistência.
- Resolver o G04 por completo (persistência de sessão) — apenas o fallback pontual da metodologia.

## Decisions

1. **Skill única parametrizada, não 3 variantes por skill.**
   Alternativa considerada: skills especializadas por modalidade (3 variantes × ~6 skills ≈ 18 funções quase idênticas). Rejeitada: triplica manutenção com risco de drift a cada ajuste de prompt, exige dispatch condicional em ~8 call sites, quebra o padrão vigente (contexto injetado via `pedagCtxBlock`, como já ocorre com metodologia, BNCC e `proporcaoTeoricoPratico`) e não escala para uma quarta modalidade. As diferenças entre modalidades são diretrizes de conteúdo (síncrono/assíncrono, AVA vs. laboratório físico, tipos de atividade e avaliação), não diferenças estruturais de prompt.

2. **Injeção centralizada via `buildPedagogicalContext` + `pedagCtxBlock`.**
   Um único ponto de mudança propaga para todas as etapas que já recebem `bnccContext`. Skills que não passam por esse canal (ex.: `metodologiaSkill`, pesquisa) recebem `modalidade` como parâmetro explícito com a linha `Modalidade: X` + diretrizes.

3. **Mapa `MODALIDADE_DIRETRIZES` como constante em `skills.js`.**
   Chaves alinhadas ao enum do `CourseConfig` (`presencial`, `EaD`, `híbrido` — specs.yaml). Lookup tolerante a caixa/acentuação; chave desconhecida ou ausente → bloco vazio (comportamento atual preservado para projetos legados).

4. **Precedência: metodologia definida > diretrizes de modalidade.**
   As diretrizes incluem a instrução: "em caso de conflito, a Metodologia Pedagógica definida prevalece". Motivo: a metodologia pode ter sido editada deliberadamente pelo usuário (capability `stage-import`), e a vontade explícita do usuário vence o texto genérico.

5. **Fallback de disco para metodologia dentro de `buildPedagogicalContext` + nos usos diretos.**
   Padrão `sess.metodologia || readMemory(sess, 'metodologia')`, espelhando o que já é feito para ementa (`server.js:884`). Aplicado no helper central e nos usos diretos (`server.js:790, 812, 889, 977, 1181, 1771, 1977`, e `491, 568` para qualidade/PPC). Não introduz nova infraestrutura: `readMemory` e `scr/metodologia.txt` (gravado por `persistStage` e pela reimportação, `server.js:1458-1463`) já existem.

6. **`metodologiaSkill` recebe `modalidade` com instrução de compatibilidade obrigatória.**
   "A metodologia recomendada DEVE ser compatível e operacionalizável na modalidade X" — corrige o problema na raiz, antes da propagação.

7. **Campos condicionais por modalidade como texto livre opcional (`distribuicaoHibrida` e `cargaSincronaPorAula`).**
   `cargaSincronaPorAula` (visível só para EaD) cobre o formato "EaD com momentos síncronos regulares" — curso no AVA com janela síncrona fixa por aula (ex.: 15 min de interação com o instrutor em aula de 120 min). Quando preenchido, as diretrizes EaD instruem o plano de aula a reservar a janela explicitamente, com objetivo definido, mantendo o restante autoinstrucional. Mesmo racional de texto livre descrito abaixo.
   A distribuição presencial/a distância varia por curso, então é definida na Etapa 1 junto com a modalidade, e não fixada nas diretrizes. Alternativas consideradas: (a) percentuais estruturados (dois campos numéricos) — rejeitado: cursos descrevem a divisão de formas heterogêneas ("prática presencial, teoria EaD" vs. "40/60"), e o consumidor é um prompt de LLM, que lida bem com texto livre (mesmo racional do campo `proporcaoTeoricoPratico` já existente, specs.yaml); (b) embutir a proporção nas diretrizes fixas — rejeitado por variar por curso. O campo só aparece quando `modalidade = "híbrido"` (exibição condicional no frontend) e, quando preenchido, entra no bloco `## Modalidade do Curso` com instrução de respeito rigoroso; quando vazio, as diretrizes do híbrido instruem o modelo a propor distribuição justificada.

## Risks / Trade-offs

- [Regressão de saída: diretrizes mudam o texto de todas as etapas] → Validação manual de 1 curso por modalidade antes do merge; diffs qualitativos de ementa/plano/conteúdo.
- [Conflito metodologia editada × diretrizes de modalidade] → Regra de precedência explícita no prompt (Decisão 4).
- [Projetos legados sem `modalidade`] → Lookup com fallback vazio; nenhum erro, comportamento anterior.
- [Crescimento de prompt (~100-200 tokens/chamada)] → Custo desprezível no gpt-4o-mini; monitorar apenas se as diretrizes crescerem muito.
- [Testes de prompt existentes por substring podem quebrar] → Revisar `tests/unit/skills.test.js` no mesmo PR.

## Migration Plan

Sem migração de dados. Projetos existentes: ao recarregar (`POST /api/carregar-projeto`), a modalidade do `projeto.json` passa a ser propagada automaticamente nas próximas gerações; artefatos já gerados não são regenerados retroativamente. Rollback = revert do commit.

## Open Questions

- Minuta das diretrizes por modalidade redigida em `diretrizes-modalidade.md` (base: boas práticas gerais de educação profissional) — pendente de revisão/aprovação do usuário (task 1.1).
