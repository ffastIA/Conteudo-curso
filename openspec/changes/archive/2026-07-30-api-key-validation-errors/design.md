## Context

`server.js` já tem dois pontos de leitura de chave de API externa, no mesmo
padrão (`const X_API_KEY = process.env.X_API_KEY`, usada depois em headers
de `fetch`): `GAMMA_API_KEY` (Etapa 8, linha ~30) e `HEYGEN_API_KEY` (Etapa
10, linha ~34, adicionada na change `video-avatar-generation`). Nenhum dos
dois valida a presença da variável antes de usá-la — se estiver vazia, o
header sai como a string literal `"undefined"` (confirmado testando
`new Headers({'x-api-key': undefined})` no Node — undici serializa para a
string `"undefined"`, não omite o header), e a API externa responde 401,
que vira `Error('Gamma/HeyGen retornou 401...')` — tecnicamente correto,
mas sem apontar a causa raiz (variável de ambiente ausente) pro usuário.

## Goals / Non-Goals

**Goals:**
- Detectar a ausência de `GAMMA_API_KEY`/`HEYGEN_API_KEY` **antes** de
  qualquer chamada de rede, com uma mensagem que cite o nome exato da
  variável e aponte para `.env.example`.
- Mesmo formato de erro nos dois casos (SSE `error` ou JSON 500, dependendo
  do endpoint — mesmo contrato de erro já usado por cada rota).

**Non-Goals:**
- Validar se a chave é *sintaticamente* válida (formato, prefixo) — só
  presença/vazio. Chave malformada continua caindo no 401 normal da API
  externa, que já é um erro razoavelmente claro.
- Verificação no boot do servidor (ex.: `console.warn` ao subir sem
  `HEYGEN_API_KEY`) — fora de escopo desta mudança; o guard é por chamada,
  no ponto de uso, consistente com como o projeto já trata `OPENAI_API_KEY`
  (falha no primeiro uso, não no boot).
- Não mexe em `OPENAI_API_KEY` (ver proposal.md — caso diferente, o servidor
  já não funciona sem ela desde a Etapa 0).

## Decisions

**D1 — Guard function reutilizável, não duplicada por endpoint.**
Uma função `requireApiKey(key, envVarName)` (ou duas funções nominais
`requireGammaApiKey()`/`requireHeygenApiKey()` — a decidir na implementação
pela clareza da mensagem) lançada no início de cada helper de integração
(`criarGeracaoGamma`, `listarAvataresHeygen`, `listarVozesHeygen`,
`criarVideoHeygen`) — mesmo padrão de validação centralizada já usado no
projeto (ex.: `truncate`, `makeAbortSignal`), evitando repetir a checagem em
cada rota individualmente.

**D2 — Mensagem de erro cita a variável E o `.env.example`.**
Formato: `"<NOME_VAR> não está configurada. Adicione a chave em .env (veja
.env.example) antes de usar esta etapa."` — específico o suficiente para o
usuário saber exatamente o que fazer, sem expor a chave em si (não há chave
para expor, ela está ausente).

**D3 — Erro sai pelo mesmo canal que os demais erros da rota.**
Rotas SSE (`GET /api/slides/gerar`, `GET /api/video-avatar/gerar`, etc.)
usam `sseError()`/`send(res, {type:'error', ...})`, mesmo padrão já
estabelecido; rotas JSON (`GET /api/estilos-visuais`, `GET
/api/heygen/avatares`, etc.) usam `res.status(500).json({error})`, também já
padrão. Nenhum contrato de erro novo é introduzido.

## Risks / Trade-offs

- **[Risco] Esquecer de aplicar o guard em algum dos ~6 pontos de uso** →
  Mitigação: testes de integração cobrindo explicitamente "sem
  GAMMA_API_KEY"/"sem HEYGEN_API_KEY" para cada endpoint afetado (ver
  tasks.md), não só um teste isolado da função guard.
- **[Trade-off] Checagem por chamada, não no boot** → mais simples e
  consistente com o padrão existente do projeto, mas o usuário só descobre
  a chave ausente ao tentar usar a etapa, não ao subir o servidor. Aceito:
  mesmo comportamento que `OPENAI_API_KEY` já tem hoje.
