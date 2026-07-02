## Why

O sistema atual perde toda a sessão ao reiniciar o servidor (Gap G04) e não persiste configurações pedagógicas (BNCC, metodologia) em disco. Quando um usuário retorna ao projeto semanas ou meses depois, precisa re-configurar tudo do zero — e qualquer edição feita manualmente nos `.docx` gerados é invisível ao sistema, pois ele nunca lê esses arquivos de volta. Isso torna o sistema inviável para ciclos longos de produção de conteúdo.

## What Changes

- **Novo arquivo `projeto.json`** persistido em `saídas/{course-slug}/`: serializa toda a sessão recuperável (config, bncc, metodologia, lista de aulas com metadados de origem), tornando o projeto recarregável a qualquer momento.
- **Endpoint `GET /api/projetos`**: lista os projetos existentes em `saídas/` lendo os `projeto.json` encontrados.
- **Endpoint `POST /api/carregar-projeto`**: recebe o slug do projeto, lê `projeto.json` + todos os `.txt` e reconstrói a sessão completa — sem nenhuma chamada à OpenAI.
- **Tela "Abrir projeto existente"** na Etapa 0 da interface: exibe os projetos disponíveis e permite recarregá-los com um clique.
- **Endpoint `POST /api/importar/:stage`**: recebe um `.docx` editado pelo usuário, extrai o texto com `mammoth`, identifica o estágio pelo nome do arquivo (primário) ou primeiro título H1 (fallback), confirma com o usuário e sobrescreve o `.txt` correspondente — tornando a versão humana a fonte canônica daquela etapa.
- **Atualização do `projeto.json`** após cada importação: registra `fonte: "usuario"` e `importadoEm` por aula/etapa.
- **Banner "versão editada"** na interface: indica visualmente quais etapas usam conteúdo importado pelo usuário vs. gerado pela IA.

## Non-goals

- Sincronização bidirecional entre `.docx` e `.txt` (a conversão via `mammoth` é unidirecional — perde formatação visual).
- Histórico de versões com diff ou rollback.
- Suporte a múltiplos usuários simultâneos editando o mesmo projeto (sem controle de concorrência).
- Edição inline de texto diretamente na interface web.
- Migração automática de projetos criados antes desta change (requer reprocessamento manual).

## Capabilities

### New Capabilities

- `project-load`: Listar projetos existentes, selecionar um e reconstruir a sessão completa a partir de `projeto.json` + arquivos `.txt` em disco — sem chamadas à OpenAI.
- `stage-import`: Upload de `.docx` editado pelo usuário para substituir o `.txt` de qualquer etapa, com identificação automática da etapa por nome de arquivo ou título H1 e confirmação antes de sobrescrever.

### Modified Capabilities

- `session-persistence`: A sessão passa a ser serializada em `projeto.json` a cada etapa concluída, e os campos `bncc` e `metodologia` (hoje apenas em memória) passam a ser persistidos em disco.

## Impact

- **`server.js`**: novo helper `saveProject(sess)`, novos endpoints `GET /api/projetos`, `POST /api/carregar-projeto`, `POST /api/importar/:stage`; chamada a `saveProject()` adicionada ao final de cada `persistStage()`.
- **`public/index.html`**: novo card "Abrir projeto existente" na Etapa 0; banner de "versão editada" em cada etapa; botão "Importar versão editada (.docx)" visível após conclusão de cada etapa.
- **`public/app.js`**: lógica de listagem e carregamento de projetos; handler de upload por etapa; renderização do banner de origem.
- **`public/style.css`**: estilos para o card de projetos existentes, badges de origem (IA vs. usuário) e estado "carregado do disco".
- **Dependências**: nenhuma nova — `mammoth` já está instalado (usado na Etapa 6).
- **Resolve Gap G04** (sessão in-memory perdida ao reiniciar).
