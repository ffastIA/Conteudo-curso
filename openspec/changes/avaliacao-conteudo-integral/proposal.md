## Why

Revisão, score, relatório técnico e PPC avaliam apenas o início das aulas: revisão lê 2.000 caracteres, juiz de score 4.000 por versão, relatório técnico 1.500 por aula, infraestrutura do PPC 3.000 de todo o conteúdo, e PPC recebe versões parciais de plano de ensino, plano de aula e pesquisa (achado B1). Melhorias em seções posteriores ficam invisíveis e tendem a ser rejeitadas. Resolve o **Gap G11** e parte do **G12**.

## What Changes

- Regra geral: nenhuma skill de avaliação recebe texto cortado por contagem de caracteres; quando não couber, a avaliação é dividida (map-reduce), não encurtada. Teste automatizado proíbe `truncate(` nas rotas de revisão, score, qualidade e PPC.
- Map-reduce por seção: cada seção da aula é avaliada com os 5 critérios da rubrica e contexto de referência; chamada final consolida revisão, "Resumo de Melhorias Propostas" e nota pela fórmula existente (0,7 × rubrica + 0,3 × determinístico). Aulas curtas seguem em chamada única, escolhida pelo tamanho estimado em tokens.
- `/api/qualidade` recebe notas por aula, resumo por seção e documentos de referência completos, em duas etapas (análise por módulo e síntese final).
- Gate de score: julgamento pareado compara as seções alteradas e faz checagem global de coerência da aula completa; quando não couber, avalia por seção e agrega; `EPSILON_ACEITE` (0,02) e regra do marcador `[user]` ficam como estão; `score_historico.json` registra seções vistas pelo juiz e versiona a fórmula.
- Componente determinístico de fundamentação (citações, fontes distintas, `[F#]` válidos), ativo só quando a pesquisa está em `web`, dentro do peso de 30% do determinístico; alerta de citação fraca no relatório.
- PPC: infraestrutura recebe resumo por aula e lista de recursos de todas as seções; justificativa usa achados da pesquisa.

## Capabilities

### New Capabilities
- `full-content-evaluation`: avaliação integral por seção, gate de score completo e fundamentação.

### Modified Capabilities
*(nenhuma)*

## Impact

- **`server.js`**: `/api/revisao-qualidade` (~3247), `/api/qualidade` (~1480), PPC (~1576-1585), gate de score (~3553-3770), realinhamento (~3871-3888), `score_historico.json`
- **`skills.js`**: `revisaoQualidadeSkill`, `scoreAulaSkill`, `qualidadeSkill`, `infraestruturaSkill`, `ppcAssemblySkill`
- Depende de `conteudo-fundamentado-em-pesquisa` e `conteudo-completo-por-secoes`. Sem dependência npm nova.

## Non-goals

- Não alterar a rubrica de 5 critérios nem a fórmula-base de nota.
- Não alterar `EPSILON_ACEITE` nem a regra `[user]`.
- Não regenerar conteúdo automaticamente a partir da avaliação.

## Gap resolvido

G11 (avaliação sobre texto truncado); parcialmente G12.
