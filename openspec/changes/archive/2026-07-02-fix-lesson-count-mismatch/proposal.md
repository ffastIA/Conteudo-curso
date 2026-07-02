## Why

Um curso configurado com 40h de carga e 120min por aula deveria gerar exatamente 20 aulas (40×60÷120), mas gerou apenas 19 — confirmado no projeto real do usuário ("Capcut Básico"). A causa raiz não é o cálculo (que está correto), mas a ausência de qualquer validação depois que a IA responde: se o modelo não obedecer à instrução "exatamente N aulas" (falha conhecida de aderência numérica em LLMs, mais comum em modelos econômicos), o sistema aceita o resultado errado silenciosamente, sem log, sem aviso e sem tentar corrigir.

## What Changes

- `planLessons()` (`server.js`) passa a validar se a quantidade de aulas retornada pela IA corresponde a `numAulas` (calculado a partir de carga÷duração).
- Em caso de divergência, o sistema tenta novamente UMA vez, com um prompt reforçado que informa à IA o erro da tentativa anterior (quantas aulas vieram vs. quantas eram esperadas).
- Se a segunda tentativa também divergir, o sistema usa o resultado mais próximo do esperado entre as duas tentativas (não interrompe a geração do curso) e registra um aviso claro no log do servidor para diagnóstico.
- O usuário recebe uma mensagem de progresso visível via SSE quando uma nova tentativa é necessária.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `content-generation`: novo requisito aditivo — validação e correção automática da quantidade de aulas planejadas. Nenhum requisito existente tem seu comportamento alterado.

## Impact

- `server.js`: `planLessons()` ganha lógica de validação/retry e um parâmetro opcional `onProgress`; os dois call sites (`GET /api/plano-aula`, fallback em `GET /api/conteudo`) passam a fornecer esse callback.
- `skills.js`: `planLessonsSkill` ganha um parâmetro opcional `correcao` para reforçar o prompt na segunda tentativa.
- Nenhuma nova dependência, nenhuma mudança de contrato de API observável pelo cliente (a resposta final continua sendo `sess.aulas`, só que mais confiável).

## Non-goals

- Não garante 100% de acerto do número exato de aulas em todos os casos — após a segunda tentativa, se a IA ainda divergir, o sistema segue em frente com o resultado mais próximo em vez de bloquear a geração do curso indefinidamente.
- Não altera o cálculo de `numAulas` em si (já está correto).
- Não adiciona configuração de número de tentativas pelo usuário — fixo em 2 (original + 1 retry), suficiente para cobrir a grande maioria dos casos sem adicionar latência desproporcional.
