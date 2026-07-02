## Context

O sistema atual usa dois helpers de path: `courseDir(sess)` (retorna `saídas/{slug}/`) e uma propriedade de sessão `pastaSaida` usada pelos endpoints de exportação. Arquivos `.txt` e `projeto.json` sempre ficam em `courseDir`; `.docx` de exportação vão para `pastaSaida` quando definida, senão são enviados como download. O resultado é fragmentação: o usuário define uma pasta de saída mas os arquivos de memória continuam dentro do diretório da aplicação.

## Goals / Non-Goals

**Goals:**
- Um único par de helpers (`courseRootDir` / `courseScrDir`) controla todos os paths do projeto
- `.docx` entregáveis na raiz da pasta do projeto; internos (`.txt`, `projeto.json`) em `/scr`
- Projetos descobertos via índice global `saídas/index.json` mesmo quando os arquivos estão em pastas externas
- Migração automática de projetos legados (estrutura plana) sem perda de dados

**Non-Goals:**
- Suporte a múltiplas pastas por projeto
- Monitoramento em tempo real da pasta
- Mover arquivos quando `pastaProjeto` muda em projeto existente

## Decisions

### D1 — Dois helpers de path: `courseRootDir` e `courseScrDir`

```
courseRootDir(sess) = sess.config.pastaProjeto  ||  saídas/{slug}/
courseScrDir(sess)  = courseRootDir(sess) + /scr/
```

Ambos chamam `fs.mkdirSync(..., { recursive: true })` na primeira vez. Toda a lógica de path se concentra nesses dois helpers — nenhum outro código precisa saber de `pastaProjeto` ou do fallback.

Alternativa considerada: manter `courseDir` e adicionar um segundo `scrDir` — rejeitado porque manteria ambiguidade sobre qual helper usar onde.

### D2 — Índice global `saídas/index.json` para descoberta de projetos

`GET /api/projetos` precisaria escanear todas as pastas do sistema operacional para encontrar projetos com `pastaProjeto` definido. Em vez disso, `saveProject()` sempre atualiza `saídas/index.json`:

```json
{
  "Python_para_Iniciantes": {
    "nome": "Python para Iniciantes",
    "pastaProjeto": "C:/Docs/Python/",
    "ultimaModificacao": "2026-06-26T..."
  }
}
```

`GET /api/projetos` lê o índice e complementa com qualquer diretório em `saídas/` que não esteja no índice (projetos legados sem índice). Escrita no índice é `readFileSync + merge + writeFileSync` — operação síncrona curta, sem risco de race condition dado o modelo single-threaded do Node.js.

### D3 — `pastaProjeto` no `CourseConfig`, não como campo separado de sessão

`pastaSaida` era um campo isolado de sessão (não em `config`, não persistido em `projeto.json`). `pastaProjeto` vai dentro de `sess.config`, persistido em `projeto.json` → sobrevive ao restart do servidor, restaurado via `POST /api/carregar-projeto`.

Campo no formulário da Etapa 1: campo de texto, label "Pasta do projeto", opcional, placeholder `ex: C:\MeusCursos\Python`. Sem validação de existência no frontend (o servidor cria os diretórios).

### D4 — Migração de projetos legados on-load

Na função `POST /api/carregar-projeto`, após ler o `projeto.json` e os `.txt` legados:

1. Verificar se `projeto.json` está em `saídas/{slug}/` (raiz, sem `/scr`)
2. Verificar se os `.txt` estão em `saídas/{slug}/` (raiz)
3. Se sim: mover para `saídas/{slug}/scr/` e logar a migração
4. Retornar resposta normalmente; o cliente não percebe a migração

Projetos legados sem `pastaProjeto` usam `saídas/{slug}/` como root (fallback), então após a migração continuam funcionando corretamente.

### D5 — Sanitização de `pastaProjeto` (G03 parcial)

No servidor (`POST /api/config`), validar que `pastaProjeto`:
- Não contém traversal (`..`)
- Não aponta para dentro do diretório da aplicação (evitar sobrescrever código-fonte)

Se inválido: retornar erro 400. O campo continua opcional — se vazio, usa fallback interno.

## Risks / Trade-offs

- **Índice desincronizado**: Se um projeto for deletado do disco manualmente, o índice ainda o listará. Mitigation: `GET /api/projetos` verifica se o `courseScrDir` existe antes de incluir o projeto na lista.
- **Permissões de escrita em `pastaProjeto`**: O servidor pode não ter permissão de escrita em uma pasta arbitrária definida pelo usuário. Mitigation: `POST /api/config` testa a escrita (`fs.accessSync(pasta, fs.constants.W_OK)`) e retorna erro descritivo se falhar.
- **Projetos legados com `.docx` em `pastaSaida` anterior**: Os `.docx` já exportados para a antiga `pastaSaida` não são movidos (Non-goal). Apenas os novos `.docx` irão para `courseRootDir`.

## Migration Plan

1. Deploy do novo código — `saveProject()` passa a escrever em `courseScrDir`; `readMemory()` lê de lá
2. Primeiro acesso a projeto legado: migração automática move arquivos planos para `/scr`
3. Rollback: reverter `server.js` e `index.html`/`app.js`; arquivos em `/scr` ainda são lidos pelo código antigo se o `/scr` não existia antes (retorna string vazia, etapas reaparecem como não geradas — sem perda de dados, apenas inconveniência)
