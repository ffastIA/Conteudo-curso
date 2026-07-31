## Why

O workspace HeyGen do usuário pode ter dezenas de avatares e vozes cadastrados, mas apenas um pequeno subconjunto curado é de fato usado nos cursos. Hoje a tela de configuração da Etapa 10 lista **todos** os avatares (`GET /v3/avatars/looks`) e vozes (`GET /v3/voices`) do workspace, obrigando o usuário a procurar as opções desejadas em meio a uma lista longa e irrelevante a cada novo curso.

## What Changes

- Duas novas variáveis de ambiente opcionais, `HEYGEN_AVATAR_IDS` e `HEYGEN_VOICE_IDS` (formato CSV, ex.: `id1,id2,id3`), documentadas em `.env.example`.
- `listarAvataresHeygen()` e `listarVozesHeygen()` (server.js) passam a filtrar o resultado da API do HeyGen, mantendo apenas os itens cujo `id`/`voice_id` conste na respectiva lista do `.env`, antes de devolver a resposta às rotas `GET /api/heygen/avatares` e `GET /api/heygen/vozes`.
- Quando a variável correspondente não estiver configurada ou vier vazia, nenhum filtro é aplicado — o comportamento atual (lista completa do workspace) é preservado, garantindo compatibilidade com quem já usa a Etapa 10 sem essa configuração.
- Nenhuma mudança na forma dos dados retornados (thumbnail, nome, tipo, idioma continuam presentes para os itens que passam no filtro) nem no front-end — a tela de seleção da Etapa 10 simplesmente recebe uma lista menor.

## Capabilities

### New Capabilities
(nenhuma)

### Modified Capabilities
- `video-avatar-generation`: o requisito "Configuração de avatar, voz e narração do HeyGen, uma vez por curso" passa a exigir que as listas de avatares e vozes retornadas ao usuário sejam filtradas por `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` quando essas variáveis estiverem configuradas.

## Impact

- **Código afetado**: `server.js` (`listarAvataresHeygen`, `listarVozesHeygen`, constantes próximas a `HEYGEN_API_KEY`).
- **Configuração**: `.env.example` (novo bloco de variáveis opcionais).
- **Testes**: `tests/integration/video-avatar.test.js` (novos casos para lista filtrada e lista completa quando as envs estão ausentes).
- **Sem mudança de API pública**: os endpoints `GET /api/heygen/avatares` e `GET /api/heygen/vozes` mantêm o mesmo contrato de resposta, apenas com menos itens quando o filtro está ativo.
- **Sem novas dependências npm.**

## Non-goals

- Não introduz uma tela de administração para editar `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` pela UI — a configuração é feita apenas via `.env`, como as demais chaves de API do projeto.
- Não altera o fluxo de geração do vídeo em si (`POST /v3/videos`, polling, download do `.mp4`) nem a persistência de `heygenConfig`.
- Não valida se os IDs configurados no `.env` de fato existem no workspace HeyGen — um ID inexistente ou digitado errado simplesmente não aparece na lista filtrada (mesmo comportamento de "nenhum item corresponde ao filtro"), sem erro dedicado.
