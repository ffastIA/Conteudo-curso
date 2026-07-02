## Why

O sistema atual gera conteúdo didático tecnicamente consistente, mas sem fundamentação pedagógica explícita: não considera metodologias de ensino adequadas ao perfil do público, não oferece alinhamento com a BNCC quando aplicável, e não possui mecanismo de certificação da qualidade pedagógica ao final do pipeline. O resultado é conteúdo tecnicamente correto, porém sem garantia de coerência didática entre etapas, sem orientação ao professor sobre as escolhas pedagógicas e sem aderência verificada à carga horária e à proporção teórico/prático definidas.

## What Changes

- **Nova Etapa 0 — Base Pedagógica**: pergunta se o curso se alinha à BNCC (opcional); se sim, coleta nível de ensino e exibe competências gerais para **multi-seleção** (checkboxes — múltiplas competências podem ser selecionadas simultaneamente). Em seguida, deriva automaticamente a metodologia pedagógica mais adequada ao perfil do curso (público, faixa etária, nível, carga horária) — sempre ativa, independente da escolha BNCC.
- **Etapa 1 ampliada**: três novos campos em `CourseConfig` — `modalidade` (presencial/EaD/híbrido), `preRequisitos` e `proporcaoTeoricoPratico` (percentual teoria x prática).
- **Contexto pedagógico injetado nas skills existentes**: todas as skills (`ementaSkill`, `planoEnsinoSkill`, `planoAulaSkill`, `conteudoSkill`, `expansaoConteudoSkill`) recebem o contexto pedagógico (metodologia + competências BNCC selecionadas, se ativas) como parte do prompt, garantindo que as boas práticas pedagógicas sejam observadas e justificadas ao longo de toda a geração.
- **Nova Etapa Final — Agente de Qualidade Pedagógica**: agente com **perfil de especialista em design instrucional e pedagogia**, que gera um **Relatório Técnico-Pedagógico** com parecer geral, análise por dimensão (BNCC, metodologia, coerência entre etapas, carga horária, proporção teórico/prático), apontamentos fundamentados em princípios didáticos e recomendações priorizadas de melhoria. Exportado como `.docx`.
- **Exportação PPC para cursos livres**: botão "Gerar PPC" disponível após o pipeline completo; executa 4 skills complementares (`perfilEgressoSkill`, `competenciasSkill`, `perfilDocenteSkill`, `infraestruturaSkill`) e monta documento `.docx` com estrutura formal de PPC.

## Capabilities

### New Capabilities

- `bncc-alignment`: Etapa 0 opcional — coleta nível de ensino e competências BNCC via multi-seleção (array); salva na sessão como contexto permanente para todas as skills.
- `pedagogical-methodology`: Derivação automática da metodologia pedagógica com base no perfil do curso; injetada em todas as skills como contexto permanente com justificativas didáticas.
- `quality-certification`: Agente final com persona de especialista pedagógico que gera Relatório Técnico-Pedagógico auditando coerência BNCC (se ativo), metodologia, relação lógica entre etapas e aderência à carga horária e proporção teórico/prático. Exportável como `.docx`.
- `ppc-export`: Montagem do Projeto Pedagógico de Curso para cursos livres a partir dos artefatos já gerados + 4 skills complementares (`perfilEgressoSkill`, `competenciasSkill`, `perfilDocenteSkill`, `infraestruturaSkill`).

### Modified Capabilities

- `course-config`: Adição de `modalidade`, `preRequisitos` e `proporcaoTeoricoPratico` ao modelo `CourseConfig` e ao formulário da Etapa 1.

## Non-goals

- Não mapear habilidades específicas da BNCC com códigos (EF06MA01 etc.) — apenas competências gerais e áreas.
- Não validar automaticamente conformidade com a BNCC — o agente orienta, não certifica oficialmente.
- Não gerar PPC para cursos técnicos regulados (SENAI/SENAC) ou ensino superior (MEC/DCN).
- Não implementar persistência de sessão entre reinicializações (Gap G04 — escopo separado).
- Não alterar o comportamento funcional das Etapas 2–6 além da injeção de contexto pedagógico nos prompts.

## Impact

- **`server.js`**: novos endpoints `/api/bncc`, `/api/metodologia`, `/api/qualidade`, `/api/ppc`; modelo `Session` ampliado com `bncc` (objeto com `ativo`, `nivel`, `competencias: string[]`), `metodologia` (string) e `proporcaoTeoricoPratico` (string); modelo `CourseConfig` com 3 novos campos.
- **`skills.js`**: 8 novas skills (`bnccSkill`, `metodologiaSkill`, `qualidadeSkill`, `perfilEgressoSkill`, `competenciasSkill`, `perfilDocenteSkill`, `infraestruturaSkill`, `ppcAssemblySkill`); todas as skills existentes recebem parâmetros adicionais de contexto pedagógico.
- **`public/app.js` + `public/index.html`**: nova Etapa 0 com UI de multi-seleção de competências BNCC, 3 novos campos na Etapa 1, nova seção de Agente de Qualidade após Etapa 5/6, botão "Gerar PPC".
- **`mcp-server.js`**: exposição das novas skills como tools MCP.
- **`specs.yaml`**: atualização dos modelos `CourseConfig` e `Session`, adição dos novos endpoints e skills.
- Nenhuma dependência npm nova necessária.
