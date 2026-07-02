## Context

O sistema atual é um pipeline linear de 6 etapas que gera conteúdo didático usando OpenAI. A sessão do usuário é armazenada em memória (objeto `sessions`) e identificada por cookie HttpOnly. Todas as skills são funções em `skills.js` que recebem parâmetros e retornam texto ou stream. O frontend é uma SPA Vanilla JS com navegação por pills numeradas (1–6).

Esta change adiciona uma camada pedagógica transversal: Etapa 0 que coleta o perfil pedagógico do curso (BNCC em dois níveis + metodologia), injeta esse contexto em todas as skills existentes, adiciona um Agente de Qualidade final com persona pedagógica e disponibiliza montagem de PPC como ação pós-pipeline.

## Goals / Non-Goals

**Goals:**
- Etapa 0 com BNCC em arquitetura dois níveis: habilidades filtradas (letramento + cultura digital) para estudantes da Ed. Básica, ou C2 + C5 para adultos/profissionais
- Derivação automática de metodologia pedagógica sempre ativa
- Injeção de contexto pedagógico em todas as skills existentes sem alterar sua interface pública
- Agente de Qualidade com persona de especialista pedagógico gerando Relatório Técnico-Pedagógico exportável em `.docx`
- Exportação de PPC para cursos livres como ação pós-pipeline
- Novos campos `modalidade`, `preRequisitos` e `proporcaoTeoricoPratico` na Etapa 1

**Non-Goals:**
- Habilidades BNCC fora do escopo de letramento digital e cultura digital
- Certificação oficial de conformidade com BNCC
- PPC para cursos técnicos regulados ou ensino superior
- Persistência de sessão entre reinicializações do servidor

## Decisions

### D1 — Dados BNCC em `bncc-data.js` estático, filtrado ao escopo de projetos

**Decisão:** `bncc-data.js` contém apenas: (a) as habilidades BNCC de letramento digital e cultura digital (~60–80 entradas, ~15KB), organizadas por nível (EF1, EF2, EM); e (b) as competências gerais C2 e C5 com suas descrições. Carregado uma vez na inicialização do servidor.

**Razão:** O foco dos projetos é letramento digital e cultura digital — incluir as ~1.800 habilidades restantes criaria ruído na seleção e complexidade desnecessária. O dataset filtrado tem ~15KB (vs. ~400KB completo), é trivialmente rápido de carregar e cobre 100% dos casos de uso reais. Atualização futura requer apenas editar `bncc-data.js`.

---

### D2 — Arquitetura dois níveis na seleção BNCC

**Decisão:** A Etapa 0 bifurca em: (a) curso para estudantes da Ed. Básica → seleção de habilidades filtradas por nível (EF1, EF2, EM), multi-seleção; (b) curso para adultos/profissionais → multi-seleção entre C2 (Pensamento científico, crítico e criativo) e C5 (Cultura digital). Competência C4 suprimida — sua relação com letramento digital é tangencial e seu escopo é mais amplo que o foco dos projetos.

**Razão:** Habilidades BNCC são ancoradas em componente curricular e ano escolar — adequadas quando há correspondência direta com a Ed. Básica. Para adultos, forçar o encaixe em habilidades escolares distorceria o conteúdo. C2 e C5 cobrem com precisão o escopo de pensamento computacional, criticidade digital e cultura digital para qualquer público.

---

### D3 — Apenas itens selecionados vão para o prompt, nunca o dataset completo

**Decisão:** A sessão armazena somente os textos das habilidades ou competências escolhidas. As skills recebem `bnccContext` (string formatada com os itens selecionados) e `metodologia` (string) como parâmetros opcionais. O dataset BNCC completo nunca trafega para a OpenAI.

**Razão:** Controle de tokens. Usuários tipicamente selecionam 3–8 habilidades ou 1–2 competências. Custo estimado: 100–300 tokens extras por chamada. Enviar o dataset completo seria desnecessário e custoso.

---

### D4 — Contexto pedagógico como parâmetros opcionais nas skills existentes

**Decisão:** Cada skill existente recebe dois parâmetros opcionais adicionais: `metodologia` e `bnccContext`. Quando presentes, são concatenados ao prompt como bloco `## Contexto Pedagógico`. Quando ausentes (`null`/`undefined`), a skill se comporta exatamente como antes.

**Razão:** Parâmetros explícitos são rastreáveis e testáveis. Preserva o comportamento anterior sem wrapper ou acoplamento implícito.

---

### D5 — `metodologiaSkill` usa `gpt-4o-mini`, sem web search

**Decisão:** Derivação da metodologia pedagógica via `gpt-4o-mini` com prompt especializado. Metodologias consideradas: ABP, instrução direta, sala invertida, andragogia, aprendizagem por projetos, ensino híbrido, taxonomia de Bloom como estrutura de objetivos.

**Razão:** Metodologias pedagógicas consagradas são conhecimento estável no modelo. A `pesquisaWebSkill` já cobre tendências de mercado na Etapa 2. Web search aqui adicionaria latência sem ganho relevante.

---

### D6 — Agente de Qualidade via SSE com persona de especialista pedagógico

**Decisão:** `/api/qualidade` segue o padrão SSE (eventos `progress`, `token`, `done`, `error`). O prompt da `qualidadeSkill` define persona explícita: especialista em design instrucional e pedagogia, com voz consultiva. O relatório tem seções fixas pré-definidas com conteúdo gerado pelo modelo. Exportado como `.docx` via `buildDocxRelatorio()`.

**Estrutura do Relatório Técnico-Pedagógico:**
1. Parecer Geral (síntese executiva)
2. Alinhamento BNCC (se ativo) — cobertura das habilidades/competências selecionadas
3. Aderência à Metodologia Pedagógica — boas práticas observadas e ausentes
4. Coerência entre Etapas — relação lógica ementa → plano de ensino → planos de aula → conteúdo
5. Aderência à Carga Horária e Proporção Teórico/Prático
6. Apontamentos Específicos — com fundamentação pedagógica por item
7. Recomendações Priorizadas — o que ajustar e por quê

**Razão:** Seções fixas garantem que todas as dimensões sejam avaliadas em toda execução. Persona pedagógica garante fundamentação didática nos apontamentos, não apenas revisão de coerência textual. SSE evita timeout para cursos com muitas aulas.

---

### D7 — PPC como ação pós-pipeline, não etapa numerada

**Decisão:** Botão "Gerar PPC" disponível após conclusão do pipeline. Executa 4 skills complementares (`perfilEgressoSkill`, `competenciasSkill`, `perfilDocenteSkill`, `infraestruturaSkill`) + `ppcAssemblySkill`. Exportado via `buildDocxPPC()`.

**Razão:** PPC é documento institucional opcional. Separação mantém o fluxo principal limpo e evita obrigar usuários que não precisam de PPC a percorrer a etapa.

## Risks / Trade-offs

**[Risco] Prompt muito longo na `qualidadeSkill` para cursos com muitas aulas**
→ Mitigação: Truncar conteúdo de cada aula para 1.500 caracteres (padrão já usado no sistema). Usar sumário consolidado quando total estimado exceder 8.000 tokens.

**[Risco] Contexto pedagógico aumenta consumo de tokens em todas as etapas**
→ Mitigação: Bloco `## Contexto Pedagógico` compacto (~100–300 tokens). Acréscimo estimado de 5–8% no total do pipeline.

**[Risco] Usuário seleciona caminho errado na bifurcação BNCC (Ed. Básica vs. adultos)**
→ Mitigação: UI com pergunta clara e exemplos ("Curso ministrado em escola? Alunos do EF ou EM?"). A escolha pode ser revista retornando à Etapa 0.

**[Risco] `bncc-data.js` desatualizado em revisão curricular futura**
→ Mitigação: Comentário de versão e data de referência no arquivo (BNCC 2017/2018). Estrutura modular permite atualização sem tocar em lógica.

## Migration Plan

1. Nenhuma migração de dados — sessões in-memory, sem banco de dados.
2. Etapa 0 inserida antes da Etapa 1 existente. Endpoints das Etapas 1–6 inalterados.
3. Parâmetros pedagógicos nas skills são opcionais — comportamento anterior preservado quando ausentes.
4. Deploy: substituição de `server.js`, `skills.js`, `public/app.js`, `public/index.html` + adição de `bncc-data.js`. Sem downtime especial.
