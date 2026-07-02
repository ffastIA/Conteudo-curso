## Context

O `projeto.json` já persiste os campos estruturais da sessão (`config`, `bncc`, `metodologia`, `aulas`) e o servidor restaura esses campos em memória ao carregar um projeto. O problema tem duas faces:

1. **Inputs de texto livre não são salvos**: `topicos`/`limite` (Etapa 2), `ajustesEnsino` (Etapa 3) e `observacoesAula` (Etapa 4) nunca chegam ao disco.
2. **Frontend não repopula campos**: mesmo para os dados já salvos (`config`, `metodologia`), a função `selecionarProjeto()` no `app.js` não injeta os valores nos campos do DOM.

## Goals / Non-Goals

**Goals:**
- Persistir em `projeto.json` todos os inputs de texto livre que o usuário fornece em cada etapa geradora
- Restaurar `config` (Etapa 1) e `metodologia` (Etapa 0) que já estão no JSON mas nunca foram repopulados
- Repopular os campos editáveis do DOM assim que o projeto for carregado

**Non-Goals:**
- Reexibir o estado visual dos botões/checkboxes BNCC (complexidade desproporcional ao benefício)
- Sincronização em tempo real enquanto o usuário digita (só persiste no submit/geração)
- Migração retroativa de projetos antigos

## Decisions

### D1 — Armazenar inputs em `sess.inputs` (objeto flat na sessão)

Adicionar `sess.inputs` como objeto flat na sessão em memória, com as mesmas chaves dos campos de formulário. `saveProject()` inclui esse objeto no JSON sem mudança de assinatura. Alternativa considerada: passar `inputs` delta por parâmetro para `saveProject()` (como `stageInfo`), mas tornaria cada chamada mais verbosa sem ganho real.

**`sess.inputs` mantém sempre o último estado dos campos:**
```
{
  topicos: "",       // Etapa 2
  limite: 3,         // Etapa 2
  ajustesEnsino: "", // Etapa 3
  observacoesAula: ""// Etapa 4
}
```

Os campos da Etapa 1 já vivem em `sess.config` — não são duplicados em `inputs`.

### D2 — Enriquecer a resposta de `/api/carregar-projeto`

A resposta atual só retorna `{ ok, etapasCarregadas, camposFaltantes, stages, nome }`. Estendê-la com `config`, `metodologia` e `inputs` (todos já disponíveis na sessão após o load) evita uma segunda requisição e mantém o padrão request/response existente.

### D3 — Persistir inputs junto com a geração da etapa

Cada endpoint que recebe inputs do usuário (`/api/search`, `/api/plano-ensino`, `/api/plano-aula`) já chama `persistStage()` que internamente chama `saveProject()`. Basta atualizar `sess.inputs` antes dessa chamada. O `/api/config` chama `saveProject()` diretamente — adicionar a atualização ali também.

### D4 — Restauração no frontend via `selecionarProjeto()`

Usar `data.config` e `data.inputs` retornados pelo servidor para setar `element.value` nos campos correspondentes após o carregamento. A metodologia é renderizada via `renderMarkdown()` no painel existente (`#metodologiaResult`), com exibição condicional dos botões de ação (`#metodologiaActions`).

## Risks / Trade-offs

- **Input desatualizado vs. conteúdo gerado**: Se o usuário alterar `ajustesEnsino` após gerar o plano e regenerar, o input salvo refletirá a última geração (correto). Se editar o campo sem gerar novamente, o input em disco ficará desatualizado até a próxima geração. Mitigation: aceitável — o propósito é restaurar o contexto da última geração, não rastrear edições intermediárias.
- **Projetos legados sem `inputs`**: Ao carregar, `data.inputs` será `null`/`undefined`. Mitigation: o frontend trata ausência de `inputs` como no-op (nenhum campo é apagado).
- **`sess.inputs` não inicializado em sessões antigas**: `getSession()` precisa incluir `inputs: {}` no objeto de sessão padrão para evitar undefined.

## Migration Plan

1. Deploy do servidor com as alterações em `saveProject()`, `getSession()` e `/api/carregar-projeto`
2. Projetos existentes continuam carregando normalmente (campo `inputs` ausente é ignorado)
3. Na primeira geração após o deploy, `inputs` passa a ser gravado no `projeto.json`

Rollback: reverter server.js e app.js — sem impacto em dados, pois `inputs` é apenas lido/ignorado.
