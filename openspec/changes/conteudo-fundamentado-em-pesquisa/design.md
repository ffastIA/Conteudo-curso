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

- **D6**: IDs `[F#]` são LOCAIS a cada aula (renumerados F1..Fk a partir das fontes selecionadas para ela) — os IDs da pesquisa geral (`f1…`) e da pesquisa por módulo colidiriam. O dossiê usado fica em `estadoAulas[NN].dossie` do `projeto.json`.
- **D7**: a seção `### Referências da aula` é montada pelo sistema (título e URL do dossiê, só das fontes citadas), substituindo qualquer lista escrita pelo modelo; o prompt instrui o modelo a não escrevê-la. Em `sem_web` o texto sai sem `[F#]` nem referências.
- **D8**: a exigência da pesquisa por módulo não bloqueia projetos legados (conteúdo já gerado sem `pesquisa_modulos.json`); `PESQUISA_MODULOS_OBRIGATORIA=false` desliga a exigência (usado nos testes herdados em `tests/setup-env.js`).
- **D9**: dado numérico sem citação é contado por frase; slides, roteiro de avatar e vídeo recebem o texto sem `[F#]` e sem a seção de referências (`limparParaMidia`).
- **D10**: lógica pura em `fundamentacao.js`; rotas `GET /api/pesquisa-modulos`, `GET /api/pesquisa-modulos/status` e `POST /api/pesquisa-modulos/pular`.

## Risks / Trade-offs

- Modelo inventa `[F#]` → IDs só do dossiê + verificação mecânica.
- Prompt maior → seleção limita o dossiê a achados relevantes; estimativa em `custo-e-logs`.
- Projetos antigos sem pesquisa por módulo → `fonte: 'legado'`, fluxo antigo preservado.
