## Context

`conteudoSkill` é invocada em `/api/conteudo` (~2734) sem pesquisa. Slides, roteiros e vídeos reaproveitam o texto da aula e não devem exibir marcadores `[F#]`.

## Goals / Non-Goals

**Goals:** cada aula cita ao menos 2 fontes do próprio módulo; nenhum `[F#]` inexistente; modo `sem_web` sem referências.
**Non-Goals:** verificar a sustentação semântica; pesquisa por aula.

## Decisions

- **D1**: `pesquisa_modulos.json` reutiliza o esquema de `pesquisa.json` (consultas/fontes/achados) com chave por módulo; IDs globais `F1…Fn`.
- **D2**: cache por módulo: módulos já presentes e válidos no JSON não são refeitos; pausa entre consultas via `comRateLimit` (change `geracao-retomavel`) ou espera curta até lá.
- **D3**: `selecionarFontesParaAula` escolhe achados do módulo e, havendo espaço, achados gerais por `textSimilarity`; nunca corta no meio de um achado.
- **D4**: verificação mecânica em função pura `verificarCitacoes(texto, fontes)` → `{ idsInvalidos, fontesDistintas, numerosSemCitacao }`, registrada em `geracao_log.json` e no relatório.
- **D5**: `removerMarcadoresFonte(texto)` aplicado ao montar prompts de slides/roteiro/vídeo.

## Risks / Trade-offs

- Modelo inventa `[F#]` → IDs só do dossiê + verificação mecânica.
- Prompt maior → seleção limita o dossiê a achados relevantes; estimativa em `custo-e-logs`.
- Projetos antigos sem pesquisa por módulo → `fonte: 'legado'`, fluxo antigo preservado.
