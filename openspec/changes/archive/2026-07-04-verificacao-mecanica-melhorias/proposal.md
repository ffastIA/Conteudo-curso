# Proposal: verificacao-mecanica-melhorias

## Why

Investigação em produção (curso "Capcut Oficina") e reprodução controlada contra a API real mostraram que a seção `### Melhorias Aplicadas`, **autorrelatada pelo próprio modelo**, não é confiável: em dois testes independentes (com `gpt-4o-search-preview` e com `gpt-4o-mini`), o modelo declarou ter aplicado melhorias que **não aconteceram no texto de fato**. O caso mais claro: pedimos para **resumir** uma seção e o `gpt-4o-mini` a **alongou**, ainda assim declarando "Resumiu e reestruturou... contextualização mais clara". Outro caso: pediu-se para incorporar referências à BNCC — nenhuma menção a "BNCC" apareceu em lugar nenhum do texto, mas foi declarado "incorporado". Trocar de modelo não resolveu — o comportamento de auto-avaliação otimista atravessa modelos diferentes da OpenAI.

Como o sistema hoje só exibe a declaração do modelo no relatório, o revisor humano não tem sinal de que uma "melhoria aplicada" pode ser cosmética ou inexistente — só descobre relendo o conteúdo manualmente ou, como neste caso, após vários ciclos em que a mesma observação de qualidade não desaparece.

## What Changes

- `mergeSecoesConteudo` (aplicação de melhorias no conteúdo) passa a computar, para cada seção **substituída** (não para seções novas), a similaridade (Jaccard, `textSimilarity` já existente) entre o texto antigo da seção e o texto novo. Seções com similaridade ≥ 0.85 são sinalizadas como suspeitas.
- O mesmo cálculo é aplicado no realinhamento de plano de aula (comparando a seção do plano antes/depois de `replaceLessonBlock`).
- Nova checagem por palavra-chave: quando uma melhoria menciona um termo entre aspas (ex.: `"Círculo de Histórias"`) ou uma sigla em maiúsculas (ex.: `BNCC`), o sistema verifica se esse termo aparece literalmente (tolerante a acento/caixa) no conteúdo final da aula OU no plano de aula atualizado; se não aparecer em nenhum dos dois, sinaliza a melhoria como "termo esperado ausente".
- Relatório de melhorias (`melhorias_aplicadas_<timestamp>.docx`) ganha uma seção final `## Verificação Automática — Possíveis Inconsistências`, agregando os dois tipos de sinalização de todas as aulas do ciclo — distinta e adicional à seção `### Melhorias Aplicadas` autorrelatada pelo modelo, nunca a substituindo.
- Nenhuma tentativa automática de correção é feita — a verificação é só informativa, para o revisor humano decidir se vale um novo ciclo ou edição manual.

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `improvement-application-cycle`: o ciclo de melhorias passa a incluir uma camada de verificação mecânica e independente da autoavaliação do modelo, tanto para o conteúdo quanto para o plano de aula.

## Non-goals

- Não corrige automaticamente uma melhoria sinalizada como suspeita (sem nova chamada de correção/retry nesta mudança — fica como possível iteração futura).
- Não altera o modelo usado em `aplicarMelhoriasSkill`/`realinharPlanoAulaSkill` (o teste empírico mostrou que troca de modelo não resolve a causa).
- Não tenta verificar semanticamente a qualidade da mudança (ex.: "o resumo ficou bom?") — só detecta ausência mecânica de mudança ou ausência de termo esperado, sinais objetivos e baratos.
- Não se aplica a outras etapas do pipeline (ementa, plano de ensino, conteúdo inicial) — escopo é o ciclo de melhorias, onde a evidência foi coletada.

## Impact

- **Evidência empírica** (documentada em design.md): calibração de limiar com 3 casos reais/reproduzidos — seção idêntica declarada como mudada (similaridade 1.000), seção alongada declarada como "resumida" (0.931), reescrita genuína de controle (0.431). Limiar de 0.85 separa os dois grupos com folga.
- **Código**: `server.js` (`mergeSecoesConteudo` — retorno estendido; loop de melhorias e de realinhamento — captura das seções antigas para comparação; nova função de checagem de termos; montagem da seção de verificação no relatório).
- **Custo**: zero chamadas de API adicionais — toda a verificação é local/determinística, reaproveitando `textSimilarity` já existente.
- **Testes**: unitários da extensão de `mergeSecoesConteudo` (retorno de suspeitas) e da checagem de termos (aspas, siglas, ausência em conteúdo e plano, presença em qualquer um dos dois não sinaliza).
