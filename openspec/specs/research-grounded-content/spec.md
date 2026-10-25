# research-grounded-content Specification

## Purpose
TBD - created by archiving change conteudo-fundamentado-em-pesquisa. Update Purpose after archive.
## Requirements
### Requirement: Pesquisa por módulo antes do conteúdo
O sistema SHALL oferecer `GET /api/pesquisa-modulos` (SSE) que, entre as Etapas 4 e 5, executa uma consulta focada por módulo do plano de ensino (título, objetivos das aulas, nível e público), grava `scr/pesquisa_modulos.json` e `pesquisa_modulos.docx`, e retoma de onde parou sem refazer módulos já pesquisados.

#### Scenario: Pesquisa concluída
- **WHEN** todos os módulos são pesquisados
- **THEN** `pesquisa_modulos.json` e `pesquisa_modulos.docx` existem e o evento `done` é enviado

#### Scenario: Retomada após queda
- **WHEN** o servidor reinicia com metade dos módulos já gravados
- **THEN** apenas os módulos faltantes são pesquisados

### Requirement: Etapa 5 condicionada à pesquisa por módulo
A Etapa 5 SHALL exigir a pesquisa por módulo concluída, ou a escolha explícita de "gerar sem pesquisa por módulo", que marca o projeto com `fonte: 'modelo_sem_busca'`.

#### Scenario: Pesquisa ausente
- **WHEN** o usuário inicia a Etapa 5 sem pesquisa por módulo e sem escolher pular
- **THEN** a resposta é erro SSE orientando a concluir ou pular a pesquisa

### Requirement: Bloco de pesquisa nos prompts
`skills.js` SHALL fornecer `pesquisaBlock(achados, fontes)` que monta `## Fontes e achados da pesquisa` com IDs `[F1]`, `[F2]`, título, domínio e resumo, usado junto com `pedagCtxBlock` em `conteudoSkill`, `planoEnsinoSkill`, `planoAulaSkill`, `revisaoQualidadeSkill`, `scoreAulaSkill`, `qualidadeSkill` e `ppcAssemblySkill`. A seleção de fontes por aula SHALL escolher achados inteiros, sem cortá-los.

#### Scenario: Conteúdo recebe o dossiê
- **WHEN** `conteudoSkill` monta o prompt de uma aula
- **THEN** o prompt contém os achados do módulo da aula e o `pedagCtxBlock`

#### Scenario: Seleção sem corte
- **WHEN** há mais achados do que cabem
- **THEN** achados inteiros são omitidos, nunca truncados no meio

### Requirement: Pré-requisitos e formato BNCC consistentes
`preRequisitos` SHALL ser incluído nos prompts de ementa, plano de ensino, plano de aula e conteúdo, e o contexto BNCC da ementa SHALL usar o mesmo formato do `pedagCtxBlock`.

#### Scenario: Pré-requisitos no conteúdo
- **WHEN** o curso tem `preRequisitos` definidos
- **THEN** o prompt do conteúdo os contém

### Requirement: Regras de citação no conteúdo
`conteudoSkill` SHALL instruir a marcar afirmações factuais com `[F#]`, citar apenas IDs fornecidos, não inventar fontes e encerrar com `### Referências da aula`. Quando a pesquisa estiver em `sem_web`, a skill SHALL instruir o oposto: não citar nem simular referências.

#### Scenario: Modo web
- **WHEN** a pesquisa está em `web`
- **THEN** o prompt exige `[F#]` e a seção `### Referências da aula`

#### Scenario: Modo sem_web
- **WHEN** a pesquisa está em `sem_web`
- **THEN** o prompt proíbe citações e a aula gerada não contém seção de referências

### Requirement: Verificação mecânica de citações
Após cada aula o sistema SHALL verificar se todo `[F#]` existe no dossiê, quantas fontes distintas foram usadas e se há dado numérico sem citação, registrando falhas no relatório sem bloquear a gravação.

#### Scenario: ID inexistente
- **WHEN** a aula contém `[F99]` e o dossiê não tem `F99`
- **THEN** um alerta é registrado no relatório e a aula é gravada normalmente

### Requirement: Material falado ou projetado sem marcadores
Slides, roteiros e vídeos SHALL receber o texto da aula sem os marcadores `[F#]`, e o `.docx` da aula SHALL trazer as referências com URL.

#### Scenario: Slides
- **WHEN** o prompt de slides é montado a partir de uma aula com `[F1]`
- **THEN** o texto enviado ao Gamma não contém `[F1]`

