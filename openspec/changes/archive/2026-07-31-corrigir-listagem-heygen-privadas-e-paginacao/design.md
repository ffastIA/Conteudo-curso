## Context

Testei diretamente a API do HeyGen (usando a chave real do projeto) para diagnosticar por que os IDs configurados em `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` não apareciam na Etapa 10. Resultados relevantes:

- `GET /v3/avatars/looks?limit=50` retorna `{"has_more": true, "next_token": "..."}` — o workspace tem mais de 50 "looks", e `listarAvataresHeygen()` (server.js:1027-1042) só busca a primeira página.
- `GET /v3/voices?limit=50` (sem `type`) também pagina (`has_more: true`) e, mesmo varrendo exaustivamente as ~2.436 vozes retornadas por esse caminho, uma voz privada conhecida (`type: "private"`, confirmada via `GET /v3/voices?type=private`) nunca aparece — o endpoint só devolve o catálogo público quando `type` não é especificado.
- `GET /v3/voices?type=private&language=Portuguese` retorna 0 resultados, mas `GET /v3/voices?type=private` (sem `language`) retorna a voz privada normalmente — o filtro de idioma do próprio HeyGen exclui vozes privadas porque elas costumam ter `language: "unknown"`.

`listarVozesHeygen()` (server.js:1046-1065) já tinha um comentário afirmando buscar "públicas + privadas", mas o código nunca envia `type=private` no caminho padrão — o comentário estava descrevendo uma intenção que o código não implementava.

**Descoberta durante a implementação, que mudou a abordagem para avatares:** a primeira versão implementada (paginar `/v3/avatars/looks` exaustivamente, igual à solução de vozes) foi testada contra a API real e revelou que esse endpoint devolve o catálogo **público** inteiro do HeyGen (milhares de avatares stock) misturado com os avatares do usuário, sem nenhum parâmetro de escopo por dono (`type`, `owner`, `source`, `is_public`, `group_type` — todos testados e rejeitados com `400 Extra inputs are not permitted`). Uma varredura real (`limit=50`) chegou a 750+ itens em 15 páginas (~650ms/página) ainda com `has_more: true` — paginar até o fim levaria minutos, inviável para uma chamada síncrona da tela de configuração da Etapa 10. Testando o endpoint legado `GET /v2/avatar_group.list?include_public=false`, ele retorna só os grupos de avatar do próprio usuário (1 grupo no workspace de teste, resposta em <1s); e `GET /v2/avatar_group/{group_id}/avatars` retorna os "looks" dentro de cada grupo — juntos, dão exatamente a lista que a Etapa 10 precisa, rápido. A abordagem final usa esses dois endpoints v2 em vez de `/v3/avatars/looks` para avatares (vozes continuam usando `paginarHeygen`/`/v3/voices`, que se comportou bem).

## Goals / Non-Goals

**Goals:**
- Listar o catálogo completo de avatares e vozes do workspace, não só a primeira página.
- Incluir vozes privadas/clonadas do usuário por padrão, junto com as públicas.
- Preservar o filtro `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` já existente (change anterior) operando sobre a lista completa.

**Non-Goals:**
- Cache entre chamadas — cada listagem continua uma consulta ao vivo.
- Mudar a UI de seleção (`public/app.js`) além de receber uma lista potencialmente maior/mais completa.
- Resolver a confusão group-id vs. look-id de avatares na interface (fora do escopo — é sobre qual ID o usuário configura, não sobre o código de listagem).

## Decisions

**Avatares: endpoints v2 escopados por dono (`avatar_group.list` + `avatar_group/{id}/avatars`), não paginação de `/v3/avatars/looks`**
Rejeitada a ideia original de paginar `/v3/avatars/looks` exaustivamente (ver descoberta acima — endpoint devolve o catálogo público inteiro, paginar até o fim levaria minutos). Em vez disso: `GET /v2/avatar_group.list?include_public=false` lista só os grupos do usuário (rápido, tipicamente poucas dezenas no máximo), e `GET /v2/avatar_group/{group_id}/avatars` lista os "looks" de cada grupo — buscados em paralelo (`Promise.all`) e achatados num único array. `avatar_type` é derivado de `group_type` do grupo (ex.: `"PHOTO"` → `"photo_avatar"`), e os campos são mapeados para a forma que a UI já espera (`id`, `name`, `avatar_type`, `preview_image_url`).
Trade-off aceito: esses são endpoints v2 legados, sinalizados pelo próprio HeyGen para sunset em 2026-10-31 (substituir por `/v3/avatar_groups`, que hoje retorna 404 — não está no ar ainda). Não há alternativa v3 funcional no momento; migrar quando o v3 for lançado é trabalho futuro, não deste change.
`avatar_group.list` não expõe paginação (`limit`/`token` são ignorados silenciosamente, sem erro) — assume-se que o número de grupos custom de um usuário é pequeno o bastante para não precisar de paginação (confirmado: 1 grupo no workspace de teste); não verificado contra um workspace com dezenas/centenas de avatares custom.

**Helper genérico de paginação (`paginarHeygen`), usado só por vozes**
`/v3/voices` usa um contrato de paginação (`data`, `has_more`, `next_token`, passado de volta como `?token=`) que se comportou bem no teste real (~24 páginas, <1s cada, catálogo público de ~2.400 vozes totalmente enumerado em segundos) — diferente do catálogo de avatares, o de vozes públicas é aceitável de paginar por completo.
```js
async function paginarHeygen(path, baseParams, { maxPaginas = 100 } = {}) {
  const itens = [];
  let token = null;
  for (let i = 0; i < maxPaginas; i++) {
    const params = new URLSearchParams(baseParams);
    if (token) params.set('token', token);
    const resp = await fetch(`${HEYGEN_API_BASE}${path}?${params}`, { headers: {...}, signal: makeAbortSignal(30_000) });
    if (!resp.ok) throw new Error(...);
    const data = await resp.json();
    itens.push(...(data.data || []));
    if (!data.has_more) break;
    token = data.next_token;
  }
  return itens;
}
```
`maxPaginas = 100` (com `limit=100` por página, até 10.000 itens) é uma salvaguarda contra loop infinito em caso de comportamento inesperado da API — bem acima do catálogo observado (~2.400 itens em ~24 páginas).

**Vozes privadas: duas buscas paginadas combinadas, só quando `type` não é especificado**
Quando o caller (rota `GET /api/heygen/vozes`) não passa `type`, `listarVozesHeygen` chama `paginarHeygen('/v3/voices', { type: 'public', language, gender })` e `paginarHeygen('/v3/voices', { type: 'private', gender })` (sem `language` — ver próxima decisão) e concatena os resultados (privadas primeiro, por serem tipicamente as escolhas mais relevantes do usuário). Quando `type` é passado explicitamente pelo caller, mantém uma única busca paginada com esse `type`, sem combinar — preserva o comportamento de override já documentado no requisito de "voz filtrada por português por padrão, salvo quando o cliente especificar outro idioma/tipo".

**Filtro de idioma não se aplica a vozes privadas**
Alternativa considerada: aplicar `language=Portuguese` também na busca de privadas, e deixar o usuário sem a voz caso ela não esteja marcada como português. Rejeitada porque teste direto na API mostrou que isso exclui a voz mesmo sendo genuinamente a voz do usuário (clonada, então "é" a língua que ele gravou, só não está *marcada* na metadata) — o objetivo do filtro de idioma é reduzir um catálogo público de milhares de vozes a um subconjunto navegável, não faz sentido para as poucas vozes privadas do próprio usuário (tipicamente < 20).

## Risks / Trade-offs

- [Mais chamadas de rede por listagem de vozes — até ~100 requisições por tipo em workspaces muito grandes] → aceitável: a Etapa 10 lista avatares/vozes uma vez por curso (ou ao trocar, via o botão adicionado na change anterior), não a cada geração de vídeo. `maxPaginas=100` limita o pior caso.
- [`maxPaginas` atingido antes de `has_more: false` para vozes — lista fica incompleta silenciosamente] → cenário extremo (>10.000 itens) não observado em nenhum teste; aceitável como salvaguarda de robustez, não uma limitação prática.
- [Endpoints v2 de avatar (`avatar_group.list`, `avatar_group/{id}/avatars`) sinalizados para sunset em 2026-10-31] → não há substituto v3 funcional hoje (`/v3/avatar_groups` retorna 404). Risco aceito por ser a única opção que funciona; precisa reavaliação antes da data de sunset.
- [`avatar_group.list` sem paginação verificada para muitos grupos custom] → não testado em workspace com dezenas/centenas de avatares próprios; se `total_count` divergir do array retornado em algum caso real, a lista ficaria incompleta sem erro. Aceito como limitação conhecida, não bloqueante para o caso observado (1 grupo).

## Migration Plan

Nenhuma migração de dados. Mudança é só de código (`server.js`); deploy é reload do servidor. Rollback trivial (reverter commit).
