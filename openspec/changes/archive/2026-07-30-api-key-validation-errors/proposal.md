## Why

O sistema depende de chaves de API externas configuradas em `.env`
(`GAMMA_API_KEY`, `HEYGEN_API_KEY`), mas hoje nada valida a presença dessas
chaves antes de usá-las: quando uma chave está ausente, a única coisa que o
usuário vê é o erro cru devolvido pela API externa (ex.: "Gamma retornou
401..." / "HeyGen retornou 401..."), sem nenhuma indicação de que o problema
é uma variável de ambiente não configurada. Isso já causou uma falha real:
`HEYGEN_API_KEY` foi documentada em `.env.example` (Etapa 10), mas nunca
adicionada ao `.env` real, e o primeiro teste da Etapa 10 falhou com um erro
de acesso opaco em vez de uma mensagem acionável.

## What Changes

- Ao chamar qualquer endpoint que dependa de uma API key externa obrigatória
  (`GAMMA_API_KEY` para a Etapa 8, `HEYGEN_API_KEY` para a Etapa 10) sem essa
  variável configurada no `.env`, o sistema retorna um erro claro e
  acionável — citando o nome exato da variável e apontando para
  `.env.example` — **antes** de tentar a chamada de rede à API externa, em
  vez de deixar a API externa responder com um 401 genérico.
- Nenhuma mudança de comportamento quando a chave está presente e válida.

## Capabilities

### New Capabilities
(nenhuma)

### Modified Capabilities
- `slides-generation`: novo requirement — erro claro quando `GAMMA_API_KEY`
  não está configurada, antes de qualquer chamada à API do Gamma.
- `video-avatar-generation`: novo requirement — erro claro quando
  `HEYGEN_API_KEY` não está configurada, antes de qualquer chamada à API do
  HeyGen.

## Impact

- **Código**: `server.js` — guard no início dos endpoints/helpers que usam
  `GAMMA_API_KEY`/`HEYGEN_API_KEY` (`criarGeracaoGamma`, `GET/POST
  /api/estilos-visuais*`, `GET /api/slides/*`, `listarAvataresHeygen`,
  `listarVozesHeygen`, `criarVideoHeygen`, `GET/POST /api/heygen/*`, `GET
  /api/video-avatar/gerar`).
- **Não resolve um Gap ID priorizado existente (G01–G07)** — é uma melhoria
  de UX de erro para as integrações externas já implementadas, não um dos
  gaps já catalogados.
- **Non-goals**: não valida se a chave é *válida* (isso só a própria API
  externa pode confirmar, via 401 na primeira chamada real) — só valida que
  a variável de ambiente existe e não está vazia. Não adiciona validação
  equivalente para `OPENAI_API_KEY` (ausência dela já impede o servidor de
  funcionar desde a Etapa 0, é um caso diferente, fora de escopo aqui). Não
  cobre o caso de múltiplas contas Gamma/HeyGen (ver memória de projeto
  sobre Gamma multi-conta, já registrada e adiada separadamente).
