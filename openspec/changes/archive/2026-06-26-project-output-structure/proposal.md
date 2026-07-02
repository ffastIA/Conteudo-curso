## Why

Atualmente os arquivos de um curso são gerados em dois locais diferentes: os arquivos internos (`.txt`, `projeto.json`) ficam em `saídas/{slug}/` dentro do diretório do projeto, enquanto os `.docx` de exportação são salvos em uma pasta global `pastaSaida` configurada separadamente. Isso dificulta localizar todos os arquivos de um curso em um único lugar. O objetivo é que cada projeto tenha sua própria pasta raiz — definida pelo usuário — com os entregáveis `.docx` na raiz e os arquivos internos em um subdiretório `/scr`.

## What Changes

- **BREAKING** — Substituir o campo global `pastaSaida` (sessão) pelo campo por-projeto `pastaProjeto` (em `sess.config`), definido na Etapa 1 junto com os demais dados do curso
- Introduzir `courseRootDir(sess)`: retorna `pastaProjeto` quando definido, senão `saídas/{slug}/` como fallback
- Introduzir `courseScrDir(sess)`: retorna `{courseRootDir}/scr/` — todos os arquivos internos (`.txt`, `projeto.json`) vão aqui
- `persistStage()` passa a salvar: `.docx` em `courseRootDir`, `.txt` em `courseScrDir`
- `saveProject()` salva `projeto.json` em `courseScrDir`
- `readMemory()` lê `.txt` de `courseScrDir`
- Introduzir índice global `saídas/index.json` mapeando `slug → { nome, pastaProjeto, ultimaModificacao }` para que `GET /api/projetos` continue funcionando mesmo quando os arquivos estão em pastas externas
- `saveProject()` atualiza o índice global a cada gravação
- Migração automática de projetos legados: ao carregar um projeto com arquivos em `saídas/{slug}/` (estrutura plana antiga), mover os `.txt` para `saídas/{slug}/scr/` e o `projeto.json` para `saídas/{slug}/scr/projeto.json`
- Remover o endpoint `POST /api/pasta-saida` e o campo `pastaSaida` da sessão — substituídos integralmente por `pastaProjeto` no config
- Adicionar campo `pastaProjeto` ao formulário da Etapa 1 (campo de texto, opcional, com placeholder de exemplo)

## Capabilities

### New Capabilities

- `project-folder`: configuração de pasta por projeto, estrutura `root/.docx` + `root/scr/` internos, índice global de projetos

### Modified Capabilities

- `session-persistence`: `projeto.json` e `.txt` passam para `courseScrDir`, `pastaSaida` removido, `pastaProjeto` adicionado ao `config`
- `course-config`: novo campo `pastaProjeto` no formulário da Etapa 1

## Impact

- **`server.js`**: `courseDir()` → `courseRootDir()` + `courseScrDir()`; `persistStage()`; `saveProject()`; `readMemory()`; `GET /api/projetos`; `POST /api/carregar-projeto`; exportação `.docx`; remoção de `POST /api/pasta-saida`
- **`public/index.html`**: campo `pastaProjeto` na Etapa 1; remover campo `pastaSaida` do painel de configurações
- **`public/app.js`**: incluir `pastaProjeto` no submit do `configForm`; remover lógica do `btnSalvarPasta`
- Sem novas dependências npm

## Non-goals

- Não suportar múltiplas pastas por projeto (uma pasta raiz por curso)
- Não sincronizar ou monitorar a pasta em tempo real
- Não mover arquivos quando o usuário troca `pastaProjeto` de um projeto existente
- Não migrar automaticamente projetos legados de outros usuários que possam ter estruturas diferentes
