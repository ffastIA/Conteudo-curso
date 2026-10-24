## Why

A geração é frágil e lenta: `/api/plano-aula` só grava no fim e não tem `max_tokens` nem stall timeout; `/api/conteudo` recomeça da aula 1; downloads Gamma/HeyGen não têm timeout e carregam o arquivo inteiro na memória; faltam abort signals em score, realinhamento, PPC, metodologia e ementa; e uma pausa fixa de 4 s separa as aulas (`server.js:2717`, `3614`, `3879`) sem qualquer tratamento de 429 (achados A7, B2). Resolve parcialmente **G05**.

## What Changes

- `/api/plano-aula`: grava `plano_aulaNN.txt` por aula e consolida `plano_de_aula.txt/.docx` no fim; aplica `max_tokens` e stall timeout; retoma de onde parou.
- `/api/conteudo`: pula aulas `completa` (estado de `conteudo-completo-por-secoes`), com opção "refazer tudo".
- Helper `comRateLimit(fn, { signal, onWait, maxTentativas })`: espera adaptativa em 429 (usa `retry-after`, senão backoff 2 s·2ⁿ com teto 60 s), repete só antes do primeiro token do stream, emite `progress` SSE e não deixa o stall timeout disparar. Cliente OpenAI com `maxRetries: 0`.
- Remoção das 3 pausas fixas de 4 s depois do helper aplicado em geração, melhorias, score e realinhamento.
- `CONTEUDO_PARALELISMO` (padrão 1, máximo 2) — liberado só depois de medir 429 em curso real.
- Gamma e HeyGen: `generationId`/`videoId` gravados em `projeto.json` para retomar o polling; downloads com timeout, limite de tamanho e gravação em stream.
- Abort signal do cliente propagado para score, realinhamento, PPC, metodologia, ementa e estilos visuais.

## Capabilities

### New Capabilities
- `resumable-generation`: retomada de planos, conteúdo e polling externo; downloads robustos; abort signals.
- `rate-limit-handling`: espera adaptativa em 429 e paralelismo controlado.

### Modified Capabilities
*(nenhuma)*

## Impact

- **`server.js`**: `isRetriable` (~108), cliente OpenAI, `/api/plano-aula` (~2462), `/api/conteudo` (~2710), melhorias (~3614), realinhamento (~3879), Gamma/HeyGen (~1024-1290), `saveProject`
- **`tests/__mocks__/openai.js`**: `RateLimitError`, `AuthenticationError`, `BadRequestError` (pré-requisito — ver `base-de-testes-realista`)
- **`public/app.js`**: opção "refazer tudo", progresso de espera
- Sem dependência npm nova (APIs nativas do Node).

## Non-goals

- Não usar polling do cliente nem WebSockets (SSE apenas).
- Não retomar uma chamada OpenAI no meio de um stream (só antes do primeiro token).
- Não criar fila persistente de jobs.

## Gap resolvido

G05 (confiabilidade). Ordem interna do A7: mock → helper → `maxRetries: 0` → aplicar nos pontos → remover pausa → medir 429 → só então paralelismo.
