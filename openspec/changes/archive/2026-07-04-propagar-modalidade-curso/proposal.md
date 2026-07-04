# Proposal: propagar-modalidade-curso

## Why

A modalidade do curso (`presencial`, `EaD`, `híbrido`) é capturada na Etapa 1, validada e persistida (`CourseConfig.modalidade`, ver specs.yaml e capability `course-config`), mas não é passada a nenhuma das skills centrais do pipeline: metodologia, ementa, plano de ensino, divisão em aulas, plano de aula, conteúdo, pesquisa web e revisão/melhorias. O agravante mais sério: a `metodologiaSkill` recomenda a abordagem pedagógica **sem saber a modalidade** — pode recomendar dinâmicas presenciais para um curso 100% EaD — e, como a metodologia é injetada em todas as etapas seguintes, o erro nasce na raiz e contamina o pipeline inteiro.

## What Changes

- Passar `modalidade` à `metodologiaSkill` com instrução explícita de que a metodologia recomendada DEVE ser operacionalizável na modalidade escolhida.
- Criar mapa `MODALIDADE_DIRETRIZES` em `skills.js` (diretrizes de atividades, recursos, interação e avaliação por modalidade) e estender `pedagCtxBlock()` / `buildPedagogicalContext()` — o canal de injeção de contexto pedagógico já existente — para incluir a modalidade e suas diretrizes em todas as skills geradoras (ementa, plano de ensino, divisão em aulas, plano de aula, conteúdo, pesquisa web/fallback, revisão de qualidade e aplicação de melhorias).
- Definir regra de precedência no prompt: em caso de conflito, a Metodologia Pedagógica definida (inclusive editada pelo usuário) prevalece sobre as diretrizes genéricas de modalidade.
- Adicionar fallback de leitura em disco para a metodologia (`sess.metodologia || readMemory(sess, 'metodologia')`) em todos os endpoints geradores, espelhando o padrão já usado para ementa/planos — hoje, se a sessão in-memory se perde (restart do servidor), as etapas geram **sem metodologia nenhuma, silenciosamente**.
- Instruir as skills de ementa, plano de ensino e plano de aula a iniciar o documento gerado com um cabeçalho de identificação (nome do curso, carga horária, **Modalidade**) — hoje nenhum prompt exige cabeçalho no documento de saída.
- Novo campo condicional `distribuicaoHibrida` no `CourseConfig`: exibido na Etapa 1 apenas quando `modalidade = "híbrido"`, texto livre e opcional (ex.: "prática presencial, teoria a distância" ou "40% presencial / 60% EaD"). Quando preenchido, é injetado no bloco de modalidade e as diretrizes instruem o modelo a respeitá-lo; quando vazio, o modelo propõe uma distribuição justificada.
- Novo campo condicional `cargaSincronaPorAula` no `CourseConfig`: exibido na Etapa 1 apenas quando `modalidade = "EaD"`, texto livre e opcional (ex.: "15 min de interação síncrona com o instrutor por aula"). Quando preenchido, cada plano de aula reserva explicitamente essa janela síncrona com objetivo definido, mantendo o restante autoinstrucional; quando vazio, o EaD segue o padrão assíncrono com síncrono apenas complementar.

## Capabilities

### New Capabilities

(nenhuma — a mudança estende capabilities existentes)

### Modified Capabilities

- `course-config`: novos campos condicionais e opcionais no modelo `CourseConfig` e no formulário da Etapa 1 — `distribuicaoHibrida` (visível apenas para modalidade híbrida) e `cargaSincronaPorAula` (visível apenas para modalidade EaD).
- `pedagogical-methodology`: a geração da metodologia passa a receber a modalidade como restrição obrigatória; o contexto pedagógico injetado nas skills passa a incluir modalidade + diretrizes; a metodologia usada pelas etapas geradoras ganha fallback de leitura em disco.
- `content-generation`: a geração de conteúdo por aula passa a refletir a modalidade nas atividades, recursos e exemplos propostos.
- `content-quality-review`: o relatório de revisão passa a avaliar a adequação do conteúdo à modalidade declarada.

## Non-goals

- Não cria skills separadas por modalidade (decisão arquitetural: skill única parametrizada — ver design.md).
- Não altera a captura, validação ou persistência da modalidade (já corretas, capability `course-config`).
- Não trata o nível de conteúdo básico/intermediário/avançado (coberto pelo change `propagar-nivel-conteudo`).
- Não migra projetos legados: projetos sem `modalidade` em `projeto.json` seguem o comportamento atual (bloco de modalidade omitido); projetos híbridos sem `distribuicaoHibrida` seguem com distribuição proposta pelo modelo.
- Não valida formato do campo `distribuicaoHibrida` (texto livre por decisão — a variação entre cursos é grande).

## Impact

- **Gap relacionado**: G04 (sessão in-memory perdida ao reiniciar) — o fallback de disco para metodologia mitiga a manifestação mais grave desse gap no pipeline de geração.
- **Código**: `skills.js` (~10 funções: novo `MODALIDADE_DIRETRIZES`, `pedagCtxBlock` com parâmetro de modalidade, assinaturas de `metodologiaSkill`, `ementaSkill`, `planoEnsinoSkill`, `planLessonsSkill`, `planoAulaSkill`, `conteudoSkill`, `pesquisaWebSkill`, `pesquisaFallbackSkill`, `revisaoQualidadeSkill`, `aplicarMelhoriasSkill`); `server.js` (`buildPedagogicalContext` linhas 102-114 e ~10 call sites: 417, 445, 790, 812, 887, 974, 1017, 1178, 1771, 1977).
- **Frontend**: `public/index.html` (campo condicional `distribuicaoHibrida` na Etapa 1) e `public/app.js` (payload do `POST /api/config`, exibição condicional e restauração ao carregar projeto).
- **Testes**: `tests/unit/skills.test.js` (asserts de modalidade nos prompts), `tests/integration` (metodologia reimportada + sessão restaurada).
- **Custo de tokens**: +100-200 tokens/chamada no gpt-4o-mini — desprezível.
- **mcp-server.js**: ganho automático — repassa `config` às skills e herda o comportamento novo.
- **Docs**: `PROJECT.md`, `specs.yaml`.
