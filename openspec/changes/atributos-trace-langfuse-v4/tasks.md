## 1. Fundamentos do OTLP (observabilidade.js)

- [ ] 1.1 `atributo()`: arrays de escalares viram `arrayValue` (strings, números, booleanos); array vazio é omitido; objetos continuam como JSON em `stringValue`
- [ ] 1.2 `lerConfig`: `environment` (de `LANGFUSE_ENVIRONMENT`, validado: minúsculas/dígitos/`-`/`_`, até 40 caracteres, sem prefixo `langfuse`; inválido → `default` + aviso único) e `release` (versão do `package.json`, omitido se a leitura falhar)

## 2. Propagação dos atributos de trace

- [ ] 2.1 Helper `atributosDeTrace(ctx)`: `langfuse.trace.name`, `langfuse.session.id` (omitido se vazio), `langfuse.trace.tags` (`etapa:<etapa>`, `captura:<modo>`), `langfuse.trace.metadata.etapa`, `langfuse.environment`, `langfuse.release`; lê o `sessionId` na criação do span
- [ ] 2.2 Aplicar o helper em `registrarGeneration` e `registrarSpan` e reaproveitá-lo em `finalizarContexto` (raiz e filhos com valores idênticos)
- [ ] 2.3 Manter só no raiz `tokens_total`, `custo_usd` e `ctx.traceMeta` (`definirMetadadoTrace`); nenhum span é reenviado
- [ ] 2.4 Envolver a montagem em `try/catch`: exceção vira aviso e o span é descartado, sem afetar a geração
- [ ] 2.5 Garantir que nenhum atributo de trace leva `user.id`, `trace.input`/`output`, caminho, e-mail ou segredo (reaproveitar `mascarar` nos valores textuais)

## 3. Scores e link do trace

- [ ] 3.1 `registrarScore`: enviar `observationId = ctx.rootSpanId` junto com `traceId`; em HTTP 4xx, reenviar uma vez só com `traceId` e avisar
- [ ] 3.2 `urlTrace`: manter `{host}/trace/{traceId}` e, se a verificação 4.3 mostrar que não resolve no v4, usar `{host}/project/{projectId}/traces/{traceId}` com `projectId` obtido uma vez em `GET /api/public/projects` (cache em memória; falha cai no formato anterior)

## 4. Verificação com o Langfuse real

- [ ] 4.1 Com o Langfuse 4.70 ligado e as chaves do `.env`, gerar a metodologia e a ementa e listar `GET /api/public/v2/observations`: toda observação do trace tem `sessionId`, nome de trace, ambiente e release preenchidos
- [ ] 4.2 Enviar um score com `observationId` do raiz e confirmar que aparece na tela de scores; se o Langfuse rejeitar, confirmar o plano B (só `traceId`)
- [ ] 4.3 Abrir o link do trace (`urlTrace`) no navegador; se não abrir o trace, aplicar a tarefa 3.2
- [ ] 4.4 Na tela Observations, filtrar por sessão (`teste-langfuse`) e por ambiente e confirmar que as `generation` aparecem

## 5. Configuração e documentação

- [ ] 5.1 `.env.example`: `LANGFUSE_ENVIRONMENT`
- [ ] 5.2 `docs/langfuse-autohospedado.md`: tela Observations no v4, atributos que ficam só no raiz, ambientes, e o aviso de que eventos antigos continuam em `default`
- [ ] 5.3 `PROJECT.md`: citar `langfuse-trace-attributes` onde a observabilidade é descrita (contagem de capabilities canônicas ao arquivar)

## 6. Testes (última etapa)

- [ ] 6.1 `tests/unit/observabilidade.test.js`: `atributo()` com array; `lerConfig` com ambiente válido, inválido e ausente; release; tags em `arrayValue`
- [ ] 6.2 `tests/integration/observabilidade.test.js`: capturar o corpo OTLP e conferir que **todo** span do lote tem os seis atributos de trace com valores iguais; `spanId` único; metadados finais só no raiz; ausência de `user.id`/`trace.input`/`trace.output`; sessão omitida quando vazia
- [ ] 6.3 Score com `observationId` e reenvio sem ele em HTTP 4xx; link do trace com e sem `projectId`
- [ ] 6.4 Exceção na montagem de atributos não afeta o retorno da chamada ao LLM
- [ ] 6.5 `tests/setup-env.js`: `LANGFUSE_ENVIRONMENT=teste`; `npm test` verde e `npm run test:coverage` acima do gate; `openspec validate --all`
