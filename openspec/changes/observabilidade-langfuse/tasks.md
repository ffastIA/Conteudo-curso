## 1. Confirmação e módulo (observabilidade.js)

- [x] 1.1 Confirmar a API do Langfuse: ingestão em lote obsoleta → OTLP/HTTP JSON (registrado em design.md e docs/langfuse-autohospedado.md)
- [x] 1.2 Criar `observabilidade.js`: fila em memória, lote, timeout, flush no encerramento, mascaramento, amostragem
- [x] 1.3 Variáveis `LANGFUSE_*` em `.env.example`; desligado sem chaves

## 2. Instrumentação (server.js)

- [x] 2.1 Wrapper `chamarOpenAI` como único ponto de chamada (incluindo pesquisa web e continuações)
- [x] 2.2 Trace por operação (sessionId, traceId = id da requisição) e spans por etapa/módulo/aula/seção
- [x] 2.3 Spans para Gamma, HeyGen e downloads
- [x] 2.4 `config/precos-modelos.json` e cálculo de custo; `traceId` e custo em `geracao_log.json`

## 3. Qualidade e UI

- [x] 3.1 Enviar scores (critérios da rubrica, determinístico, nota da aula e score do gate de melhorias; fundamentação e completude entram com as changes 5 a 7)
- [ ] 3.2 Dataset da linha de base no Langfuse (script `scripts/langfuse-dataset.js` pronto e linha de base gerada; falta enviar a um Langfuse em execução)
- [x] 3.3 `public/app.js`: custo ao fim da etapa e link do trace

## 4. Testes (última etapa)

- [x] 4.1 Toda chamada gera generation com tokens/custo/finish_reason; teste estático proíbe chamada fora do wrapper
- [x] 4.2 Langfuse fora do ar ou lento não falha nem atrasa; modo metadados não envia texto; mascaramento; chaves ausentes do payload; flush no encerramento; custo do app = custo do usage
- [x] 4.3 `npm test` verde e `openspec validate --all`
