## Why

O seletor nativo de pasta (`GET /api/escolher-pasta`) sempre abre na raiz do usuário. Quem trabalha com cursos em pastas fundas (ex.: OneDrive › Projetos › Claude › Projetos › Cursos) precisa refazer todo o caminho a cada vez que abre ou escolhe uma pasta de projeto.

## What Changes

- O servidor persiste em disco a última pasta escolhida no seletor nativo (arquivo `.ultima-pasta.json` na raiz do app, ignorado pelo git).
- Na abertura seguinte, o diálogo nativo já inicia nessa pasta (se ela ainda existir), em ambos os botões que usam o seletor ("Selecionar pasta do projeto" e "Procurar..." do formulário da Etapa 1).
- Cancelar o diálogo não altera a pasta lembrada. Falhas de leitura/escrita da persistência nunca quebram o seletor.

## Non-goals

- Lembrar várias pastas / lista de recentes.
- Persistir por usuário ou por sessão (o app é local e mono-usuário — ver non-goal de multi-tenancy).
- Mudar o fluxo de carregamento do projeto ou o conteúdo de `projeto.json`.
- Novas dependências npm; operação assíncrona nova (SSE não se aplica).

## Capabilities

### New Capabilities
<!-- nenhuma -->

### Modified Capabilities
- `native-folder-picker`: o diálogo passa a abrir na última pasta escolhida e a registrá-la a cada seleção.

## Impact

- `server.js`: `escolherPastaWindows`, `GET /api/escolher-pasta`, helpers de leitura/gravação da última pasta.
- `.gitignore` (`.ultima-pasta.json`); `.env.example` (comentário opcional de `ULTIMA_PASTA_FILE`).
- Testes novos em `tests/integration/`. `public/app.js` não precisa mudar (os dois botões já usam o mesmo endpoint).
- `openspec/specs/native-folder-picker` (delta).
