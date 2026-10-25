## Why

A geração de vídeo com avatar gasta saldo da carteira do HeyGen, mas o sistema não mostra nem registra esse gasto: o usuário só descobre quanto custou um vídeo no painel do HeyGen, e o Langfuse enxerga as chamadas ao HeyGen apenas como spans de status e duração. O custo em tokens (`custoProjetoUsd`) cobre só a OpenAI.

A API do HeyGen expõe o saldo da carteira em `GET /v3/users/me` (`data.wallet.remaining_balance`, em USD, para contas `billing_type: "wallet"`; verificado com a chave real em 2026-10-25). O consumo de um vídeo é, por definição do produto, **a diferença entre o saldo antes e o saldo depois da geração**.

## What Changes

- Leitura do saldo da carteira HeyGen (`GET /v3/users/me`), devolvendo ao navegador **somente** saldo, moeda, tipo de cobrança e recarga automática (nunca e-mail, nome de usuário ou chave).
- Na tela de geração do vídeo (Etapa 10), exibir o **saldo atual antes de gerar**; ao terminar o vídeo, **reler o saldo** e exibir o **saldo final** e o **consumo do vídeo** (`saldo inicial − saldo final`).
- Persistir por vídeo o saldo inicial, o saldo final e o consumo em `projeto.json`, e acumular `custoHeygenUsd` por projeto (campo separado de `custoProjetoUsd`, que é estimado por tokens).
- Langfuse: span de leitura do saldo, span do vídeo com saldo inicial/final e consumo, métrica `custo_heygen_usd` nos metadados do trace e score numérico `heygen_consumo_usd`, para conferência com a tela do app.
- Botão "Atualizar saldo" para o usuário reler o saldo manualmente e, quando um vídeo ficou com consumo não apurado (cobrança atrasada), completar a apuração dele.
- Aviso de saldo baixo e de recarga automática desligada (sem bloquear a geração).

## Capabilities

### New Capabilities
- `heygen-observability`: leitura do saldo, cálculo e registro do consumo por vídeo, exibição na interface e envio ao Langfuse.

### Modified Capabilities
- `video-avatar-generation`: a tela e o evento final da geração de vídeo passam a incluir saldo inicial, saldo final e consumo.

## Impact

- **`server.js`**: `lerSaldoHeygen()`, `GET /api/heygen/saldo`, medição de saldo em `GET /api/video-avatar/gerar` (e na retomada), `persistirConsumoHeygen`, restauração em carregar-projeto.
- **`observabilidade.js`**: sem mudança de contrato; usa `registrarSpan`/`registrarScore` existentes (talvez um atributo extra em `finalizarContexto`).
- **`public/index.html`, `public/app.js`**: painel de saldo na Etapa 10, consumo por vídeo e total do projeto.
- **`tests/`**: mock de `fetch` do HeyGen ganha `/v3/users/me` com saldos sequenciais.
- **Docs**: `PROJECT.md` (contagem de handlers, modelo de dados), `README.md` (tabela de rotas), `.env.example`.
- Sem dependência npm nova.

## Non-goals

- Não estimar o custo de um vídeo **antes** de gerá-lo (o preço por minuto do HeyGen não é conhecido pela API; fica para quando houver histórico suficiente).
- Não bloquear a geração por saldo baixo ou zerado; só avisar.
- Não recarregar a carteira nem alterar a recarga automática.
- Não suportar planos por assinatura/créditos além de sinalizar "saldo indisponível" (o formato `wallet` é o único verificado).
- Não consultar histórico de faturas do HeyGen.

## Gaps resolvidos

Observabilidade e custo das integrações externas (continuação de G06/G08, que cobrem só o LLM).
