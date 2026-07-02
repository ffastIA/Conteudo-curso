## Context

`planLessons(sess, planoEnsinoOverride)` (`server.js:908-936`) calcula `numAulas = Math.max(1, Math.round((Number(carga) * 60) / Number(duracao)))` — este cálculo está correto e foi confirmado matematicamente exato para o caso reportado (40h ÷ 120min = 20). A função então chama `planLessonsSkill` (`skills.js:102-123`), que já instrui explicitamente a IA a retornar exatamente `numAulas` itens num JSON `{"aulas": [...]}`, via `response_format: { type: 'json_object' }` (não-streaming, `MODEL_ECONOMY`).

O problema está em `server.js:934`: `const aulas = Array.isArray(parsed.aulas) ? parsed.aulas : [];` — o código só valida que `aulas` é um array, nunca que `aulas.length === numAulas`. No caso investigado, a IA retornou 19 itens em vez de 20 (confirmado em `scr/plano_de_aula.txt` do projeto real do usuário), e o sistema seguiu em frente sem qualquer aviso ou correção.

`planLessons()` é chamada em dois pontos, ambos dentro de handlers SSE já abertos (`sseHeaders(res)` já chamado, mensagens `progress` já sendo enviadas antes da chamada): `server.js:838` (`GET /api/plano-aula`) e `server.js:1021` (fallback dentro de `GET /api/conteudo`, quando `sess.aulas` está vazio).

## Goals / Non-Goals

**Goals:**
- Detectar quando a IA não retorna exatamente `numAulas` itens.
- Corrigir automaticamente na maioria dos casos, com uma segunda tentativa informada pelo erro da primeira.
- Não bloquear a geração do curso indefinidamente se a IA persistir na divergência após a correção.
- Visibilidade: usuário vê uma mensagem de progresso quando uma correção é necessária; servidor loga o resultado final para diagnóstico.

**Non-Goals:**
- Garantia absoluta de 100% de acerto em todos os casos.
- Múltiplas tentativas além de uma segunda (retry único).
- Configuração do comportamento pelo usuário.

## Decisions

### Validação + retry único com prompt de correção

```javascript
// server.js
async function planLessons(sess, planoEnsinoOverride, onProgress = () => {}) {
  const { nome, carga, duracao, nivel, publico } = sess.config;
  const totalMinutos = Number(carga) * 60;
  const numAulas = Math.max(1, Math.round(totalMinutos / Number(duracao)));
  const planoEnsino = planoEnsinoOverride || sess.planoEnsino || readMemory(sess, 'plano_de_ensino');

  const chamarSkill = async (correcao) => {
    const skill = skills.planLessonsSkill({ nome, carga, duracao, nivel, publico, planoEnsino, numAulas, correcao });
    const completion = await openai.chat.completions.create({
      model: skill.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: skill.system },
        { role: 'user', content: skill.user }
      ]
    });
    addUsage(completion.usage);
    let parsed = {};
    try { parsed = JSON.parse(completion.choices[0]?.message?.content || '{}'); } catch { parsed = {}; }
    return Array.isArray(parsed.aulas) ? parsed.aulas : [];
  };

  let aulas = await chamarSkill();

  if (aulas.length !== numAulas && aulas.length > 0) {
    onProgress(`A IA retornou ${aulas.length} aula(s) em vez de ${numAulas}; tentando novamente...`);
    console.warn(`[planLessons] Esperado ${numAulas} aulas, recebido ${aulas.length}. Tentando novamente com prompt de correção.`);

    const retryAulas = await chamarSkill(aulas.length);
    if (retryAulas.length > 0) {
      const acertouRetry = retryAulas.length === numAulas;
      const retryMaisProximo = Math.abs(retryAulas.length - numAulas) < Math.abs(aulas.length - numAulas);
      if (acertouRetry || retryMaisProximo) aulas = retryAulas;
      if (!acertouRetry) {
        console.warn(`[planLessons] Segunda tentativa retornou ${retryAulas.length} aulas (esperado ${numAulas}). Prosseguindo com ${aulas.length} aula(s), o resultado mais próximo do esperado.`);
      }
    }
  }

  return aulas.length ? aulas : [{ titulo: nome, objetivos: 'Cobrir o conteúdo geral do curso' }];
}
```

- *Por que só 1 retry:* `planLessons` já é uma chamada rápida e barata (JSON mode, sem streaming, `MODEL_ECONOMY`) — um retry adiciona poucos segundos de latência. Mais tentativas teriam retorno decrescente: se a IA errar duas vezes seguidas com um prompt já reforçado, é mais produtivo seguir com o resultado mais próximo do que insistir indefinidamente.
- *Por que usar o resultado mais próximo, não sempre o do retry:* é possível (embora raro) que o retry piore o resultado (ex.: primeira tentativa 19, retry 17) — comparar a distância absoluta a `numAulas` entre as duas tentativas garante que o sistema sempre fica com o melhor dos dois resultados obtidos.
- *Por que não falhar/bloquear:* a geração do curso é um processo longo (múltiplas etapas subsequentes dependem de `sess.aulas`); interromper tudo por uma divergência de 1-2 aulas seria pior para o usuário do que prosseguir com um aviso.

### `planLessonsSkill`: prompt de correção reforçado na segunda tentativa

```javascript
// skills.js
const planLessonsSkill = ({ nome, carga, duracao, nivel, publico, planoEnsino, numAulas, correcao }) => ({
  model: MODEL_ECONOMY,
  system: '...' /* inalterado */,
  user:
    (correcao
      ? `IMPORTANTE: sua resposta anterior continha ${correcao} aula(s), mas o número exigido é ` +
        `exatamente ${numAulas}. Ajuste cuidadosamente a divisão do conteúdo para atingir exatamente ` +
        `${numAulas} aulas desta vez.\n\n`
      : '') +
    `Com base EXCLUSIVAMENTE no plano de ensino abaixo, divida o curso em ` +
    /* restante do prompt inalterado */
});
```

- *Por que informar o erro anterior:* simplesmente repetir a mesma pergunta sem contexto tem menor chance de correção do que explicitar "você errou, o número certo é X" — dá ao modelo um sinal direto do que precisa mudar.

### Propagação de `onProgress` nos dois call sites

```javascript
// server.js:838 (GET /api/plano-aula) — res já disponível no escopo
const aulas = await planLessons(sess, planoEnsino, msg => send(res, { type: 'progress', message: msg }));

// server.js:1021 (fallback em GET /api/conteudo) — mesmo padrão
const aulas = (sess.aulas && sess.aulas.length) ? sess.aulas : await planLessons(sess, planoEnsino, msg => send(res, { type: 'progress', message: msg }));
```

## Risks / Trade-offs

- [Risco] O retry adiciona uma chamada extra à API OpenAI apenas quando há divergência (custo/latência marginal, não no caso comum onde a IA acerta de primeira) → Aceito, é o objetivo da mudança.
- [Risco] Mesmo após o retry, a contagem pode não ficar exata em casos raros → Mitigação: log de aviso claro no servidor para diagnóstico; comportamento é estritamente melhor do que o atual (zero tentativas de correção).

## Migration Plan

Mudança isolada a uma função e sua skill associada — nenhuma migração de dados, nenhuma mudança de contrato de API. Rollback trivial: reverter o diff.
