'use strict';

// Os testes herdados de /api/conteudo esperam UMA resposta do mock por aula
// (passada única). A geração por seções (padrão em produção) faz várias
// chamadas por aula e é coberta por tests/integration/conteudo-secoes.test.js,
// que ativa CONTEUDO_MODO=secoes explicitamente.
process.env.CONTEUDO_MODO = 'unico';
