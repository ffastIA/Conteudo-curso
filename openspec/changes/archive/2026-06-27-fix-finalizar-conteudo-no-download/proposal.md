## Why

Ao clicar em "Conteúdo Concluído" (Etapa 6), o sistema disparava um download no browser quando `sess.config.pastaProjeto` estava vazio, mesmo que o arquivo já tivesse sido salvo em disco em `saídas/{slug}/conteudo_final.docx`. O usuário recebia um arquivo em Downloads sem saber onde o original foi gravado, e não via o banner de confirmação com o caminho. O comportamento de download era um atalho para projetos sem pasta configurada, mas conflita com o modelo de persistência em disco que o sistema adota desde a introdução da estrutura `saídas/`.

## What Changes

- `POST /api/finalizar-conteudo` (`server.js`): remove o branch condicional que enviava o arquivo como download. Após salvar em disco, sempre retorna `{ ok: true, saved: true, path: "<caminho_real>" }`, onde `path` é `courseRootDir(sess)/conteudo_final.docx` (seja pasta externa ou `saídas/{slug}/`).

## Capabilities

### New Capabilities

Nenhuma nova capability.

### Modified Capabilities

- `improvement-application-cycle`: o endpoint de conclusão do ciclo passa a retornar sempre JSON com o caminho salvo, sem download implícito.

## Impact

- **`server.js`**: handler `POST /api/finalizar-conteudo` — remoção do branch de download
- **`public/app.js`**: sem mudança — o frontend já trata a resposta JSON e exibe o banner com o caminho
- **Sem novos endpoints ou dependências**

## Non-goals

- Não altera onde o arquivo é salvo (esse comportamento é controlado por `pastaProjeto`)
- Não adiciona botão de download explícito na UI (o arquivo já está acessível no diretório do projeto)
- Não resolve a questão de qual diretório é usado quando `pastaProjeto` está vazio
