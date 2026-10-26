'use strict';

// Cobrança dos tokens de entrada em cache e bloco fixo da busca em modelos mini
// (change otimizacao-de-tokens).

const { calcularCusto, tokensEmCache } = require('../../observabilidade');
const custo = require('../../custo');

const PRECOS = {
  porMilhaoDeTokens: {
    'gpt-4o': { entrada: 2.5, entradaEmCache: 1.25, saida: 10 },
    'gpt-4o-mini': { entrada: 0.15, entradaEmCache: 0.075, saida: 0.6 }
  }
};

describe('tokensEmCache', () => {
  test('lê o usage normalizado, o de chat e o da Responses API', () => {
    expect(tokensEmCache({ prompt_tokens: 1000, cached_tokens: 400 })).toBe(400);
    expect(tokensEmCache({ prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 300 } })).toBe(300);
    expect(tokensEmCache({ input_tokens: 1000, input_tokens_details: { cached_tokens: 200 } })).toBe(200);
  });

  test('ausente, inválido ou negativo vale 0; nunca passa do total de entrada', () => {
    expect(tokensEmCache(undefined)).toBe(0);
    expect(tokensEmCache({ prompt_tokens: 1000 })).toBe(0);
    expect(tokensEmCache({ prompt_tokens: 1000, cached_tokens: 'x' })).toBe(0);
    expect(tokensEmCache({ prompt_tokens: 1000, cached_tokens: -5 })).toBe(0);
    expect(tokensEmCache({ prompt_tokens: 1000, cached_tokens: 5000 })).toBe(1000);
  });
});

describe('calcularCusto com tokens em cache', () => {
  test('exemplo da spec: 10.000 de entrada (8.000 em cache) e 1.000 de saída no gpt-4o-mini = US$ 0,0015', () => {
    const usage = { prompt_tokens: 10_000, completion_tokens: 1_000, prompt_tokens_details: { cached_tokens: 8_000 } };
    expect(calcularCusto(usage, 'gpt-4o-mini', PRECOS)).toBeCloseTo((2_000 * 0.15 + 8_000 * 0.075 + 1_000 * 0.6) / 1_000_000, 10);
    expect(calcularCusto(usage, 'gpt-4o-mini', PRECOS)).toBeCloseTo(0.0015, 10);
  });

  test('modelo sem preço de cache cobra tudo pelo preço de entrada', () => {
    const precos = { porMilhaoDeTokens: { 'gpt-4o-mini': { entrada: 0.15, saida: 0.6 } } };
    const usage = { prompt_tokens: 10_000, completion_tokens: 1_000, cached_tokens: 8_000 };
    expect(calcularCusto(usage, 'gpt-4o-mini', precos)).toBeCloseTo((10_000 * 0.15 + 1_000 * 0.6) / 1_000_000, 10);
  });

  test('sem tokens em cache, o custo é o de sempre', () => {
    expect(calcularCusto({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }, 'gpt-4o', PRECOS)).toBeCloseTo(12.5, 10);
  });

  test('o arquivo de preços real traz o preço de cache dos dois modelos usados pelo app', () => {
    const arquivo = require('../../config/precos-modelos.json');
    expect(arquivo.porMilhaoDeTokens['gpt-4o'].entradaEmCache).toBeCloseTo(1.25, 10);
    expect(arquivo.porMilhaoDeTokens['gpt-4o-mini'].entradaEmCache).toBeCloseTo(0.075, 10);
  });

  test('a estimativa prévia de uma etapa não aplica desconto de cache', () => {
    const e = custo.estimarEtapa('conteudo', { unidades: 1, modelos: { economia: 'gpt-4o-mini' }, precos: PRECOS });
    const semDesconto = calcularCusto({ prompt_tokens: 108_000, completion_tokens: 4_100 }, 'gpt-4o-mini', PRECOS);
    expect(e.custoUsd.esperado).toBeCloseTo(semDesconto, 3);
  });
});

describe('custoBlocoBuscaMini', () => {
  const precos = { ...PRECOS, buscaWebBlocoTokensMini: 8_000, buscaWebBlocoTokensMiniSomar: true };

  test('soma o bloco fixo por chamada de busca em modelo mini quando ligado', () => {
    expect(custo.custoBlocoBuscaMini('gpt-4o-mini', 2, precos)).toBeCloseTo(2 * 8_000 * 0.15 / 1_000_000, 10);
  });

  test('nunca soma para gpt-4o', () => {
    expect(custo.custoBlocoBuscaMini('gpt-4o', 3, precos)).toBe(0);
  });

  test('desligado por padrão: sem a chave de ativação vale 0', () => {
    expect(custo.custoBlocoBuscaMini('gpt-4o-mini', 3, { ...precos, buscaWebBlocoTokensMiniSomar: false })).toBe(0);
    expect(custo.custoBlocoBuscaMini('gpt-4o-mini', 3, PRECOS)).toBe(0);
  });

  test('o arquivo real vem desligado até a verificação com chamada real', () => {
    const arquivo = require('../../config/precos-modelos.json');
    expect(arquivo.buscaWebBlocoTokensMini).toBe(8000);
    expect(arquivo.buscaWebBlocoTokensMiniSomar).toBe(false);
  });
});
