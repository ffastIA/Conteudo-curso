# full-content-evaluation Specification

## Purpose
TBD - created by archiving change avaliacao-conteudo-integral. Update Purpose after archive.
## Requirements
### Requirement: Nenhum truncamento em avaliação
Nenhuma skill de avaliação (revisão, score, relatório técnico, PPC) SHALL receber texto cortado por contagem de caracteres; quando o conteúdo não couber numa chamada, a avaliação SHALL ser dividida e nunca encurtada. Um teste automatizado SHALL falhar se `truncate(` reaparecer no código dessas rotas.

#### Scenario: Aula longa
- **WHEN** uma aula excede a janela estimada de uma chamada
- **THEN** a avaliação é dividida por seção e nenhuma parte do texto é descartada

#### Scenario: Regressão
- **WHEN** `truncate(` é adicionado a uma rota de avaliação
- **THEN** o teste estático falha

### Requirement: Avaliação map-reduce por seção
Quando a aula não couber em uma chamada, o sistema SHALL avaliar cada seção com os 5 critérios da rubrica e o contexto de referência (plano de aula, plano de ensino, ementa, nível, público, modalidade, achados da pesquisa), e SHALL consolidar em uma chamada final a revisão, o "Resumo de Melhorias Propostas" e a nota pela fórmula `0,7 × rubrica + 0,3 × determinístico`. Aulas que cabem inteiras SHALL seguir em chamada única, escolhida pelo tamanho estimado em tokens.

#### Scenario: Revisão registra todas as seções
- **WHEN** a revisão de uma aula é concluída
- **THEN** o log registra 100% das seções da aula como lidas

#### Scenario: Aula curta
- **WHEN** a aula cabe inteira na janela
- **THEN** a avaliação usa chamada única sem cortes

### Requirement: Relatório técnico-pedagógico completo
`/api/qualidade` SHALL receber as notas por aula, o resumo por seção e os documentos de referência completos, em duas etapas (análise por módulo e síntese final), sem `truncate(c.texto, 1500)`.

#### Scenario: Relatório gerado
- **WHEN** o relatório é gerado
- **THEN** cada aula contribui com notas e resumo por seção, e as referências entram completas

### Requirement: Gate de score com a aula inteira
O julgamento pareado SHALL comparar as seções efetivamente alteradas (original × candidata) e fazer uma checagem global de coerência da aula completa; quando a comparação não couber, o gate SHALL avaliar por seção e agregar no mesmo modelo de nota composta. `EPSILON_ACEITE` (0,02) e a regra do marcador `[user]` SHALL permanecer inalterados, e `score_historico.json` SHALL registrar as seções vistas pelo juiz e a versão da fórmula.

#### Scenario: Melhoria na última seção
- **WHEN** uma melhoria é aplicada apenas na última seção de uma aula longa
- **THEN** o juiz de score recebe essa seção e a melhoria é considerada no cálculo

#### Scenario: Auditoria
- **WHEN** um ciclo de score termina
- **THEN** `score_historico.json` contém `secoesVistas` e `formulaVersao`

### Requirement: Componente determinístico de fundamentação
Quando a pesquisa estiver em `web`, o componente determinístico SHALL incluir fundamentação (proporção de afirmações citadas, nº de fontes distintas e `[F#]` válidos) dentro do peso de 30% do determinístico, sem alterar a rubrica de 5 critérios nem a fórmula-base. A revisão SHALL alertar citações fracas quando a fonte citada não sustentar o texto da seção.

#### Scenario: Pesquisa em web
- **WHEN** a pesquisa está em `web`
- **THEN** o componente de fundamentação entra no determinístico

#### Scenario: Pesquisa sem web
- **WHEN** a pesquisa está em `sem_web`
- **THEN** o componente de fundamentação não é aplicado

### Requirement: PPC com contexto integral
A skill de infraestrutura do PPC SHALL receber o resumo por aula e a lista de recursos mencionados em todas as seções, e a justificativa SHALL usar os achados estruturados da pesquisa, sem cortes por caracteres nos documentos de referência.

#### Scenario: PPC gerado
- **WHEN** o PPC é montado
- **THEN** a infraestrutura reflete recursos de todas as aulas, não só da primeira

