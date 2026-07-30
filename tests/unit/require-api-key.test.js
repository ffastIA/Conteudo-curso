'use strict';

const { requireApiKey } = require('../../server');

describe('requireApiKey — guard de chave de API externa obrigatória', () => {
  test.each([undefined, null, '', '   '])('valor ausente/vazio (%p) lança erro citando o nome da variável e .env.example', (valor) => {
    expect(() => requireApiKey(valor, 'HEYGEN_API_KEY')).toThrow(/HEYGEN_API_KEY/);
    expect(() => requireApiKey(valor, 'HEYGEN_API_KEY')).toThrow(/\.env\.example/);
  });

  test('valor presente não lança', () => {
    expect(() => requireApiKey('chave-real-123', 'GAMMA_API_KEY')).not.toThrow();
  });

  test('mensagem cita o nome exato da variável passada', () => {
    expect(() => requireApiKey('', 'GAMMA_API_KEY')).toThrow(/GAMMA_API_KEY/);
    expect(() => requireApiKey('', 'GAMMA_API_KEY')).not.toThrow(/HEYGEN_API_KEY/);
  });
});
