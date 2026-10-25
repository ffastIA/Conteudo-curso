## ADDED Requirements

### Requirement: Saldo e consumo na geração do vídeo
A tela de geração do vídeo (Etapa 10) SHALL exibir o saldo da carteira HeyGen antes do envio e, ao concluir cada vídeo, o saldo final e o consumo medido pela diferença de saldo, conforme a capability `heygen-observability`. O evento SSE `done` de `GET /api/video-avatar/gerar` SHALL incluir o objeto `heygen` com `saldoInicialUsd`, `saldoFinalUsd`, `consumoUsd`, `moeda` e `apurado`.

#### Scenario: Evento final com consumo
- **WHEN** o vídeo da aula termina e o saldo baixou de 7.45 para 6.95
- **THEN** o `done` traz `heygen.consumoUsd: 0.5` e a tela exibe o consumo junto ao vídeo gerado

#### Scenario: Fluxo existente preservado
- **WHEN** o saldo do HeyGen está indisponível
- **THEN** o envio do roteiro, o polling, o download do `.mp4` e o registro do vídeo ocorrem como antes, apenas sem os números de saldo
