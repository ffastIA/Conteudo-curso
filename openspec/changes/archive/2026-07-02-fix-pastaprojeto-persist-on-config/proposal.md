## Why

Arquivos gerados para as aulas de um curso (e demais etapas) estão sendo salvos em `saídas/{slug}/` em vez da "pasta do projeto" (`pastaProjeto`) configurada pelo usuário na Etapa 1, especificamente após o projeto ser recarregado (refresh do navegador, sessão reiniciada, ou reabertura via a lista de projetos existentes). A causa raiz está em `POST /api/config` (`server.js:466-514`): quando o usuário define ou altera apenas o campo `pastaProjeto` em um curso que já tem ementa gerada, `sess.config.pastaProjeto` é atualizado em memória, mas nunca é persistido em disco (`projeto.json` nem o índice global `saídas/index.json`), porque a única chamada a `saveProject`/`persistStage` nesse endpoint está condicionada a `!sess.ementa || conteudoMudou` — e `pastaProjeto` foi deliberadamente excluído da lista de campos que disparam `conteudoMudou` (o comentário no código já documentava essa intenção: permitir atualizar a pasta sem reprocessar o pipeline). Como `POST /api/carregar-projeto` resolve de onde ler o projeto EXCLUSIVAMENTE a partir do `pastaProjeto` gravado nesse índice global, uma vez que a sessão é perdida, o valor correto nunca é recuperado — e todo o pipeline volta a escrever em `saídas/{slug}/`, incluindo a geração de conteúdo das aulas.

## What Changes

- `POST /api/config` passa a persistir imediatamente (`saveProject(sess)`) sempre que o valor de `pastaProjeto` mudar em relação ao que já estava salvo em `sess.config`, independentemente de `conteudoMudou`/regeneração de ementa.
- Isso garante que `projeto.json` e `saídas/index.json` sempre reflitam a `pastaProjeto` real assim que ela é definida ou alterada, para que `POST /api/carregar-projeto` e `GET /api/projetos` — que dependem desses arquivos — resolvam o diretório correto mesmo após a sessão em memória ser perdida.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `project-folder`: a especificação de `pastaProjeto`/`courseRootDir` passa a garantir que qualquer alteração de `pastaProjeto` via `POST /api/config` seja imediatamente refletida em `projeto.json` e `saídas/index.json`, e não apenas na sessão em memória.

## Impact

- `server.js`: endpoint `POST /api/config` (~linhas 466-514).
- Nenhuma mudança em `POST /api/carregar-projeto`, `GET /api/projetos`, `courseRootDir`/`courseScrDir`/`persistStage`, nem no fix já aplicado anteriormente em `POST /api/export/:step` (change `fix-export-step-no-download`) — esses já leem/usam a configuração corretamente; o problema é exclusivamente a ausência de persistência no momento em que `pastaProjeto` é definida.
- Relacionado ao gap conhecido G04 (sessão in-memory perdida ao reiniciar) como fator agravante secundário: um restart do servidor também descarta a sessão em memória, tornando ainda mais crítico que `pastaProjeto` esteja sempre persistida em disco assim que configurada.
- Sem dependências externas novas; sem breaking changes.

## Non-goals

- Não resolve o gap G04 de forma geral (persistência de sessão em memória) — apenas garante que este campo específico não dependa da sessão sobreviver.
- Não altera a lógica de `POST /api/carregar-projeto` (que já lê corretamente o que estiver salvo) nem de `courseRootDir`/`persistStage`.
- Não adiciona migração automática para projetos já afetados por este bug (cujo `index.json`/`projeto.json` já ficaram com `pastaProjeto` vazio incorretamente) — corrigir esses registros existentes, se necessário, é uma ação manual do usuário (reconfigurar a pasta na Etapa 1 do projeto afetado), fora do escopo desta correção.
