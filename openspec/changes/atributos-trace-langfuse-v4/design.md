## Context

O módulo `observabilidade.js` envia spans OTLP/HTTP JSON a `POST {host}/api/public/otel/v1/traces` (cabeçalho `x-langfuse-ingestion-version: 4`) e scores a `POST /api/public/scores`. Cada requisição `/api/*` abre um contexto (`criarContexto`) com `etapa` e um `sessionId` calculado de forma preguiçosa (slug do nome do curso, ou o id da sessão HTTP quando o curso ainda não tem nome). `registrarGeneration` e `registrarSpan` enfileiram spans filhos; `finalizarContexto` (no `res.on('close')`) enfileira o span raiz.

Hoje, só o raiz leva `langfuse.trace.name`, `langfuse.session.id` e `langfuse.trace.metadata.*`; os filhos levam `langfuse.observation.*`. No Langfuse v4 em `events_only` (versão 4.70 do ambiente do projeto), a consulta é por observação e não há herança do raiz para os filhos. A documentação oficial lista os atributos de trace que precisam ser copiados para cada span.

Restrições do projeto: sem dependência npm nova (nada de SDK nem do SDK do OpenTelemetry); a observabilidade nunca pode quebrar ou atrasar a geração; nenhum dado pessoal, caminho de pasta ou segredo sai da máquina; `LANGFUSE_CAPTURE=metadados` não envia texto.

## Goals / Non-Goals

**Goals:**
- Todo span enviado carrega os atributos de trace relevantes do v4, de modo que a tela Observations filtre as chamadas ao LLM por sessão, etapa, tag e ambiente.
- Não reexportar nenhum span (evita duplicidade no v4).
- Separar ambientes (uso real × testes) e identificar a versão do app (release).
- Manter o custo e os tokens por observação coerentes com os scores e o span raiz.

**Non-Goals:** ver `proposal.md` (usuário, input/output de trace, Baggage, hash de prompt, migração de dados).

## Decisions

### D1. Atributos de trace conhecidos na criação do span são copiados a cada span

Um helper interno `atributosDeTrace(ctx)` devolve `langfuse.trace.name` (= `ctx.etapa`), `langfuse.session.id`, `langfuse.trace.tags`, `langfuse.trace.metadata.etapa`, `langfuse.environment` e `langfuse.release`. Ele é mesclado nos atributos de `registrarGeneration`, `registrarSpan` e `finalizarContexto`, de modo que o raiz e os filhos tenham valores idênticos.

*Alternativa descartada:* OTel Baggage com um processador, como a documentação recomenda para SDKs. O app não usa o SDK do OpenTelemetry e cria todos os spans no próprio módulo; copiar atributos num ponto único é mais simples e testável, e não adiciona dependência.

### D2. O que só se conhece no fim fica só no span raiz

`tokens_total`, `custo_usd`, `custo_heygen_usd` e qualquer chave definida por `definirMetadadoTrace` continuam em `langfuse.trace.metadata.*` **somente no span raiz**, enviado no fechamento da resposta. Não dá para propagar esses valores aos filhos (já foram exportados) e reexportá-los criaria observações duplicadas.

Consequência aceita e documentada: filtrar por `custo_heygen_usd` na tabela de observações só encontra o raiz. O custo por chamada continua disponível em cada `generation` (`cost_details`), e os valores agregados seguem como scores (`heygen_consumo_usd` etc.).

### D3. `sessionId` é resolvido no momento da criação do span

O getter preguiçoso de `ctx.sessionId` é lido ao montar cada span, não no fim da requisição. Se a sessão ainda não tiver curso nomeado, vale o id da sessão HTTP, como hoje. Se não houver sessão alguma (`null`), o atributo é omitido, nunca enviado vazio.

O identificador de sessão **nunca é o cookie `sessionId`**: com o curso nomeado vale o slug do nome; antes disso vale `sessao-` mais os 12 primeiros hexadecimais do SHA-256 do cookie. (Antes desta change o cookie era enviado como sessão enquanto o curso não tinha nome.)

*Risco:* o mesmo trace pode ter spans com `session.id` diferentes se o nome do curso mudar no meio da requisição (por exemplo `/api/config`). Aceito: a rota de configuração não chama o LLM.

### D4. Tags como array OTLP

`atributo()` passa a emitir `{ arrayValue: { values: [{ stringValue }...] } }` para arrays de escalares (hoje serializa em JSON, o que o Langfuse trataria como texto). As tags enviadas são `etapa:<etapa>` e `captura:<metadados|completo>`. Objetos continuam serializados como JSON.

### D5. Ambiente e release

- `LANGFUSE_ENVIRONMENT` (opcional) define `langfuse.environment`. Só é aceito se obedecer ao formato do Langfuse: minúsculas, dígitos, `-` e `_`, até 40 caracteres e sem começar por `langfuse`. Valor inválido é ignorado com um aviso único no log, e o app envia `default`.
- `langfuse.release` recebe a versão do `package.json`. Se a leitura falhar, o atributo é omitido.
- `tests/setup-env.js` define `LANGFUSE_ENVIRONMENT=teste`. Hoje a suíte já força `LANGFUSE_ENABLED=false`; o ambiente próprio protege os testes que ligam o Langfuse com `fetch` simulado e qualquer execução manual futura.

### D6. Scores com `observationId`

`registrarScore` envia `traceId` e passa a enviar `observationId` = `ctx.rootSpanId`. O Langfuse v4 trabalha com avaliação por observação; ancorar o score na observação raiz mantém a leitura por trace e habilita a leitura por observação. O span raiz é exportado depois dos filhos e, em alguns fluxos, o score é enviado antes dele; não se sabe se o Langfuse aceita um score que referencia uma observação ainda não ingerida. Isso é **verificado com o Langfuse real** na tarefa 4.2, com plano B: se houver rejeição, reenviar só com `traceId`.

### D7. Link do trace

**Verificado em 2026-10-25 no Langfuse 4.70:** `{host}/trace/{id}` abre a página "Rastreamento não encontrado", e `{host}/project/{projectId}/traces/{id}` abre o trace com árvore, custo e scores. A troca é, portanto, necessária. A consulta ao projeto é disparada na abertura do contexto da requisição, para o primeiro link depois de reiniciar o servidor já sair no formato novo.

`urlTrace` hoje devolve `{host}/trace/{traceId}`. Na tarefa 4.3 abre-se esse link no Langfuse 4.70. Se não resolver para o trace, passa a usar `{host}/project/{projectId}/traces/{traceId}`, com o `projectId` obtido uma única vez por `GET /api/public/projects` e guardado em memória; falha nessa consulta cai de volta para o formato atual. Nada disso bloqueia a resposta ao usuário.

### D8. Compatibilidade

Os atributos novos são aditivos: um Langfuse v3 ignora o que não conhece. Nenhum campo existente é renomeado. O contrato público do módulo (`criarContexto`, `executar`, `registrarGeneration`, `registrarSpan`, `registrarScore`, `finalizarContexto`, `definirMetadadoTrace`, `urlTrace`) não muda.

## Risks / Trade-offs

- **Mais bytes por span** (6 atributos a mais por observação). Impacto pequeno frente ao lote de 50 spans; medido na tarefa de testes.
- **Divergência de valores entre raiz e filhos** se alguém definir um atributo de trace depois da criação dos filhos. Mitigação: um único helper e um teste que confere a igualdade em todos os spans de um lote.
- **Comportamento do Langfuse com `observationId` de um span ainda não ingerido.** Mitigação: verificação real e plano B (D6).
- **Metadado de trace no raiz não filtrável nos filhos.** Aceito (D2) e documentado.
- **Ambiente `teste` x `default`**: dados antigos continuam em `default`; quem filtrar por ambiente verá só os novos. Documentado no guia de autohospedagem.
