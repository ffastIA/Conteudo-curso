## Why

Ao carregar um projeto existente, os campos editáveis de cada etapa ficam em branco, forçando o usuário a redigitar todas as entradas (tópicos de pesquisa, ajustes no plano de ensino, observações de aula) mesmo que o projeto já esteja parcialmente concluído. O `projeto.json` já persiste os dados estruturais (`config`, `bncc`, `metodologia`, `aulas`), mas não guarda os inputs de texto livre de cada etapa, e o frontend não repopula os campos mesmo quando os dados já estão disponíveis.

## What Changes

- `projeto.json` passa a incluir o campo `inputs` com todos os valores de texto livre que o usuário inseriu em cada etapa
- `saveProject()` no servidor atualiza `inputs` sempre que um input é recebido (junto com o save das etapas textuais e estruturais)
- A resposta de `POST /api/carregar-projeto` passa a incluir o objeto `inputs` para que o frontend possa restaurar os campos
- O frontend restaura todos os campos editáveis ao carregar um projeto:
  - **Etapa 1**: todos os campos do formulário de config (nome, público-alvo, carga, duração, nível, objetivos, modalidade, proporção teórico/prático, pré-requisitos) — já salvos em `config`, precisam apenas ser lidos e injetados no DOM
  - **Etapa 0**: metodologia gerada exibida no painel de resultado; seleções BNCC não são restauradas visualmente (fluxo de botões), mas o estado em memória já é restaurado pelo servidor
  - **Etapa 2**: campos `topicos` e `limite` (número de fontes)
  - **Etapa 3**: campo `ajustesEnsino`
  - **Etapa 4**: campo `observacoesAula`

## Capabilities

### New Capabilities

*(nenhuma)*

### Modified Capabilities

- `session-persistence`: adicionar subcampo `inputs` ao `projeto.json` (topicos, limite, ajustesEnsino, observacoesAula) e estender a lógica de restauração para preencher os campos editáveis do frontend ao carregar um projeto.

## Impact

- **`server.js`**: `saveProject()` recebe e persiste `inputs`; cada endpoint que recebe input do usuário chama `saveProject` com o delta de inputs; `POST /api/carregar-projeto` retorna `inputs` na resposta.
- **`public/app.js`**: `selecionarProjeto()` popula os campos do DOM com `data.config` e `data.inputs` após carregar o projeto; metodologia renderizada se `data.metodologia` estiver disponível.
- **`public/index.html`**: sem alterações estruturais; IDs dos campos existentes são suficientes.
- **Sem breaking changes**: campo `inputs` é opcional no JSON — projetos antigos sem ele continuam carregando normalmente.

## Non-goals

- Não restaurar o estado visual dos checkboxes/botões BNCC (o estado estrutural já é restaurado no servidor; reexibir toda a árvore BNCC é complexidade não prioritária).
- Não sincronizar inputs em tempo real enquanto o usuário digita (só persiste no submit/ação de geração).
- Não migrar projetos antigos para adicionar `inputs` retroativamente.
