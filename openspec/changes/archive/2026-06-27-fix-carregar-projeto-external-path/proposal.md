## Why

`POST /api/carregar-projeto` localizava o diretório do projeto exclusivamente via `path.join(SAIDAS_ROOT, slug)`, ignorando projetos externos cujo caminho real está registrado em `index.json` sob a chave `pastaProjeto`. Para esses projetos, o handler ou retornava 404 (se `saídas/{slug}/` não existia) ou lia o `projeto.json` errado (`saídas/` em vez do caminho externo), resultando em `sess.config.pastaProjeto` vazio. Isso causava o download indesejado em `finalizar-conteudo`, campos em branco na Etapa 1 e gravações indo para `saídas/` em vez da pasta configurada pelo usuário. Resolve parcialmente o Gap G04 para o fluxo de carregamento de projetos externos.

## What Changes

- `POST /api/carregar-projeto` (`server.js`): antes de definir `dir`, lê `index.json` para obter o `pastaProjeto` do slug. Se não-vazio, usa-o como `baseDir`; caso contrário, mantém o comportamento atual (`saídas/{slug}/`).
- A migração legada (`migrarSeNecessario`) só é executada quando `baseDir` for o diretório local em `saídas/` (projetos externos já têm a estrutura correta).
- No branch legado (sem `projeto.json`), se `baseDir` for externo, `pastaProjeto` é preservado no config da sessão em vez de ser definido como string vazia.

## Capabilities

### New Capabilities

Nenhuma nova capability.

### Modified Capabilities

- `project-load`: o carregamento de projeto passa a resolver o diretório base via `index.json`, suportando projetos externos com `pastaProjeto` não-vazio.

## Impact

- **`server.js`**: handler `POST /api/carregar-projeto` — adição de lookup no `index.json` para resolver `baseDir`
- **`saídas/index.json`**: lido (não escrito) durante o carregamento
- **Sem mudanças no frontend ou em outros endpoints**
- **Sem novos endpoints ou dependências**

## Non-goals

- Não sincroniza nem migra arquivos entre o diretório `saídas/` e o caminho externo
- Não detecta automaticamente o caminho externo quando `index.json` não o contém (ex.: após perda do índice)
- Não resolve o Gap G04 para as demais etapas do pipeline
