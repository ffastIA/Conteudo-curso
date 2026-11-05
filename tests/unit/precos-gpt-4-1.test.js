'use strict';

// Preços de gpt-4.1 e gpt-4.1-mini (change precos-gpt-4-1): a tabela real casa cada modelo pela sua
// própria tarifa (a chave mais longa vence) e o cálculo usa entrada, cache e saída de cada um.

const { calcularCusto, carregarPrecos } = require('../../observabilidade');

const USO = { prompt_tokens: 1_000_000, completion_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 0 } };

describe('tabela real de preços', () => {
  const precos = carregarPrecos();

  test('traz os quatro modelos com entrada, cache e saída', () => {
    for (const m of ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini']) {
      expect(precos.porMilhaoDeTokens[m]).toEqual({ entrada: expect.any(Number), entradaEmCache: expect.any(Number), saida: expect.any(Number) });
    }
  });

  test('gpt-4.1 usa a própria tarifa', () => {
    expect(calcularCusto(USO, 'gpt-4.1', precos)).toBeCloseTo(2 + 8, 6);
  });

  test('gpt-4.1-mini não é capturado pela tarifa de gpt-4.1', () => {
    expect(calcularCusto(USO, 'gpt-4.1-mini', precos)).toBeCloseTo(0.4 + 1.6, 6);
  });

  test('versão datada casa por prefixo', () => {
    expect(calcularCusto(USO, 'gpt-4.1-mini-2025-04-14', precos)).toBeCloseTo(2, 6);
    expect(calcularCusto(USO, 'gpt-4.1-2025-04-14', precos)).toBeCloseTo(10, 6);
  });

  test('tokens em cache usam a tarifa de cache', () => {
    const uso = { prompt_tokens: 1_000_000, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 1_000_000 } };
    expect(calcularCusto(uso, 'gpt-4.1', precos)).toBeCloseTo(0.5, 6);
  });
});
