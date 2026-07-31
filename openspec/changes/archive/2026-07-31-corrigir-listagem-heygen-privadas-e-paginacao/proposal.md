## Why

Investigando por que um avatar/voz configurado em `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` não aparecia na Etapa 10, testei diretamente a API do HeyGen e encontrei dois bugs reais em `listarAvataresHeygen()`/`listarVozesHeygen()` (server.js), presentes desde antes do filtro por `.env`:

1. **Paginação incompleta**: ambos `GET /v3/avatars/looks` e `GET /v3/voices` retornam `has_more`/`next_token` quando o workspace tem mais itens do que cabem numa página, mas o código sempre usa `limit=50` numa única chamada, sem seguir a paginação — qualquer avatar/voz além da primeira página fica invisível.
2. **Vozes privadas/clonadas nunca aparecem**: `GET /v3/voices` só retorna vozes públicas quando a query não especifica `type`; vozes privadas (clonadas pelo usuário) exigem `type=private` explícito. O código nunca envia esse parâmetro no caminho padrão (usado pela Etapa 10), então a API sempre devolve só o catálogo público — confirmado testando a voz clonada do usuário (`type: "private"`), que não aparece em nenhuma página do catálogo público, mas aparece imediatamente com `type=private`.

Esses bugs afetam tanto a listagem normal (sem filtro) quanto o filtro por `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` — um ID válido configurado no `.env` pode nunca aparecer no resultado se estiver além da primeira página, ou (no caso de vozes) se for uma voz privada.

## What Changes

- `listarAvataresHeygen()` **para de usar `GET /v3/avatars/looks`** (esse endpoint devolve o catálogo público inteiro do HeyGen misturado com os avatares do usuário, sem nenhum parâmetro de filtro por dono — testado e confirmado: paginar até o fim levaria minutos) e passa a usar `GET /v2/avatar_group.list?include_public=false` + `GET /v2/avatar_group/{group_id}/avatars`, que já escopam para os grupos de avatar do próprio usuário — rápido e correto, ao custo de depender de endpoints v2 legados (sunset sinalizado para 2026-10-31 pelo HeyGen; sem substituto v3 funcional hoje).
- `listarVozesHeygen()`:
  - Quando o caller não especifica `type` (caminho padrão, usado pela Etapa 10), passa a buscar **públicas e privadas** (duas chamadas paginadas — `type=public` e `type=private` — combinadas num único array), em vez de só públicas.
  - Ao buscar vozes privadas, **não aplica o filtro de idioma** (`language=Portuguese` padrão), já que vozes clonadas costumam vir sem idioma marcado (`language: "unknown"`) e o filtro de idioma do próprio HeyGen as exclui mesmo com `type=private` — confirmado por teste direto na API. O filtro de idioma continua se aplicando normalmente às vozes públicas.
  - Quando o caller especifica `type` explicitamente (ex.: `?type=public` na query), mantém o comportamento de uma única busca paginada, sem combinar tipos.
  - Passa a paginar `GET /v3/voices` completamente, mesmo padrão do item acima.
- Nenhuma mudança de contrato das rotas `GET /api/heygen/avatares`/`GET /api/heygen/vozes` (mesma forma de resposta) nem do filtro `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` já existente — eles continuam funcionando sobre a lista (agora completa) retornada.

## Capabilities

### New Capabilities
(nenhuma)

### Modified Capabilities
- `video-avatar-generation`: o requisito "Configuração de avatar, voz e narração do HeyGen, uma vez por curso" passa a exigir que avatares venham só dos grupos próprios do usuário (não do catálogo público), que a listagem de vozes seja paginada até esgotar o catálogo, e que vozes privadas/clonadas do usuário sejam incluídas por padrão (não só públicas).

## Impact

- **Código afetado**: `server.js` (`listarAvataresHeygen`, `listarVozesHeygen` — sem mudança de assinatura pública).
- **Sem mudança de contrato de API** (mesma forma de `{ avatares }`/`{ vozes }`, mesmos campos `id`/`name`/`avatar_type`/`preview_image_url` por item).
- **Mais chamadas de rede ao HeyGen por listagem** (1 + N por grupo de avatar; uma por página de vozes) — aceitável dado que a Etapa 10 configura avatar/voz uma vez por curso, não a cada geração de vídeo.
- **Nova dependência de endpoints v2 legados do HeyGen para avatares** (`avatar_group.list`, `avatar_group/{id}/avatars`), sinalizados para sunset em 2026-10-31 — sem substituto v3 funcional hoje (`/v3/avatar_groups` retorna 404). Precisa reavaliação antes dessa data.
- **Sem novas dependências npm.**

## Non-goals

- Não muda a forma como o usuário escolhe avatar/voz na UI (`public/app.js`) — a lista chega mais correta/rápida, mas a interação continua a mesma.
- Não adiciona cache da listagem entre requisições — cada chamada a `GET /api/heygen/avatares`/`vozes` continua buscando ao vivo no HeyGen.
- Não migra para `/v3/avatar_groups` — esse endpoint ainda não está disponível (404); migrar quando o HeyGen o lançar é trabalho futuro.
- Não implementa paginação para `avatar_group.list` (assume que o número de grupos próprios do usuário é pequeno; não testado em workspaces com muitos avatares custom).
