# Proposal: propagar-nivel-conteudo

## Why

O nível de conteúdo escolhido na Etapa 1 (`Básico`, `Intermediário`, `Avançado` — campo `nivel` do `CourseConfig`, `public/index.html:133-141`) chega a 9 skills do pipeline apenas como linha inerte de metadado (`Nível: X`), sem nenhuma diretriz operacional sobre o que o nível implica em profundidade, vocabulário, pré-requisitos e complexidade — o gpt-4o-mini produz conteúdo genérico "de nível médio" seja qual for a escolha. Três skills nem recebem o nível (`slidesSkill`, `revisaoQualidadeSkill`, `aplicarMelhoriasSkill`), e as consultas de pesquisa web não são direcionadas pelo nível.

## What Changes

- Criar mapa `NIVEL_DIRETRIZES` em `skills.js` com diretrizes pedagógicas por nível em duas variantes: `geral` (profundidade, vocabulário, pré-requisitos assumidos, tipo de exemplos/atividades, nível-alvo da Taxonomia de Bloom — framework que o sistema já adota) e `pesquisa` (direcionamento das buscas web: básico → guias introdutórios e fundamentos; avançado → documentação avançada, benchmarks, tendências).
- Helper `nivelBlock(nivel, tipo)` com normalização (caixa/acentos — o formulário envia `"Básico"`) e fallback vazio para valor ausente/desconhecido.
- Injetar o bloco de nível nas 9 skills que já recebem `nivel` (`metodologiaSkill`, `ementaSkill`, `pesquisaWebSkill`, `pesquisaFallbackSkill`, `planoEnsinoSkill`, `planLessonsSkill`, `planoAulaSkill`, `conteudoSkill`, `estiloVisualSkill`); nas duas de pesquisa, usar também a variante `pesquisa`.
- Fechar as 3 lacunas: `slidesSkill` passa a receber `nivel` (call site `server.js:663`); `revisaoQualidadeSkill` ganha seção obrigatória de avaliação "Adequação ao Nível Declarado"; `aplicarMelhoriasSkill` passa a injetar as diretrizes de nível.
- Declarar no `system` das skills de ementa, planos e conteúdo que o nível configurado tem **peso alto** na definição de profundidade, vocabulário e complexidade (subordinado apenas à Metodologia Pedagógica definida).
- Exibir o **Nível** no cabeçalho de identificação dos documentos gerados (ementa, plano de ensino, plano de aula) — hoje o nível é só dado de entrada do prompt, sem garantia de aparecer no documento.

## Capabilities

### New Capabilities

(nenhuma — a mudança estende capabilities existentes)

### Modified Capabilities

- `content-generation`: a geração de ementa, planos, divisão em aulas, conteúdo e as consultas de pesquisa web passam a ser governadas por diretrizes explícitas do nível declarado.
- `slides-generation`: a geração de slides passa a receber o nível e adequar densidade e vocabulário.
- `content-quality-review`: o relatório de revisão passa a avaliar adequação ao nível declarado, e a aplicação de melhorias passa a respeitá-lo.

## Non-goals

- Não cria skills separadas por nível (decisão arquitetural: skill única parametrizada — ver design.md).
- Não altera a captura/persistência do `nivel` (já corretas: `POST /api/config` → `projeto.json`).
- Não toca no nível BNCC (`ef1/ef2/em/competencias`, `public/index.html:84-92`) — conceito distinto do nível de conteúdo; a implementação não deve confundi-los.
- Não trata modalidade (coberto pelo change `propagar-modalidade-curso`).

## Impact

- **Gap relacionado**: nenhum gap do registro (G01–G07); melhora indireta de G07 ao adicionar asserts de prompt.
- **Código**: quase todo em `skills.js` (~12 funções); `server.js` apenas no call site do `slidesSkill` (`server.js:663`).
- **Testes**: `tests/unit/skills.test.js` — asserts do bloco de nível por skill (3 níveis + fallback).
- **Custo de tokens**: +100-200 tokens/chamada — desprezível.
- **Comportamento**: conteúdo regenerado ficará diferente de projetos existentes — esperado, é o objetivo.
- **Docs**: `specs.yaml` (campo `nivel` e diretrizes), `PROJECT.md`.
- **Sinergia**: reutiliza o mesmo padrão de injeção do change `propagar-modalidade-curso`; se implementado depois dele, o esforço cai.
