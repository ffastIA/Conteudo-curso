'use strict';

const { calcularCusto } = require('../../observabilidade');
const custo = require('../../custo');

const PRECOS = { porMilhaoDeTokens: { 'gpt-4o': { entrada: 2.5, saida: 10 }, 'gpt-4o-mini': { entrada: 0.15, saida: 0.6 } } };

describe('custo = tabela × usage', () => {
  test('calcularCusto usa entrada e saída por milhão de tokens', () => {
    expect(calcularCusto({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }, 'gpt-4o', PRECOS)).toBeCloseTo(12.5, 6);
    expect(calcularCusto({ prompt_tokens: 2000, completion_tokens: 500 }, 'gpt-4o-mini', PRECOS)).toBeCloseTo(0.0006, 6);
  });
  test('modelo sem preço → null', () => {
    expect(calcularCusto({ prompt_tokens: 10, completion_tokens: 10 }, 'modelo-x', PRECOS)).toBeNull();
  });
});

describe('estimarEtapa', () => {
  const modelos = { pesquisa: 'gpt-4o', economia: 'gpt-4o-mini' };

  test('faixa mínimo ≤ esperado ≤ máximo e escala com as unidades', () => {
    const e3 = custo.estimarEtapa('conteudo', { unidades: 3, modelos, precos: PRECOS });
    const e6 = custo.estimarEtapa('conteudo', { unidades: 6, modelos, precos: PRECOS });
    expect(e3.estimativa).toBe(true);
    expect(e3.custoUsd.minimo).toBeLessThanOrEqual(e3.custoUsd.esperado);
    expect(e3.custoUsd.esperado).toBeLessThanOrEqual(e3.custoUsd.maximo);
    expect(e6.tokens.total).toBe(e3.tokens.total * 2);
  });

  test('estimativa de 3 aulas cobre o custo real da linha de base (US$ 0,056 de conteúdo)', () => {
    const e = custo.estimarEtapa('conteudo', { unidades: 3, modelos, precos: PRECOS });
    expect(e.custoUsd.minimo).toBeLessThanOrEqual(0.056);
    expect(e.custoUsd.maximo).toBeGreaterThanOrEqual(0.056);
  });

  test('pesquisa por módulo usa o modelo de pesquisa; zero unidades → zero', () => {
    const e = custo.estimarEtapa('pesquisa-modulos', { unidades: 3, modelos, precos: PRECOS });
    expect(e.modelo).toBe('gpt-4o');
    expect(e.custoUsd.esperado).toBeGreaterThan(0.1);
    expect(custo.estimarEtapa('revisao', { unidades: 0, modelos, precos: PRECOS }).tokens.total).toBe(0);
  });

  test('modelo sem preço → custo nulo; etapa desconhecida → null', () => {
    expect(custo.estimarEtapa('conteudo', { unidades: 1, modelos: { economia: 'x' }, precos: PRECOS }).custoUsd).toBeNull();
    expect(custo.estimarEtapa('outra', { unidades: 1, modelos, precos: PRECOS })).toBeNull();
  });
});

describe('orçamento', () => {
  test('sem ORCAMENTO_USD nenhuma trava é aplicada', () => {
    expect(custo.lerOrcamento({})).toBeNull();
    expect(custo.verificarOrcamento({ acumulado: 999, estimativa: 999, env: {} })).toBeNull();
  });
  test('valores inválidos ou zero desligam a trava', () => {
    expect(custo.lerOrcamento({ ORCAMENTO_USD: 'abc' })).toBeNull();
    expect(custo.lerOrcamento({ ORCAMENTO_USD: '0' })).toBeNull();
    expect(custo.lerOrcamento({ ORCAMENTO_USD: '5' })).toBe(5);
  });
  test('acumulado + estimativa acima do teto → erro com custo e teto na mensagem', () => {
    const err = custo.verificarOrcamento({ acumulado: 0.9, estimativa: 0.2, env: { ORCAMENTO_USD: '1' } });
    expect(err.code).toBe('ORCAMENTO_EXCEDIDO');
    expect(err.message).toMatch(/0\.9000/);
    expect(err.message).toMatch(/US\$ 1\.00/);
  });
  test('exatamente no teto passa', () => {
    expect(custo.verificarOrcamento({ acumulado: 0.8, estimativa: 0.2, env: { ORCAMENTO_USD: '1' } })).toBeNull();
  });
  test('estimarCustoChamada cresce com o prompt e com max_tokens', () => {
    const curto = custo.estimarCustoChamada({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'oi' }], max_tokens: 100 }, PRECOS);
    const longo = custo.estimarCustoChamada({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'x'.repeat(40_000) }], max_tokens: 8000 }, PRECOS);
    expect(longo).toBeGreaterThan(curto);
    expect(custo.estimarCustoChamada({ model: 'sem-preco', messages: [] }, PRECOS)).toBe(0);
  });
});

describe('disjuntor', () => {
  test('abre após N falhas consecutivas, fecha após a espera e zera com sucesso', () => {
    let t = 0;
    const d = custo.criarDisjuntor({ limite: 3, esperaMs: 1000, agora: () => t });
    d.falha(); d.falha();
    expect(d.verificar()).toBeNull();
    d.falha();
    expect(d.verificar().code).toBe('DISJUNTOR_ABERTO');
    t = 1001;
    expect(d.verificar()).toBeNull();
    d.falha(); d.falha(); d.sucesso(); d.falha(); d.falha();
    expect(d.verificar()).toBeNull();
  });
});
