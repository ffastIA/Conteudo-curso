## 1. Confirmação e módulo (observabilidade.js)

- [ ] 1.1 Confirmar a API de ingestão do Langfuse (endpoint, auth, formato de batch) e registrar em `docs/decisoes/`
- [ ] 1.2 Criar `observabilidade.js`: fila em memória, lote, timeout, flush no encerramento, mascaramento, amostragem
- [ ] 1.3 Variáveis `LANGFUSE_*` em `.env.example`; desligado sem chaves

## 2. Instrumentação (server.js)

- [ ] 2.1 Wrapper `chamarOpenAI` como único ponto de chamada (incluindo pesquisa web e continuações)
- [ ] 2.2 Trace por operação (sessionId, traceId = id da requisição) e spans por etapa/módulo/aula/seção
- [ ] 2.3 Spans para Gamma, HeyGen e downloads
- [ ] 2.4 `config/precos-modelos.json` e cálculo de custo; `traceId` e custo em `geracao_log.json`

## 3. Qualidade e UI

- [ ] 3.1 Enviar scores (critérios, determinístico, fundamentação, completude)
- [ ] 3.2 Dataset da linha de base no Langfuse e relatório comparável
- [ ] 3.3 `public/app.js`: custo ao fim da etapa e link do trace

## 4. Testes (última etapa)

- [ ] 4.1 Toda chamada gera generation com tokens/custo/finish_reason; teste estático proíbe chamada fora do wrapper
- [ ] 4.2 Langfuse fora do ar ou lento não falha nem atrasa; modo metadados não envia texto; mascaramento; chaves ausentes do payload; flush no encerramento; custo do app = custo do usage
- [ ] 4.3 `npm test` verde e `openspec validate --all`
