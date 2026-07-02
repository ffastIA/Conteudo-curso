## Context

`saídas/index.json` é escrito por `saveProject()` (`server.js:209-249`) e lido por dois consumidores: `GET /api/projetos` (listagem automática de projetos na tela inicial) e `POST /api/carregar-projeto` (resolução de onde ler um projeto externo). Ele existe puramente como um atalho para não precisar escanear todo o sistema de arquivos em busca de projetos externos — mas, por ser um segundo estado além do `projeto.json` de cada pasta, pode ficar dessincronizado sempre que uma atualização em `sess.config.pastaProjeto` não dispara uma escrita nele (como aconteceu no bug corrigido em `fix-pastaprojeto-persist-on-config`).

Este change assume que `add-load-project-by-folder` já foi implementado (ou está sendo implementado junto), fornecendo:
- Um botão em Etapa 0 que abre um seletor de pasta e chama `POST /api/carregar-projeto` com o caminho absoluto da pasta escolhida (não mais um `slug`).
- Como o usuário sempre fornece o caminho diretamente, não há mais necessidade de "descobrir" onde um projeto externo está — o próprio ato de selecionar a pasta já é a resposta.

## Goals / Non-Goals

**Goals:**
- Eliminar `saídas/index.json` como fonte de verdade — cada pasta de projeto passa a ser autossuficiente (seu `scr/projeto.json` já contém tudo que é necessário).
- Remover todo código que lê ou escreve esse arquivo.
- Apagar o arquivo já existente do disco (não deixar um artefato obsoleto e potencialmente confuso).

**Non-Goals:**
- Não reimplementa a listagem/seleção de projetos (isso é escopo do `add-load-project-by-folder`).
- Não migra projetos legados automaticamente.

## Decisions

### Remover GET /api/projetos inteiramente, não apenas sua dependência do índice

Como o novo fluxo de carregamento (`add-load-project-by-folder`) não lista projetos automaticamente — o usuário sempre indica a pasta —, o endpoint `GET /api/projetos` fica sem nenhum consumidor. Removê-lo por completo (em vez de mantê-lo "esvaziado" ou baseado apenas em escaneamento de `saídas/`) evita manter código morto e uma segunda forma (inconsistente) de descobrir projetos que não passa pelo fluxo oficial.

- *Alternativa considerada:* manter `GET /api/projetos` fazendo apenas um escaneamento de diretórios dentro de `saídas/` (sem índice), como uma lista "somente locais". Rejeitada porque criaria dois caminhos de descoberta de projeto diferentes (um para locais via escaneamento automático, outro para externos via seleção manual de pasta), contrariando o objetivo de ter uma única fonte de verdade e um único fluxo de carregamento.

### `POST /api/carregar-projeto` passa a exigir o caminho da pasta, não mais um slug

A resolução de `baseDir` (hoje dependente de `index.json`) é substituída pela lógica já definida em `add-load-project-by-folder`: o cliente envia o caminho absoluto da pasta escolhida pelo usuário, e o servidor lê `{pasta}/scr/projeto.json` diretamente dali, sem nenhuma consulta a um registro global.

### Apagar o arquivo `saídas/index.json` existente

Como parte da aplicação deste change (não apenas parar de escrevê-lo daqui em diante), o arquivo já existente é removido do disco, evitando que fique como um artefato morto e potencialmente enganoso caso alguém volte a lê-lo manualmente no futuro.

## Risks / Trade-offs

- [Risco] Quem dependia da listagem automática de "todos os projetos conhecidos" na tela inicial perde essa visão de conjunto → Mitigação: aceito como trade-off consciente — o novo fluxo por pasta exige que o usuário saiba/organize onde salvou cada projeto, o que é consistente com `pastaProjeto` agora ser um campo obrigatório (`add-load-project-by-folder`).
- [Risco] Projetos legados cujo único registro de pasta externa estava no índice (e não no próprio `projeto.json` daquele projeto, por terem sido criados antes da correção de persistência) podem ficar "invisíveis" até o usuário localizar manualmente a pasta e selecioná-la pela nova interface → Mitigação: aceitável — a pasta em si nunca foi perdida, apenas o atalho de descoberta automática; o usuário ainda pode navegar manualmente até ela.

## Migration Plan

1. Aplicar/implantar `add-load-project-by-folder` primeiro (ou junto).
2. Remover os três pontos de leitura/escrita de `index.json` em `server.js`.
3. Remover `GET /api/projetos` e o código cliente correspondente (`carregarListaProjetos`, listagem em `#listaProjetos`).
4. Apagar `saídas/index.json` do disco.
5. Rollback: caso necessário, reverter o diff restaura o comportamento anterior — o arquivo `index.json` seria recriado normalmente na próxima escrita (`saveProject`), sem perda de dados (todo o conteúdo relevante já está em cada `projeto.json` individual).
