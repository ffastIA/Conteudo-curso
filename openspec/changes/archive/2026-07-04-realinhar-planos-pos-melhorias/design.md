# Design: realinhar-planos-pos-melhorias

## Context

O plano de aula é um documento único (`plano_de_aula.txt`) organizado em seções `# Aula N: Título`; `extractLessonBlock(fullText, index)` (`server.js:124`) já extrai a seção de uma aula. O ciclo de melhorias itera as aulas, reescreve `aula.texto` via `aplicarMelhoriasSkill`, calcula `similaridade` (Jaccard) contra a versão anterior e persiste cada `aulaNN_conteudo` — sem tocar nos planos. A revisão de qualidade usa o trecho do plano como referência de compatibilidade, então o descompasso é detectável pelo próprio sistema no ciclo seguinte.

Decisões do usuário: realinhar automaticamente **apenas o plano de aula**; para ementa/plano de ensino, **apenas sinalizar** extrapolações; execução **automática** ao final das melhorias.

## Goals / Non-Goals

**Goals:**
- Plano de aula coerente com o conteúdo após cada ciclo de melhorias, sem intervenção manual.
- Preservar a hierarquia curricular: ementa/plano de ensino permanecem a referência oficial.
- Respeitar versões do plano editadas pelo usuário.

**Non-Goals:**
- Reescrever ementa/plano de ensino; botão/etapa nova de UI; realinhar aulas sem mudança relevante.

## Decisions

1. **Realinhamento seletivo pelo limiar existente (similaridade ≤ 0.90).**
   O código já classifica > 0.90 como "conteúdo pouco alterado" (`server.js:2005`); reusar o mesmo limiar evita um segundo critério e não gasta chamadas com aulas inalteradas. Alternativa rejeitada: realinhar todas as aulas — custo sem benefício.

2. **Uma skill por aula alterada, editando só a seção (`replaceLessonBlock`), não o plano inteiro.**
   Regenerar o plano completo numa chamada única arriscaria drift nas aulas não alteradas e estouraria contexto em cursos grandes. A edição seccional preserva bytes idênticos nas demais seções. O heading `# Aula N:` é recomposto pelo server (a skill devolve só o corpo), eliminando risco de o modelo alterar a numeração.

3. **Alertas de escopo em banda, com formato extraível (`> ⚠️ ALERTA DE ESCOPO:`).**
   A skill recebe ementa e plano de ensino truncados como referência e sinaliza extrapolações em linhas com prefixo fixo; o server as remove do texto persistido (regex por prefixo) e as agrega ao relatório. Alternativa rejeitada: segunda chamada de verificação de escopo por aula — dobraria o custo para um sinal que a mesma chamada já produz.

4. **Guarda de origem do usuário.**
   Se `projeto.json.stages['plano_de_aula'].fonte === 'usuario'`, pular o realinhamento e registrar no relatório. Sobrescrever automaticamente violaria o contrato do spec `stage-import` (regenerar artefato do usuário exige confirmação). O usuário pode regenerar o plano manualmente se quiser reabsorver as melhorias.

5. **Persistência única ao final da fase.**
   As substituições seccionais acumulam em memória; `sess.planoAula` + `persistStage('plano_de_aula', ...)` uma vez — evita N gravações/exports de .docx intermediários.

6. **Falha de realinhamento não aborta o ciclo.**
   As melhorias já foram aplicadas e persistidas; erro na fase de realinhamento é reportado via SSE progress + relatório, sem `error` fatal (o usuário não perde o trabalho do ciclo).

## Risks / Trade-offs

- [Modelo altera partes da seção que não deveriam mudar (ex.: objetivos)] → Instrução explícita de manter objetivos/título/escopo + prompt recebe a seção original como base; revisão de qualidade do ciclo seguinte fiscaliza.
- [`replaceLessonBlock` com títulos duplicados ou numeração fora do padrão] → Mesmo parsing do `extractLessonBlock` já em produção; testes unitários com aula do meio, primeira, última e inexistente.
- [Conteúdo melhorado longo estoura o prompt] → Truncar conteúdo (~3000 chars) e referências (~1200), padrão `truncate()` existente.
- [Custo extra por ciclo] → 1 chamada gpt-4o-mini por aula alterada; desprezível frente às chamadas de melhoria (gpt-4o-search-preview).

## Migration Plan

Sem migração. Projetos existentes ganham o comportamento no próximo ciclo de melhorias. Rollback = revert do commit.

## Open Questions

Nenhuma — escopo e momento definidos pelo usuário (plano de aula automático; ementa/plano de ensino apenas sinalizados).
