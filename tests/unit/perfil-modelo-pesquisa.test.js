'use strict';

// Modelo de pesquisa definido pelo perfil de custo (change otimizacao-de-tokens).

const orcamento = require('../../orcamento');

describe('modelo de pesquisa definido pelo perfil (validação de capacidades)', () => {
  const tabela = {
    modelos: { 'gpt-4o': { busca_web: true }, 'sem-busca': { busca_web: false } },
    exigencias: { pesquisa: ['busca_web'] }
  };
  const porPapel = { pesquisa: 'gpt-4o' };

  test('perfil sem modeloPesquisa não gera aviso extra', () => {
    expect(orcamento.validarModelos(porPapel, tabela, { economico: { rotulo: 'Econômico' } })).toEqual([]);
  });

  test('modeloPesquisa sem busca web gera aviso identificando o perfil, sem lançar erro', () => {
    const avisos = orcamento.validarModelos(porPapel, tabela, { economico: { rotulo: 'Econômico', modeloPesquisa: 'sem-busca' } });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ papel: 'pesquisa', modelo: 'sem-busca', tipo: 'sem_capacidade' });
    expect(avisos[0].mensagem).toMatch(/perfil Econômico/);
  });

  test('modeloPesquisa fora da tabela avisa que a capacidade não pôde ser conferida', () => {
    const avisos = orcamento.validarModelos(porPapel, tabela, { premium: { rotulo: 'Premium', modeloPesquisa: 'modelo-novo' } });
    expect(avisos[0]).toMatchObject({ tipo: 'nao_conferido', modelo: 'modelo-novo' });
  });

  test('só o perfil Econômico define modeloPesquisa (gpt-4o-mini, experimento 4.3)', () => {
    const cfg = require('../../config/perfis-custo.json');
    expect(cfg.perfis.economico.modeloPesquisa).toBe('gpt-4o-mini');
    expect(cfg.perfis.padrao.modeloPesquisa).toBeUndefined();
    expect(cfg.perfis.premium.modeloPesquisa).toBeUndefined();
  });
});
