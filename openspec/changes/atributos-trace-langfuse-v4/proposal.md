## Why

O Langfuse instalado é o **v4.70 em modo `events_only`**. Nele não existe entidade "trace" ingerida: tudo é consultado como **observações**, e um atributo de trace que só existe no span raiz **não aparece** ao filtrar ou agregar os filhos. A documentação oficial de migração ao v4 manda copiar `langfuse.session.id`, `langfuse.trace.name`, `langfuse.trace.tags`, `langfuse.trace.metadata.<chave>`, `langfuse.environment`, `langfuse.release` e `langfuse.version` para **cada span** ([migration-to-v4](https://langfuse.com/integrations/native/opentelemetry/migration-to-v4.md)).

O `observabilidade.js` foi escrito para o modelo v3: `finalizarContexto` põe nome do trace, sessão e metadados **só no span raiz**, e as `generation`/spans filhos levam apenas `langfuse.observation.metadata.*`. Evidência medida em 2026-10-25, listando `GET /api/public/v2/observations` do próprio Langfuse:

- o span raiz `ementa`/`search`/`metodologia` traz `sessionId = "Obsevabilidade"`;
- todas as `GENERATION` filhas (`metodologia.gerar`, `ementa.gerar`, `pesquisa.web`) trazem `sessionId = ""` e `traceName` vazio.

Consequência prática: na tela **Observations** do v4 (a principal), filtrar por sessão/curso, nome de etapa ou ambiente **não encontra as chamadas ao LLM**, que são exatamente o que carrega custo e tokens. O mesmo vale para os scores e para a leitura por agentes. Há ainda dois efeitos laterais: não há `langfuse.environment`, então a suíte de testes e o uso real se misturam no mesmo ambiente `default` (o que já poluiu o dashboard), e `atributo()` serializa arrays como JSON em texto, o que impede enviar `langfuse.trace.tags`.

O plano `Implementacoes231016.pdf` (Fase 1B.2) já pede "sessionId igual à sessão do projeto" e "metadados padrão **em tudo**", mas escreveu isso antes de a documentação do v4 ter sido consultada (o próprio PDF admite que os detalhes da API deviam ser confirmados). Esta change fecha essa lacuna.

## What Changes

- **Propagação de atributos de trace a todos os spans**: toda `generation` e todo span filho passam a levar `langfuse.trace.name`, `langfuse.session.id`, `langfuse.trace.tags`, `langfuse.trace.metadata.etapa`, `langfuse.environment` e `langfuse.release`, com os mesmos valores do span raiz.
- **Separação entre o que é conhecido no início e no fim da operação**: os atributos acima são fixados quando o span é criado. Valores só conhecidos ao final (`tokens_total`, `custo_usd`, `custo_heygen_usd` e os metadados definidos por `definirMetadadoTrace`) continuam **apenas no span raiz**, porque reexportar um span já enviado duplica observações no v4.
- **Suporte a arrays no OTLP** (`arrayValue`) em `atributo()`, necessário para `langfuse.trace.tags`.
- **Ambiente e release**: nova variável `LANGFUSE_ENVIRONMENT` (valida o formato do Langfuse; padrão `default`) e `langfuse.release` com a versão do `package.json`. A suíte de testes passa a usar ambiente próprio.
- **Scores ligados à observação raiz**: o `POST /api/public/scores` passa a enviar também `observationId` (id do span raiz), além de `traceId`.
- **Link do trace** (`urlTrace`) validado contra o v4 e, se necessário, trocado pela URL com o id do projeto.
- **Verificação com o Langfuse real** e documentação das limitações (o que fica só no raiz).

## Capabilities

### New Capabilities
- `langfuse-trace-attributes`: quais atributos de trace são enviados, em quais spans, em que formato, e o que NUNCA é enviado (usuário, dados pessoais).

### Modified Capabilities
- Nenhuma. A capability `llm-observability` ainda é uma proposta da change `observabilidade-langfuse` (ainda não arquivada); esta change não a altera, apenas a complementa.

## Impact

- **`observabilidade.js`**: `atributo()` (arrays), `lerConfig` (`environment`, `release`), novo helper de atributos de trace aplicado em `registrarGeneration` e `registrarSpan` e reaproveitado em `finalizarContexto`, `registrarScore` (campo `observationId`), `urlTrace`.
- **`tests/`**: `tests/unit/observabilidade.test.js` e `tests/integration/observabilidade.test.js` (todo span do lote carrega os atributos), `tests/setup-env.js` (`LANGFUSE_ENVIRONMENT=teste`).
- **Docs**: `.env.example`, `docs/langfuse-autohospedado.md` (tela Observations, ambientes), `PROJECT.md` se citar atributos.
- Sem dependência npm nova, sem mudança em rotas ou na interface do app.

## Non-goals

- Não enviar `langfuse.user.id`/`user.id`: o sistema não tem usuários (non-goal permanente de multi-tenancy/autenticação) e nada pessoal pode sair da máquina.
- Não enviar `langfuse.trace.input`/`output` (descontinuados no v4) nem alterar o conteúdo de `input`/`output` por modo de captura.
- Não usar OTel Baggage nem SDK do OpenTelemetry: a propagação é feita pelo próprio módulo, que já controla a criação de todos os spans.
- Não implementar o hash da versão do prompt (`langfuse.version`/metadado de prompt) pedido na Fase 1B.2 do plano: fica para uma change própria.
- Não apagar nem migrar os eventos já gravados no Langfuse.
- Não mexer no dataset da linha de base (tarefa 3.2 da change `observabilidade-langfuse`).

## Gaps resolvidos

G06 (observabilidade do LLM), na parte em que a medição por etapa/sessão depende de atributos de trace corretos no Langfuse v4; e o achado de ambiente compartilhado entre testes e uso real.
