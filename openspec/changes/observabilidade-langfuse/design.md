## Context

O projeto proíbe dependência npm nova. O Langfuse expõe API pública de ingestão em lote; os detalhes exatos devem ser confirmados na Fase 0 (a documentação não foi consultada na análise). Nenhum ponto central existe hoje para chamadas à OpenAI: há `openai.chat.completions.create` espalhado por `server.js`.

## Goals / Non-Goals

**Goals:** 100% das chamadas OpenAI como `generation` com tokens e custo; zero impacto na geração se o Langfuse cair.
**Non-Goals:** trava de orçamento; painéis customizados no app.

## Decisions

- **D1**: `chamarOpenAI(tipo, params, ctx)` em `server.js` (ou `observabilidade.js`) é o único ponto de chamada; teste estático (`grep`-like em Jest) falha se `openai.` ocorrer fora dele.
- **D2**: fila em memória (limite 1000 eventos, descarta os mais antigos), lote a cada 5 s ou 50 eventos, timeout 3 s, `process.on('SIGTERM'|'beforeExit')` faz flush.
- **D3**: `traceId` = id da requisição (também no logger estruturado e nos eventos SSE).
- **D4**: amostragem por `LANGFUSE_SAMPLE_RATE`, sempre 100% de falhas e aulas incompletas.
- **D5**: mascaramento por regex (e-mail, tokens `sk-…`, `Bearer …`) antes de enfileirar.
- **D6**: tabela de preços em `config/precos-modelos.json`; teste confere custo do app = custo calculado do `usage`.

## Risks / Trade-offs

- Conteúdo de curso em serviço externo → padrão `metadados`, auto-hospedagem opcional.
- Instrumentação lenta → fila assíncrona, timeout curto, chave para desligar.
- Preços desatualizados → tabela configurável com data de vigência.
