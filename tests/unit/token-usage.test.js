const { acumulaTokenUsage, isRespostaMelhoriasCompleta } = require('../../server');

describe('acumulaTokenUsage — histórico persistido por projeto', () => {
  const usage = (p, c) => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c });

  test('primeiro registro cria total e porDia', () => {
    const d = acumulaTokenUsage(null, usage(100, 50), '2026-07-04');
    expect(d.total).toEqual({ prompt: 100, completion: 50, total: 150 });
    expect(d.porDia['2026-07-04']).toEqual({ prompt: 100, completion: 50, total: 150 });
    expect(d.atualizadoEm).toBeTruthy();
  });

  test('acumula no mesmo dia e separa dias diferentes', () => {
    let d = acumulaTokenUsage(null, usage(100, 50), '2026-07-04');
    d = acumulaTokenUsage(d, usage(10, 5), '2026-07-04');
    d = acumulaTokenUsage(d, usage(1000, 500), '2026-07-05');
    expect(d.total).toEqual({ prompt: 1110, completion: 555, total: 1665 });
    expect(d.porDia['2026-07-04'].total).toBe(165);
    expect(d.porDia['2026-07-05'].total).toBe(1500);
  });

  test('arquivo corrompido (conteúdo não-objeto) recomeça zerado sem erro', () => {
    for (const corrompido of ['string qualquer', [1, 2], 42]) {
      const d = acumulaTokenUsage(corrompido, usage(10, 5), '2026-07-04');
      expect(d.total.total).toBe(15);
    }
  });

  test('usage sem campos não quebra', () => {
    const d = acumulaTokenUsage(null, {}, '2026-07-04');
    expect(d.total).toEqual({ prompt: 0, completion: 0, total: 0 });
  });
});

describe('isRespostaMelhoriasCompleta — guarda de truncamento', () => {
  test('finish_reason length é sempre incompleta', () => {
    expect(isRespostaMelhoriasCompleta('texto com ### Melhorias Aplicadas\n1. ok', 'length')).toBe(false);
  });

  test('sem a seção obrigatória é incompleta mesmo com stop', () => {
    expect(isRespostaMelhoriasCompleta('conteúdo cortado no meio de pala', 'stop')).toBe(false);
    expect(isRespostaMelhoriasCompleta('', 'stop')).toBe(false);
  });

  test('com a seção e finish stop é completa', () => {
    expect(isRespostaMelhoriasCompleta('conteúdo...\n\n### Melhorias Aplicadas\n1. feita', 'stop')).toBe(true);
  });

  test('finish_reason ausente (stream antigo) decide pela seção', () => {
    expect(isRespostaMelhoriasCompleta('...### Melhorias Aplicadas\n- x', undefined)).toBe(true);
    expect(isRespostaMelhoriasCompleta('cortado', undefined)).toBe(false);
  });
});
