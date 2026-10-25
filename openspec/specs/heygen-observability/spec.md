# heygen-observability Specification

## Purpose
TBD - created by archiving change observabilidade-heygen. Update Purpose after archive.
## Requirements
### Requirement: Leitura do saldo da carteira HeyGen
O sistema SHALL ler o saldo da carteira HeyGen em `GET /v3/users/me` e expô-lo em `GET /api/heygen/saldo` com os campos `disponivel`, `saldoUsd`, `moeda`, `tipoCobranca` e `recargaAutomatica`. A leitura SHALL ter timeout e SHALL NOT lançar erro: qualquer falha resulta em `disponivel: false` com um motivo. A resposta SHALL NOT conter e-mail, nome de usuário ou a chave de API.

#### Scenario: Conta com carteira
- **WHEN** o HeyGen responde `billing_type: "wallet"` e `wallet.remaining_balance: 7.45` em `usd`
- **THEN** `GET /api/heygen/saldo` devolve `disponivel: true`, `saldoUsd: 7.45`, `moeda: "usd"` e `recargaAutomatica` conforme `wallet.auto_reload.enabled`

#### Scenario: Dados pessoais não vazam
- **WHEN** a resposta do HeyGen contém `email` e `username`
- **THEN** o JSON de `/api/heygen/saldo` não contém esses campos

#### Scenario: Conta que não é carteira
- **WHEN** `billing_type` não é `wallet` ou `wallet.remaining_balance` não é numérico
- **THEN** a resposta é `disponivel: false` com o motivo, sem erro HTTP

#### Scenario: Falha de rede ou chave inválida
- **WHEN** a chamada ao HeyGen falha por timeout, rede ou HTTP 401
- **THEN** a resposta é `disponivel: false` com o motivo, e nenhuma geração é interrompida

#### Scenario: Chave ausente
- **WHEN** `HEYGEN_API_KEY` não está definida
- **THEN** `GET /api/heygen/saldo` devolve `disponivel: false` sem chamar o HeyGen

### Requirement: Saldo antes da geração do vídeo
Na tela de geração do vídeo (Etapa 10) o sistema SHALL exibir o saldo atual da carteira HeyGen antes de o usuário enviar o roteiro, com opção de atualizar. Ao iniciar a geração, o servidor SHALL ler o saldo novamente imediatamente antes de criar o vídeo e usar esse valor como saldo inicial, informando-o por evento SSE.

#### Scenario: Saldo visível antes de gerar
- **WHEN** o usuário abre a Etapa 10 com o avatar e a voz configurados
- **THEN** a tela mostra "Saldo HeyGen: US$ 7,45" antes do botão de envio

#### Scenario: Saldo inicial medido no servidor
- **WHEN** o usuário clica em "Enviar ao HeyGen e gerar vídeo"
- **THEN** o servidor lê o saldo imediatamente antes de `POST /v3/videos`, emite o evento `saldo-heygen` com `fase: "inicial"` e grava o valor no registro da geração pendente

#### Scenario: Saldo indisponível não impede a geração
- **WHEN** a leitura do saldo falha ou a conta não é carteira
- **THEN** a tela mostra "saldo indisponível" e a geração do vídeo continua normalmente, com o consumo marcado como não apurado

#### Scenario: Alertas
- **WHEN** o saldo está abaixo de `HEYGEN_SALDO_ALERTA_USD` ou a recarga automática está desligada
- **THEN** a tela mostra um aviso, e o botão de envio continua habilitado

### Requirement: Consumo do vídeo pela diferença de saldo
Depois que o vídeo é gerado e baixado, o sistema SHALL ler o saldo final e calcular `consumoUsd = saldoInicialUsd − saldoFinalUsd`, arredondado a 4 casas decimais. Se a diferença não for positiva, o sistema SHALL repetir a leitura até `HEYGEN_SALDO_TENTATIVAS` vezes, espaçadas por `HEYGEN_SALDO_ESPERA_MS`; persistindo, SHALL registrar o consumo como não apurado em vez de zero.

#### Scenario: Consumo calculado
- **WHEN** o saldo inicial é 7.45 e, após o vídeo, o saldo final é 6.95
- **THEN** o consumo é 0.5000, e o evento final `done` traz `saldoInicialUsd`, `saldoFinalUsd` e `consumoUsd`

#### Scenario: Cobrança ainda não refletida
- **WHEN** a primeira leitura final devolve o mesmo saldo inicial e uma leitura seguinte devolve um saldo menor
- **THEN** o consumo é calculado com a leitura em que o saldo baixou

#### Scenario: Consumo não apurado
- **WHEN** todas as leituras finais devolvem saldo igual ou maior que o inicial
- **THEN** o consumo é registrado com `apurado: false` e a tela informa que o consumo ainda não foi refletido no saldo, sem exibir "0"

#### Scenario: Retomada sem saldo inicial
- **WHEN** a geração é retomada a partir de um `videoId` pendente sem `saldoInicialUsd` registrado
- **THEN** o consumo fica `apurado: false` com o motivo "saldo inicial desconhecido", e o saldo atual não é usado como inicial

#### Scenario: Saldo final indisponível
- **WHEN** a leitura do saldo final falha depois do vídeo pronto
- **THEN** o vídeo é entregue normalmente e o consumo fica `apurado: false`

### Requirement: Consumo exibido e persistido por vídeo e por projeto
A interface SHALL mostrar, ao fim de cada vídeo, o saldo inicial, o saldo final atualizado e o consumo, rotulado como "medido pela diferença de saldo da carteira". O sistema SHALL persistir esses valores em `videosAvatarGerados[].heygen` e acumular `custoHeygenUsd` por projeto em `projeto.json`, separado de `custoProjetoUsd`, restaurando ambos ao carregar o projeto.

#### Scenario: Resultado na tela
- **WHEN** o vídeo da aula 2 termina com consumo apurado de 0.5000
- **THEN** a tela mostra saldo inicial, saldo final, "Consumo do vídeo: US$ 0,50" e o saldo atualizado da carteira

#### Scenario: Total do projeto
- **WHEN** dois vídeos do projeto têm consumo apurado de 0.5000 e 0.4200
- **THEN** `custoHeygenUsd` é 0.9200 e aparece na tela como total HeyGen do projeto, sem ser somado a `custoProjetoUsd`

#### Scenario: Projeto recarregado
- **WHEN** o usuário carrega um projeto salvo com vídeos gerados
- **THEN** o consumo de cada vídeo e `custoHeygenUsd` voltam a ser exibidos

#### Scenario: Consumo não apurado não soma
- **WHEN** um vídeo tem `apurado: false`
- **THEN** ele não entra em `custoHeygenUsd`

### Requirement: Atualização manual do saldo
A tela de geração do vídeo SHALL ter um botão "Atualizar saldo" que relê o saldo da carteira HeyGen sob demanda via `POST /api/heygen/saldo/atualizar`, informa o horário da leitura e SHALL aceitar uma leitura a cada 3 segundos. Quando um vídeo tem o consumo não apurado, a atualização manual SHALL tentar completar a apuração daquele vídeo se o saldo lido for menor que o saldo inicial registrado.

#### Scenario: Atualizar o saldo exibido
- **WHEN** o usuário clica em "Atualizar saldo" antes de gerar um vídeo
- **THEN** o painel mostra o saldo lido agora e "atualizado às HH:MM:SS"; se a leitura falhar, mostra o motivo e mantém o botão utilizável

#### Scenario: Apuração completada manualmente
- **WHEN** um vídeo está com consumo não apurado, o saldo inicial era 7.45 e, ao clicar em "Atualizar saldo", o saldo lido é 6.95
- **THEN** o sistema grava `saldoFinalUsd: 6.95`, `consumoUsd: 0.5`, `apurado: true` e `origem: "manual"`, soma o consumo em `custoHeygenUsd`, salva o projeto e mostra o consumo na tela

#### Scenario: Saldo ainda não baixou
- **WHEN** o usuário clica em "Atualizar saldo" para um vídeo não apurado e o saldo lido ainda é igual ou maior que o inicial
- **THEN** nada é gravado e a tela informa que o consumo ainda não apareceu no saldo e que é possível tentar de novo

#### Scenario: Consumo ambíguo
- **WHEN** outro vídeo HeyGen foi iniciado na mesma sessão depois do vídeo não apurado
- **THEN** a apuração manual daquele vídeo é recusada com a explicação de que a diferença de saldo incluiria outro gasto

#### Scenario: Vídeo já apurado não muda
- **WHEN** um vídeo já tem `apurado: true`
- **THEN** o botão apenas atualiza o saldo exibido e nunca reescreve o consumo gravado

#### Scenario: Uso excessivo
- **WHEN** o botão é acionado duas vezes em menos de 3 segundos
- **THEN** a segunda chamada devolve a última leitura sem consultar o HeyGen de novo

### Requirement: Um vídeo HeyGen por vez na sessão
O sistema SHALL recusar, com erro SSE claro, iniciar uma segunda geração de vídeo HeyGen enquanto outra da mesma sessão estiver em andamento, para que a diferença de saldo de um vídeo não inclua o gasto do outro.

#### Scenario: Geração simultânea
- **WHEN** o usuário aciona a geração de um segundo vídeo enquanto o primeiro ainda está sendo gerado
- **THEN** o sistema responde com erro SSE explicando que há um vídeo em andamento, sem chamar o HeyGen

### Requirement: Observabilidade do HeyGen no Langfuse
Com o Langfuse habilitado, o sistema SHALL registrar no trace da requisição de geração do vídeo: um span `heygen.saldo` para a leitura do saldo inicial e outro para a do saldo final (com `fase` e `saldo_usd`), um span `heygen.video` com `video_id`, `aula`, `saldo_inicial_usd`, `saldo_final_usd`, `consumo_usd`, `apurado` e `origem`, o metadado de trace `custo_heygen_usd` e, quando apurado, o score numérico `heygen_consumo_usd`. O envio SHALL usar o mesmo canal da observabilidade existente (spans OTLP em lote e `POST /api/public/scores`). Os valores SHALL ser iguais aos da interface e do `projeto.json` e SHALL NOT incluir e-mail, nome de usuário, chave de API ou texto do roteiro. `custo_heygen_usd` SHALL permanecer separado de `custo_usd` (LLM). Leituras de saldo feitas pela tela ou pelo botão SHALL NOT gerar trace.

#### Scenario: Números iguais nos dois lugares
- **WHEN** um vídeo tem saldo inicial 7.45, final 6.95 e consumo 0.5000
- **THEN** o span `heygen.video` e o score `heygen_consumo_usd` trazem 0.5 e a tela mostra o mesmo consumo

#### Scenario: Metadado do trace
- **WHEN** a requisição de geração do vídeo termina com consumo apurado
- **THEN** o span raiz do trace leva `langfuse.trace.metadata.custo_heygen_usd` com o consumo, sem alterar `custo_usd`

#### Scenario: Consumo não apurado
- **WHEN** o consumo é `apurado: false`
- **THEN** o span `heygen.video` traz `apurado: false` e nenhum score `heygen_consumo_usd` é enviado

#### Scenario: Apuração manual posterior
- **WHEN** o consumo é completado pelo botão "Atualizar saldo" numa requisição posterior
- **THEN** o score `heygen_consumo_usd` é enviado ao `traceId` do vídeo original (gravado em `videosAvatarGerados[].heygen`), e nenhum trace novo é criado

#### Scenario: Leitura de saldo da tela
- **WHEN** o usuário abre a Etapa 10 ou clica em "Atualizar saldo" sem apurar consumo
- **THEN** nenhum span nem trace é enviado ao Langfuse; a leitura fica apenas no log local

#### Scenario: Modo de captura só metadados
- **WHEN** `LANGFUSE_CAPTURE=metadados`
- **THEN** o trace contém apenas números, ids e status, sem o texto do roteiro

#### Scenario: Langfuse indisponível
- **WHEN** o Langfuse está desligado ou fora do ar
- **THEN** a geração, o saldo e o consumo na interface funcionam normalmente, sem erro

