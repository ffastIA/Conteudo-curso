## Why

A pesquisa só alimenta o plano de ensino (texto cru) e o PPC (truncada em 1.500 caracteres); `conteudoSkill` não recebe pesquisa nenhuma, e `preRequisitos` só chega ao PPC (achados A2, B5, parte de B1). O conteúdo das aulas não cita fontes e não se apoia em dados atuais. Resolve parcialmente o **Gap G12** (pesquisa sem verificação de fonte).

## What Changes

- Novo endpoint SSE `GET /api/pesquisa-modulos` entre as Etapas 4 e 5: uma consulta focada por módulo do plano de ensino, usando `executarPesquisaWeb`; resultado em `scr/pesquisa_modulos.json` e `pesquisa_modulos.docx`, com cache e retomada por módulo.
- A Etapa 5 exige a pesquisa por módulo concluída ou escolha explícita de "gerar sem pesquisa por módulo" (marca `fonte: 'modelo_sem_busca'`).
- Helper `pesquisaBlock(achados, fontes)` em `skills.js`, usado junto com `pedagCtxBlock`; seleção (não corte) via `selecionarFontesParaAula(aula)`.
- Skills que recebem o bloco: `conteudoSkill`, `planoEnsinoSkill`, `planoAulaSkill`, `revisaoQualidadeSkill`, `scoreAulaSkill`, `qualidadeSkill`, `ppcAssemblySkill`.
- `preRequisitos` entra em ementa, plano de ensino, plano de aula e conteúdo; contexto BNCC da ementa passa a usar o formato do `pedagCtxBlock`.
- Regras de citação: `[F#]` apenas com IDs fornecidos, seção final `### Referências da aula`; em `sem_web`, regra oposta (não citar). Verificação mecânica pós-aula (IDs válidos, fontes distintas, números sem citação) que alimenta o relatório sem bloquear.
- `.docx` da aula traz referências com URL; slides, roteiros e vídeos recebem o texto sem `[F#]`.

## Capabilities

### New Capabilities
- `research-grounded-content`: pesquisa por módulo, injeção no prompt, citações e verificação mecânica.

### Modified Capabilities
*(nenhuma)*

## Impact

- **`server.js`**: novo `/api/pesquisa-modulos`, `selecionarFontesParaAula`, verificação mecânica, gate da Etapa 5, remoção de `[F#]` na montagem de slides/roteiros/vídeo
- **`skills.js`**: `pesquisaBlock` e as skills listadas
- **`public/app.js` / `index.html`**: nova sub-etapa, botão "gerar sem pesquisa por módulo"
- Depende de `pesquisa-web-real`. Sem dependência npm nova.

## Non-goals

- Não pesquisar por aula (custo/tempo); o nível é o módulo.
- Não bloquear a gravação por falha de citação.
- Não verificar semanticamente se a fonte sustenta a afirmação (isso é da change `avaliacao-conteudo-integral`).
