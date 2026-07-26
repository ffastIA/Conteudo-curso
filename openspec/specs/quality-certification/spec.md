## Purpose

Gerar, como etapa final opcional do pipeline (Agente de Qualidade), um
Relatório Técnico-Pedagógico avaliando a qualidade didática geral do curso,
com persona de especialista e seções fixas, exportável como `.docx`.

## Requirements

### Requirement: Agente de Qualidade disponível após conclusão do pipeline
O sistema SHALL disponibilizar o Agente de Qualidade Pedagógica após a conclusão da Etapa 5 (ou Etapa 6, se executada), como etapa final do fluxo, via endpoint `GET /api/qualidade` com resposta em SSE.

#### Scenario: Acionamento do Agente de Qualidade
- **WHEN** o usuário clica em "Gerar Relatório de Qualidade" após concluir o pipeline
- **THEN** o sistema inicia stream SSE com eventos `progress`, `token`, `done` e `error`, seguindo o padrão existente do sistema

#### Scenario: Pipeline incompleto
- **WHEN** o usuário tenta acionar o Agente de Qualidade sem ter concluído ao menos a Etapa 5
- **THEN** o sistema retorna erro 400 com mensagem indicando quais etapas ainda precisam ser concluídas

---

### Requirement: Persona de especialista pedagógico no prompt da qualidadeSkill
O prompt da `qualidadeSkill` SHALL definir explicitamente a persona do agente: especialista em design instrucional e pedagogia, com experiência em cursos livres e letramento digital, voz consultiva e fundamentação em princípios didáticos reconhecidos. Cada apontamento deve ser justificado pedagogicamente, não apenas descrito.

#### Scenario: Apontamento com fundamentação
- **WHEN** o agente identifica ausência de atividade prática em uma aula predominantemente teórica
- **THEN** o relatório cita o princípio pedagógico aplicável (ex: Taxonomia de Bloom — níveis de aplicação) e recomenda o tipo de atividade adequado, não apenas registra a ausência

---

### Requirement: Relatório Técnico-Pedagógico com seções fixas
O sistema SHALL gerar um Relatório Técnico-Pedagógico com as seguintes seções fixas, sempre presentes independentemente do perfil do curso:

1. **Parecer Geral** — síntese executiva da qualidade pedagógica do material
2. **Alinhamento BNCC** — cobertura das habilidades/competências selecionadas (seção omitida se BNCC inativo)
3. **Aderência à Metodologia Pedagógica** — boas práticas observadas e lacunas identificadas
4. **Coerência entre Etapas** — relação lógica entre ementa, plano de ensino, planos de aula e conteúdo
5. **Aderência à Carga Horária e Proporção Teórico/Prático** — análise quantitativa e qualitativa
6. **Apontamentos Específicos** — itens individuais com localização, problema identificado e fundamentação pedagógica
7. **Recomendações Priorizadas** — lista ordenada por impacto pedagógico do que ajustar e por quê

#### Scenario: Relatório com BNCC ativo
- **WHEN** `session.bncc.ativo === true` e o relatório é gerado
- **THEN** a seção "Alinhamento BNCC" avalia explicitamente cada habilidade/competência selecionada e indica se foi contemplada, parcialmente contemplada ou ausente no material gerado

#### Scenario: Relatório sem BNCC
- **WHEN** `session.bncc.ativo === false`
- **THEN** a seção "Alinhamento BNCC" é omitida do relatório sem deixar espaço em branco

---

### Requirement: Controle de tokens na análise de cursos extensos
O sistema SHALL truncar o conteúdo de cada aula para os primeiros 1.500 caracteres ao montar o prompt da `qualidadeSkill`, mantendo o padrão de controle de tokens já existente no sistema.

#### Scenario: Curso com muitas aulas
- **WHEN** o curso tem mais de 10 aulas e o total de conteúdo excederia 8.000 tokens estimados
- **THEN** o sistema usa o texto truncado de cada aula e inclui nota no prompt indicando que o conteúdo foi resumido para análise

---

### Requirement: Exportação do relatório como .docx
O sistema SHALL exportar o Relatório Técnico-Pedagógico como arquivo `.docx` via `POST /api/export/qualidade`, persistindo `relatorio_qualidade.txt` e `relatorio_qualidade.docx` em `saídas/{course-slug}/`.

#### Scenario: Exportação do relatório
- **WHEN** o usuário clica em "Exportar Relatório" após a geração
- **THEN** o sistema gera e disponibiliza `relatorio_qualidade.docx` com capa, cabeçalho, rodapé e seções formatadas, seguindo o padrão `buildDocx` existente
