## Context

O sistema atual persiste cada etapa como par `.txt` + `.docx` em `saídas/{slug}/`, mas a sessão em memória perde: configuração BNCC, metodologia, e o array estruturado de aulas (`LessonMeta[]`). Além disso, nenhuma edição feita pelo usuário num `.docx` retorna ao sistema — o `.txt` original da IA permanece como fonte canônica para sempre.

A mudança introduz dois mecanismos complementares:
1. **`projeto.json`** — snapshot serializado da sessão, gravado a cada etapa concluída.
2. **Importação de `.docx` editado** — substituição cirúrgica de um `.txt` por conteúdo extraído de um `.docx` anotado pelo usuário.

## Goals / Non-Goals

**Goals:**
- Recarregar projeto completo (config + bncc + metodologia + aulas) sem nenhuma chamada à OpenAI.
- Persistir campos hoje voláteis: `bncc`, `metodologia`, `aulas` (LessonMeta[]).
- Permitir que edições humanas em `.docx` se tornem a fonte canônica de qualquer etapa.
- Identificar o estágio de um `.docx` importado sem exigir que o usuário informe manualmente.
- Registrar a origem de cada artefato (IA vs. usuário) no `projeto.json`.

**Non-Goals:**
- Histórico de versões com diff/rollback.
- Sincronização bidirecional `.docx` ↔ `.txt` (a conversão mammoth é unidirecional).
- Suporte a múltiplos usuários editando o mesmo projeto simultaneamente.
- Edição inline de texto na interface web.

## Decisions

### D1 — `projeto.json` como única fonte de verdade da sessão

**Decisão:** gravar `saídas/{slug}/projeto.json` a cada chamada a `persistStage()`, serializando os campos não recuperáveis: `config`, `bncc`, `metodologia`, `aulas`.

**Alternativa considerada:** gravar `bncc.json` e `metodologia.txt` como arquivos separados.

**Razão:** um único arquivo JSON é mais fácil de carregar atomicamente, versionar e inspecionar manualmente. Também facilita a listagem de projetos (`GET /api/projetos` lê apenas `projeto.json` de cada subpasta).

---

### D2 — Identificação do estágio por nome de arquivo (primário) + título H1 (fallback)

**Decisão:** ao receber um `.docx` no endpoint `POST /api/importar/:stage` sem o param de rota explícito (upload genérico), tentar:
1. Nome do arquivo: `aula03_conteudo.docx` → `aula03_conteudo`
2. Primeiro H1 extraído pelo mammoth → busca fuzzy nos títulos de `projeto.json.aulas`
3. Se ambíguo: retornar lista de candidatos para o frontend exibir seletor.

**Alternativa considerada:** exigir que o usuário selecione o estágio antes do upload.

**Razão:** reduz fricção no caso comum (usuário mantém o nome original do arquivo). O seletor aparece apenas como fallback.

---

### D3 — Carregamento de projeto reconstrói sessão sem OpenAI

**Decisão:** `POST /api/carregar-projeto` lê `projeto.json` (campos estruturados) + todos os `.txt` existentes (conteúdo textual) e popula a sessão integralmente.

**Razão:** o objetivo é retomada rápida — qualquer chamada à OpenAI nesse fluxo seria regressão. Os `.txt` já contêm o conteúdo suficiente para as etapas seguintes via `readMemory()`.

---

### D4 — `saveProject()` chamado dentro de `persistStage()`

**Decisão:** adicionar `saveProject(sess)` ao final de `persistStage()` em vez de chamá-lo individualmente em cada endpoint.

**Razão:** garante que `projeto.json` é sempre atualizado quando qualquer artefato textual muda, sem necessidade de alterar cada handler individualmente.

---

### D5 — Badge de origem no frontend (IA vs. usuário)

**Decisão:** o frontend lê `projeto.json.stages[stage].fonte` e exibe badge colorido: `🤖 gerado pela IA` ou `✏️ importado pelo usuário`.

**Razão:** transparência — o usuário precisa saber quando está trabalhando com seu próprio conteúdo vs. o original da IA, especialmente antes de regenerar uma etapa (o que sobrescreveria a versão importada).

## Risks / Trade-offs

**[Risco] Perda de formatação ao importar `.docx`** → Mitigação: informar o usuário no momento do upload que a formatação visual (tabelas, cores) é descartada; o que importa é o conteúdo textual que alimenta as etapas seguintes.

**[Risco] Título H1 alterado pelo usuário invalida o fallback de identificação** → Mitigação: quando nenhum match é encontrado, o frontend exibe seletor explícito; nunca sobrescreve sem confirmação.

**[Risco] `projeto.json` desatualizado se o servidor travar durante `persistStage()`** → Mitigação: gravar `projeto.json` depois do `.txt`, não antes; se o `.txt` existe mas o `projeto.json` não, o carregamento usa `readMemory()` para os textos e sinaliza que campos estruturados precisam ser reinseridos.

**[Trade-off] `saveProject()` dentro de `persistStage()` adiciona I/O síncrono a cada etapa** → Aceitável: o `projeto.json` é pequeno (< 10 KB), a escrita é local e não bloqueia o SSE (que já terminou quando `persistStage()` é chamado).

## Migration Plan

1. Nenhuma migração de dados necessária: projetos existentes continuam funcionando — apenas não têm `projeto.json` ainda.
2. Ao abrir um projeto sem `projeto.json` via "Abrir projeto existente", o sistema sinaliza quais campos precisam ser reinseridos manualmente (bncc, metodologia) e carrega os demais via `readMemory()`.
3. Após a primeira execução de qualquer etapa com o servidor atualizado, o `projeto.json` é criado automaticamente.

## Open Questions

- **Q1:** Exibir o seletor de projeto na Etapa 0 (antes da config) ou como modal no header? — Decisão de UX a confirmar durante implementação.
- **Q2:** Ao carregar projeto e depois regenerar uma etapa cujo `.txt` era de origem `"usuario"`, avisar antes de sobrescrever? — Recomendado sim; implementar como modal de confirmação.
