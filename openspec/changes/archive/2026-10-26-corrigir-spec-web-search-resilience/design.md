## Decisões

- O fallback automático é **removido**, não renomeado: o comportamento que o substitui está em `web-research` ("Fallback somente por decisão explícita"), e o novo requisito aqui trata só da resiliência (o que acontece depois das retentativas e o que a interface oferece).
- Os valores vêm das constantes `SEARCH_TIMEOUT_MS` (90 s), `SEARCH_RETRY_TIMEOUT_MS` (60 s), `PESQUISA_MAX_RETENTATIVAS` (2) e `SEARCH_FALLBACK_TIMEOUT_MS` (30 s), conferidas em `server.js` em 2026-10-25.
- O requisito "Dados anteriores preservados em caso de falha" continua válido e não é tocado.
