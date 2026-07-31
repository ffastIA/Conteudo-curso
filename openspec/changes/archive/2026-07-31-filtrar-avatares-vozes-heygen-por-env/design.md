## Context

`listarAvataresHeygen()` e `listarVozesHeygen()` (server.js:1013-1047) chamam a API do HeyGen (`GET /v3/avatars/looks`, `GET /v3/voices`) e devolvem `data.data || []` sem nenhum filtro. As rotas `GET /api/heygen/avatares` (server.js:1482-1489) e `GET /api/heygen/vozes` (server.js:1498-1506) repassam esse array direto ao front-end, que renderiza um rádio por item com thumbnail/nome (`public/app.js`, `carregarHeygenConfig`, linhas 1086-1132). Não existe hoje, no projeto, nenhum padrão de env var com lista CSV — as envs existentes (`HEYGEN_API_KEY`, `HEYGEN_POLL_INTERVAL_MS` etc.) são valores escalares únicos.

## Goals / Non-Goals

**Goals:**
- Filtrar a lista de avatares/vozes retornada ao front-end por um whitelist de IDs configurado no `.env`.
- Preservar 100% de compatibilidade quando a whitelist não está configurada.
- Não alterar o contrato de resposta das rotas nem o front-end.

**Non-Goals:**
- Validar ou avisar quando um ID configurado no `.env` não existe no workspace HeyGen.
- Expor a configuração da whitelist via UI ou API — é feita só no `.env`, como as demais chaves.
- Alterar o fluxo de geração/polling/download do vídeo.

## Decisions

**Filtrar depois da chamada à API, preservando metadados (não usar apenas os IDs crus)**
Alternativa considerada: pular a chamada à API do HeyGen e montar a lista direto a partir dos IDs do `.env` (sem thumbnail/nome). Rejeitada porque quebraria a tela de seleção atual, que depende de `name`, `avatar_type`, `preview_image_url` (avatares) e `name`/`language` (vozes) para o usuário reconhecer visualmente a opção certa. Filtrar o array já retornado pela API mantém esses campos intactos para os itens que sobrevivem ao filtro, sem exigir nenhuma mudança em `public/app.js`.

**Formato CSV simples para as env vars (`HEYGEN_AVATAR_IDS=id1,id2,id3`)**
Alternativa considerada: JSON array (`["id1","id2"]`). Rejeitada por exigir `JSON.parse` com tratamento de erro de sintaxe (uma vírgula a mais quebraria o parse); CSV é mais tolerante e mais fácil de editar manualmente num `.env`, consistente com o estilo já usado nas demais entradas comentadas do `.env.example`.

**Lista vazia/ausente = sem filtro (fail-open), não fail-closed**
Se `HEYGEN_AVATAR_IDS` estivesse ausente e o sistema interpretasse isso como "nenhum avatar permitido", toda instalação existente da Etapa 10 quebraria (lista vazia, "nenhum avatar encontrado") até o usuário configurar a nova variável. Fail-open (ausente = mostra tudo, como hoje) evita esse breaking change silencioso; o filtro é estritamente opt-in.

**Filtro aplicado dentro de `listarAvataresHeygen`/`listarVozesHeygen`, não nas rotas Express**
Mantém as funções de listagem como o único ponto de acesso à API do HeyGen (padrão já existente no arquivo — as rotas apenas chamam a função e serializam o resultado), evitando duplicar a lógica de filtro caso outro caller futuro (ex.: MCP/CLI) reuse essas funções.

## Risks / Trade-offs

- [ID configurado errado no `.env` (typo, avatar renomeado/removido no HeyGen)] → resultado é uma lista vazia ou menor que o esperado, sem mensagem de erro específica; o usuário vê o mesmo aviso genérico "Nenhum avatar encontrado no seu workspace HeyGen" já existente em `public/app.js:1099`. Aceitável dado que é um cenário de configuração local, não de runtime em produção multi-usuário.
- [Env var lida uma única vez no load do módulo] → alterar `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` exige reiniciar `node server.js`, igual às demais envs do projeto (`HEYGEN_API_KEY` etc.); nenhuma mudança de comportamento em relação ao padrão já existente.

## Migration Plan

Nenhuma migração de dados. Deploy é a alteração de código + variáveis opcionais novas no `.env` (ou `.env.example` como referência). Rollback trivial: reverter o commit ou simplesmente não configurar as novas variáveis (comportamento atual permanece).
