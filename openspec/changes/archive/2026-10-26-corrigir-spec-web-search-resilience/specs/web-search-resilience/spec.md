## MODIFIED Requirements

### Requirement: Timeout na chamada de pesquisa web
O sistema SHALL abortar a chamada de pesquisa web se ela não concluir dentro de **90 segundos** na primeira tentativa. O timeout SHALL ser implementado via `AbortSignal` passado ao SDK OpenAI, cancelando efetivamente a requisição HTTP. A busca SHALL usar a Responses API com a ferramenta `web_search` e o modelo definido em `OPENAI_RESEARCH_MODEL` (padrão `gpt-4o`, lido por `skills.modeloPesquisa()`); os modelos `*-search-preview` estão descontinuados.

#### Scenario: Timeout acionado na primeira tentativa
- **WHEN** a chamada de pesquisa web demora mais de 90 segundos sem resposta
- **THEN** a chamada é abortada, um evento `progress` com a mensagem `Reconectando...` é enviado via SSE e o sistema inicia a retentativa automaticamente

#### Scenario: Chamada concluída dentro do timeout
- **WHEN** o modelo responde em menos de 90 segundos
- **THEN** o fluxo normal continua sem nenhuma alteração de comportamento

### Requirement: Retry automático após falha transitória
O sistema SHALL repetir a mesma consulta de pesquisa web até **2 vezes** (`PESQUISA_MAX_RETENTATIVAS`), cada retentativa com timeout de **60 segundos**, quando a tentativa anterior falhar por razão transitória: timeout, erro de rede, rate limit (HTTP 429) ou erro de servidor (HTTP ≥ 500). Erro de autenticação (HTTP 401) e requisição inválida (HTTP 400) SHALL NOT acionar retry. O HTTP 400 SHALL ser tratado como configuração de pesquisa inválida, com mensagem que orienta a verificar `OPENAI_RESEARCH_MODEL`. As retentativas internas SHALL NOT contar como erros repetidos do disjuntor de custo.

#### Scenario: Retry bem-sucedido após timeout
- **WHEN** a primeira chamada expira por timeout e uma retentativa retorna resultado dentro de 60 segundos
- **THEN** a consulta conclui normalmente com o resultado da retentativa

#### Scenario: Retentativas esgotadas
- **WHEN** a primeira tentativa e as 2 retentativas falham por razão transitória
- **THEN** o último erro é propagado e a consulta é tratada como falha de pesquisa

#### Scenario: Retry não acionado para erro de autenticação
- **WHEN** a chamada retorna HTTP 401 (chave inválida ou sem permissão)
- **THEN** o sistema envia um evento `error` via SSE imediatamente, sem retry, preservando os dados da sessão

#### Scenario: Retry não acionado para requisição inválida
- **WHEN** a chamada retorna HTTP 400
- **THEN** o sistema envia um evento `error` via SSE imediatamente, sem retry e sem fallback automático, com a mensagem de configuração de pesquisa inválida

### Requirement: Orientação ao usuário após falha total na pesquisa
Quando a Etapa 2 falha com evento `error`, o frontend SHALL exibir no log panel uma mensagem de orientação informando que a pesquisa pode ser tentada novamente ou pulada e SHALL reabilitar o botão "Pesquisar". Se o evento trouxer `semPesquisaDisponivel`, o frontend SHALL oferecer os botões "Tentar novamente" e "Continuar sem pesquisa web".

#### Scenario: Mensagem de orientação exibida após erro
- **WHEN** o evento `error` é recebido no SSE da Etapa 2 e o callback `onError` é chamado
- **THEN** o log panel exibe a mensagem `"💡 Tente novamente ou avance para a Etapa 3 — a pesquisa pode ser pulada."` após a mensagem de erro, e o botão "Pesquisar" é reabilitado

#### Scenario: Decisão oferecida quando o fallback é possível
- **WHEN** o evento `error` traz `semPesquisaDisponivel: true`
- **THEN** o frontend mostra "Tentar novamente" e "Continuar sem pesquisa web"

#### Scenario: Chave inválida não oferece fallback
- **WHEN** a falha é de autenticação (HTTP 401)
- **THEN** `semPesquisaDisponivel` é `false` e o botão "Continuar sem pesquisa web" não aparece

## REMOVED Requirements

### Requirement: Fallback sem web search após falha persistente
**Reason**: O fallback automático para `gpt-4o-mini` após as retentativas escondia a falha de busca e gravava texto de memória como se fosse pesquisa. A change `pesquisa-web-real` o substituiu por decisão explícita do usuário.
**Migration**: Ver `web-research`, requisito "Fallback somente por decisão explícita", e o requisito "Falha persistente não grava pesquisa" desta capability.

## ADDED Requirements

### Requirement: Falha persistente não grava pesquisa
Quando as retentativas se esgotam, ou a resposta não traz fontes suficientes, o sistema SHALL emitir `error` com `status: 'falhou'` e SHALL NOT gravar `pesquisa.txt`, `pesquisa.docx` nem `pesquisa.json`. O fallback para o conhecimento do modelo (`gpt-4o-mini`, sem `web_search`) SHALL rodar somente quando o usuário pedir explicitamente (`semBusca=1`), com um `progress` de aviso antes de iniciar, timeout de **30 segundos** via `AbortSignal` e persistência por `persistStage` com o selo "sem pesquisa web". Nesse caso nenhum evento `site` é enviado.

#### Scenario: Falha não grava nada
- **WHEN** a primeira tentativa e as retentativas falham por razão transitória
- **THEN** o sistema envia `error` com `status: 'falhou'`, nenhum arquivo de pesquisa é gravado e os dados das etapas anteriores permanecem intactos

#### Scenario: Usuário escolhe continuar sem pesquisa
- **WHEN** o usuário aciona "Continuar sem pesquisa web"
- **THEN** o sistema envia um `progress` `⚠️ Gerando a partir do conhecimento do modelo (sem pesquisa web)...`, gera o texto sem `web_search`, grava com selo e envia `done` com `status: 'sem_web'`

#### Scenario: Fallback também falha
- **WHEN** a chamada do fallback excede 30 segundos ou falha com erro de rede
- **THEN** o sistema envia `error` e encerra, sem loop infinito

#### Scenario: Nenhum site no fallback
- **WHEN** o fallback é usado
- **THEN** nenhum evento `site` é enviado e o painel de fontes da web fica vazio
