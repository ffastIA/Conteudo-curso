## Context

Hoje um 429 cai no `catch` geral e derruba a etapa. A pausa fixa de 4 s é uma proteção cega e não ajuda se o limite for estourado. O SDK `openai` 4.x faz retry próprio (2 tentativas) em 429, o que mascara a espera sem aviso na tela. `STALL_TIMEOUT_MS=45_000` aborta streams sem delta.

## Goals / Non-Goals

**Goals:** esperar só quando necessário, de forma visível; retomar de onde parou; sem buffer inteiro em memória nos downloads.
**Non-Goals:** fila de jobs; retomar no meio de um stream.

## Decisions

- **D1**: `comRateLimit` fica ao lado de `isRetriable`; detecta `OpenAI.RateLimitError` ou `err.status === 429`; lê `err.headers['retry-after']` (segundos ou data HTTP).
- **D2**: `new OpenAI({ maxRetries: 0 })` para o helper ser o único responsável.
- **D3**: `onWait(segundos, tentativa)` envia `progress` e reinicia o timer de inatividade do stall timeout.
- **D4**: repetição só ocorre quando o erro vem antes de qualquer token enviado ao cliente (evita texto duplicado).
- **D5**: paralelismo implementado com semáforo simples (`CONTEUDO_PARALELISMO`), padrão 1; documentar que só deve ser ligado após medir 429.
- **D6**: downloads usam `fetch` + `stream.pipeline(Readable.fromWeb(body), fs.createWriteStream)`, com `AbortSignal.timeout`, limite de bytes (`MAX_DOWNLOAD_BYTES`) e arquivo temporário renomeado ao fim.
- **D7**: `projeto.json` ganha `gamma.generationId` e `heygen[aula].videoId`.

- **D8 (implementação)**: `comRateLimit` fica dentro do wrapper `chamarOpenAI` (ponto único), então cobre todas as chamadas; a espera é avisada por SSE usando o `res` guardado no contexto da requisição. Como o SDK passou a `maxRetries: 0`, o helper também repete **falhas transitórias** (5xx e conexão) até 2 vezes — desvio da spec, para não perder a resiliência que o SDK dava; 400/401 nunca são repetidos.
- **D9**: plano de aula retomável por `plano_aula_progresso.json` (divisão em aulas) + `plano_aulaNN.txt`, removidos ao consolidar; `?refazer=1` ignora o progresso. Conteúdo pula aulas `completa`/`curta` com a mesma assinatura (título, módulo, objetivos, nível, público, duração, pré-requisitos) e o `.txt` em disco; `?refazer=1` refaz tudo.
- **D10**: paralelismo por pool de 2 trabalhadores; com 2 aulas simultâneas só o progresso é enviado (sem `token`). Limitação: o contexto de observabilidade (`aula`) é compartilhado entre as duas aulas.
- **D11**: Gamma/HeyGen gravam `geracoesExternas.<provedor>.<NN>` em `projeto.json` ao criar; a pendência só é limpa após o download (ou em falha/404 do provedor). Downloads: `baixarParaArquivo` (stream, timeout total, limite de bytes, temporário `.baixando`).

## Risks / Trade-offs

- Conta com TPM baixo (ver comentário em `skills.js:551`) → mais esperas visíveis; paralelismo desligado por padrão.
- Retry mal calibrado pode alongar etapas → teto de 60 s e máximo de 4 tentativas.
- Arquivo temporário órfão após queda → limpeza na próxima execução.
