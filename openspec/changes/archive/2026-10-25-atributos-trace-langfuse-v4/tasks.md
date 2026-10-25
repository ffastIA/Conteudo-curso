## 1. Fundamentos do OTLP (observabilidade.js)

- [x] 1.1 `atributo()`: arrays de escalares viram `arrayValue` (strings, números, booleanos); array vazio é omitido; objetos continuam como JSON em `stringValue`
- [x] 1.2 `lerConfig`: `environment` (de `LANGFUSE_ENVIRONMENT`, validado: minúsculas/dígitos/`-`/`_`, até 40 caracteres, sem prefixo `langfuse`; inválido → `default` + aviso único) e `release` (versão do `package.json`, omitido se a leitura falhar)

## 2. Propagação dos atributos de trace

- [x] 2.1 Helper `atributosDeTrace(ctx)`: `langfuse.trace.name`, `langfuse.session.id` (omitido se vazio), `langfuse.trace.tags` (`etapa:<etapa>`, `captura:<modo>`), `langfuse.trace.metadata.etapa`, `langfuse.environment`, `langfuse.release`; lê o `sessionId` na criação do span
- [x] 2.2 Aplicar o helper em `registrarGeneration` e `registrarSpan` e reaproveitá-lo em `finalizarContexto` (raiz e filhos com valores idênticos)
- [x] 2.3 Manter só no raiz `tokens_total`, `custo_usd` e `ctx.traceMeta` (`definirMetadadoTrace`); nenhum span é reenviado
- [x] 2.4 Envolver a montagem em `try/catch`: exceção vira aviso e o span é descartado, sem afetar a geração
- [x] 2.4b `server.js`: com o curso sem nome, `sessionId` do contexto vira `sessao-` + 12 hex do SHA-256 do cookie (o cookie nunca é enviado)
- [x] 2.5 Garantir que nenhum atributo de trace leva `user.id`, `trace.input`/`output`, caminho, e-mail ou segredo (reaproveitar `mascarar` nos valores textuais)

## 3. Scores e link do trace

- [x] 3.1 `registrarScore`: enviar `observationId = ctx.rootSpanId` junto com `traceId`; em HTTP 4xx, reenviar uma vez só com `traceId` e avisar
- [x] 3.2 `urlTrace`: manter `{host}/trace/{traceId}` e, se a verificação 4.3 mostrar que não resolve no v4, usar `{host}/project/{projectId}/traces/{traceId}` com `projectId` obtido uma vez em `GET /api/public/projects` (cache em memória; falha cai no formato anterior)

## 4. Verificação com o Langfuse real

- [x] 4.1 Com o Langfuse 4.70 ligado e as chaves do `.env`, gerar a metodologia e a ementa e listar `GET /api/public/v2/observations`: toda observação do trace tem `sessionId`, nome de trace, ambiente e release preenchidos
- [x] 4.2 Enviar um score com `observationId` do raiz e confirmar que aparece na tela de scores; se o Langfuse rejeitar, confirmar o plano B (só `traceId`) — verificado: HTTP 200 com `observationId` existente e inexistente; plano B fica só como proteção
- [x] 4.3 Abrir o link do trace (`urlTrace`) no navegador; se não abrir o trace, aplicar a tarefa 3.2 — verificado: o formato antigo falha ("Rastreamento não encontrado"); o formato com o projeto abre o trace
- [x] 4.4 Na tela Observations, filtrar por sessão (`Teste_Langfuse`) e por ambiente e confirmar que as `generation` aparecem — verificado na tela (coluna "Nome do traço" preenchida nas `generation` novas e vazia nas anteriores) e no ClickHouse (`trace_name`, `release`, `tags`, `session_id` e `environment` iguais em raiz e filhas)

## 5. Configuração e documentação

- [x] 5.1 `.env.example`: `LANGFUSE_ENVIRONMENT`
- [x] 5.2 `docs/langfuse-autohospedado.md`: tela Observations no v4, atributos que ficam só no raiz, ambientes, e o aviso de que eventos antigos continuam em `default`
- [x] 5.3 `PROJECT.md`: citar `langfuse-trace-attributes` onde a observabilidade é descrita (contagem de capabilities canônicas ao arquivar)

## 6. Testes (última etapa)

- [x] 6.1 `tests/unit/observabilidade.test.js`: `atributo()` com array; `lerConfig` com ambiente válido, inválido e ausente; release; tags em `arrayValue`
- [x] 6.2 `tests/integration/observabilidade.test.js`: capturar o corpo OTLP e conferir que **todo** span do lote tem os seis atributos de trace com valores iguais; `spanId` único; metadados finais só no raiz; ausência de `user.id`/`trace.input`/`trace.output`; sessão omitida quando vazia
- [x] 6.3 Score com `observationId` e reenvio sem ele em HTTP 4xx; link do trace com e sem `projectId`
- [x] 6.4 Exceção na montagem de atributos não afeta o retorno da chamada ao LLM
- [x] 6.5 `tests/setup-env.js`: `LANGFUSE_ENVIRONMENT=teste`; `npm test` verde e `npm run test:coverage` acima do gate; `openspec validate --all`
