'use strict';

// Os testes herdados de /api/conteudo esperam UMA resposta do mock por aula
// (passada única). A geração por seções (padrão em produção) faz várias
// chamadas por aula e é coberta por tests/integration/conteudo-secoes.test.js,
// que ativa CONTEUDO_MODO=secoes explicitamente.
process.env.CONTEUDO_MODO = 'unico';

// Idem para a pesquisa por módulo: os testes herdados chamam /api/conteudo direto,
// sem a etapa de pesquisa por módulo, e sem pausa entre módulos.
// tests/integration/pesquisa-modulos.test.js liga a exigência explicitamente.
process.env.PESQUISA_MODULOS_OBRIGATORIA = 'false';
process.env.PESQUISA_MODULOS_PAUSA_MS = '0';

// Espera de rate limit curta nos testes (a pausa fixa de 4 s entre aulas deixou de existir).
process.env.RATE_LIMIT_BACKOFF_BASE_MS = '10';

// Logs estruturados silenciados na suíte (tests/unit/logger.test.js cria o próprio logger).
process.env.LOG_LEVEL = 'silent';

// A suíte não depende da chave real do .env (e nunca a usa): o fetch do HeyGen é sempre simulado.
// Os testes de "chave ausente" zeram a variável no próprio arquivo.
process.env.HEYGEN_API_KEY = 'test-heygen-key';
// Saldo do HeyGen sem espera entre leituras nos testes (a pausa de 3 s do botão é testada à parte).
process.env.HEYGEN_SALDO_INTERVALO_MS = '0';
process.env.HEYGEN_SALDO_ESPERA_MS = '0';
