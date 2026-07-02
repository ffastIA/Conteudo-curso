## Context

Hoje a ordem é: Etapa 0 (BNCC → deriva/confirma metodologia) → Etapa 1 (Configuração, `POST /api/config` já gera a ementa usando `sess.metodologia`, que já existe nesse ponto). O change pedido inverte essa dependência: a Etapa 1 passa a ser preenchida primeiro, e a metodologia só existe ao final dela. Isso quebra a premissa atual de `POST /api/config` (`server.js`, validação + `conteudoMudou` + geração imediata da ementa usando `sess.metodologia`) — se nada mudar aí, a ementa seria gerada sem metodologia, contradizendo o propósito documentado da capability `pedagogical-methodology` ("Contexto pedagógico injetado em todas as skills de geração").

A metodologia também nunca é persistida em disco hoje (`GET /api/metodologia` só seta `sess.metodologia` em memória) e não participa do padrão de export/import genérico (`STAGES_FIXOS`, `stepLabels`/`textMap` de `POST /api/export/:step`) que todas as outras etapas já usam.

## Goals / Non-Goals

**Goals:**
- Geração da metodologia ocorre ao final da Etapa 1, com o perfil do curso já salvo.
- Metodologia exportável, editável externamente e reimportável, como as demais etapas.
- Um ponto de confirmação explícito que persiste a metodologia e só então libera a Etapa 2.
- Ementa continua sendo gerada com a metodologia correta injetada (preservando a garantia já documentada em `pedagogical-methodology`), só que mais tarde no fluxo.

**Non-Goals:**
- Não trava os campos do formulário da Etapa 1 após a primeira geração de metodologia.
- Não implementa um caminho para pular a geração de metodologia.
- Não muda a lógica de `conteudoMudou` em si, só quando a ementa é efetivamente gerada.

## Decisions

### Adiar a geração da ementa de `POST /api/config` para a confirmação da metodologia

`POST /api/config` continua validando campos e atualizando `sess.config` exatamente como hoje, incluindo o cálculo de `conteudoMudou` (comparação feita ANTES de sobrescrever `sess.config`, como já é). A diferença: em vez de gerar a ementa ali, guarda a decisão:

```javascript
sess._precisaGerarEmenta = !sess.ementa || conteudoMudou;
res.json({ ok: true }); // não retorna mais "ementa" aqui — ela ainda não existe
```

Novo endpoint `POST /api/metodologia/confirmar`:

```javascript
app.post('/api/metodologia/confirmar', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.metodologia) return res.status(400).json({ error: 'Gere a metodologia antes de confirmar.' });
  try {
    if (sess._precisaGerarEmenta) {
      const { nome, publico, carga, duracao, nivel, objetivos } = sess.config;
      const skill = skills.ementaSkill({
        nome, publico, carga, duracao, nivel, objetivos,
        metodologia: sess.metodologia,
        bnccContext: sess.bncc?.ativo ? sess.bncc.itens.map(i => `${i.codigo ? `[${i.codigo}] ` : ''}${i.descricao}`).join('; ') : ''
      });
      const completion = await openai.chat.completions.create({ model: skill.model, messages: [...] });
      addUsage(completion.usage);
      sess.ementa = completion.choices[0]?.message?.content?.trim() || '';
      sess._precisaGerarEmenta = false;
    }
    if (sess.ementa) await persistStage(sess, 'ementa', 'Ementa do Curso', sess.ementa);
    await persistStage(sess, 'metodologia', 'Metodologia Pedagógica', sess.metodologia);
    res.json({ ok: true, ementa: sess.ementa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- *Por que:* preserva integralmente a lógica de `conteudoMudou` já existente e testada, só reposicionando ONDE a chamada à OpenAI para ementa acontece — no momento em que a metodologia definitiva (gerada ou reimportada) já está disponível. `persistStage` já é a função usada por todas as outras etapas; reaproveitá-la para `metodologia` garante o mesmo padrão de arquivo (`.txt` em `/scr`, `.docx` na raiz) sem código novo de persistência.
- *Alternativa considerada:* gerar a ementa duas vezes (uma vez cedo com metodologia vazia, outra depois com metodologia real). Rejeitada — desperdiça uma chamada à OpenAI e o usuário veria uma ementa "errada" brevemente antes de ser substituída.
- *Alternativa considerada:* mover a ementa para dentro do próprio "Gerar Metodologia" (gerar ementa e metodologia juntas, antes da revisão). Rejeitada porque a ementa deve refletir a metodologia FINAL (possivelmente editada/reimportada pelo usuário antes de confirmar) — gerá-la antes da revisão arrisca ficar desalinhada se o usuário trocar a metodologia depois.

### Reaproveitar o padrão de export/import genérico para metodologia

Adicionar `metodologia` a três mapas já existentes, sem criar nenhum componente novo de UI:
- `STAGES_FIXOS` (server.js, usado por `POST /api/importar`/`POST /api/importar/confirmar`): `'metodologia': { sessField: 'metodologia', label: 'Metodologia Pedagógica' }`.
- `stepLabels`/`textMap` de `POST /api/export/:step`: `metodologia: 'Metodologia Pedagógica'` / `metodologia: sess.metodologia`.
- `STAGE_BADGE_MAP` (app.js): `metodologia: 'origemMetodologia'` (novo elemento de badge no card de metodologia da Etapa 1).

O botão "Gerar novamente" no card de metodologia chama exatamente a mesma função de geração (reenviando a config atual do formulário + gerando metodologia), garantindo que nunca fique dessincronizado dos campos visíveis.

- *Por que:* `exportDocx(step)` e `abrirImportar(stageHint)` já são genéricos (funcionam para qualquer `step`/`stage` presente nesses mapas) — não é necessário nenhum código de UI novo além dos botões, só registrar `metodologia` nos mesmos mapas que ementa/pesquisa/plano de ensino já usam.

### Etapa 0 sem metodologia: handlers de conclusão da BNCC vão direto para a Etapa 1

`btnBnccNao` e o handler de `btnConfirmarBncc` (que hoje fazem `document.getElementById('metodologiaContainer').style.display = 'block'`) passam a fazer `markDone(0); goStep(1);`, replicando exatamente o padrão já usado por `btnPularEtapa0`. O bloco `#metodologiaContainer` e as funções client-side associadas (`derivarMetodologia`) são removidos da Etapa 0 e recriados (adaptados) na Etapa 1.

## Risks / Trade-offs

- [Risco] Tornar a geração de metodologia obrigatória para avançar à Etapa 2 (não há mais botão de pular) pode incomodar quem só quer prosseguir rápido → Mitigação: aceito conscientemente — é o comportamento pedido explicitamente pelo usuário (item 3: "só aí o sistema assume... para as demais etapas").
- [Risco] Sessões em memória perdidas entre o clique em "Gerar Metodologia" e "Salvar e ir para Etapa 2" perderiam a flag `sess._precisaGerarEmenta` e a metodologia gerada (mesma limitação já existente do gap G04, não uma regressão nova) → Mitigação: nenhuma adicional além da já aceita no restante do sistema.
- [Risco] Usuário reimporta uma metodologia editada e clica direto em "Salvar e ir para Etapa 2" sem gerar/ver o resultado por IA primeiro (fluxo: gerar → exportar → editar → importar → confirmar) → Mitigação: comportamento correto e esperado — `POST /api/importar/confirmar` já atualiza `sess.metodologia`, então a confirmação final usa exatamente o texto reimportado, igual ao padrão das outras etapas.

## Migration Plan

Mudança server + client, sem alteração de schema persistido (apenas novos arquivos `metodologia.txt`/`metodologia.docx` passam a existir a partir de agora). Projetos antigos sem esses arquivos continuam funcionando normalmente — `sess.metodologia` pode vir vazia ou restaurada do `projeto.json` ao carregar um projeto existente. Rollback trivial: reverter o diff.
