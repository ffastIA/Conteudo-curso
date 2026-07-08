'use strict';

jest.mock('openai');

const { slugify } = require('../../server');

// Testes de caracterização: documentam o comportamento ATUAL de slugify
// (usado para nomear pastas em saídas/{slug}), não necessariamente o ideal.
describe('slugify — nome de curso para pasta em disco', () => {
  test('espaços viram underscore', () => {
    expect(slugify('Curso de Node.js')).toBe('Curso_de_Node.js');
  });

  test('múltiplos espaços colapsam em um underscore', () => {
    expect(slugify('Curso   com    espaços')).toBe('Curso_com_espaços');
  });

  test('acentos são preservados', () => {
    expect(slugify('Formação em Segurança da Informação')).toBe('Formação_em_Segurança_da_Informação');
  });

  test('caracteres inválidos em nome de pasta são removidos', () => {
    // Nota de caracterização: o espaço antes de "*|" sobrevive à remoção dos
    // caracteres inválidos e vira um underscore final — comportamento atual,
    // não necessariamente o ideal.
    expect(slugify('Curso: "Node" <Avançado>? *|')).toBe('Curso_Node_Avançado_');
  });

  test('entrada vazia ou ausente cai no padrão "curso"', () => {
    expect(slugify('')).toBe('curso');
    expect(slugify(undefined)).toBe('curso');
    expect(slugify(null)).toBe('curso');
  });

  test('trunca em 80 caracteres', () => {
    const longo = 'A'.repeat(200);
    expect(slugify(longo).length).toBe(80);
  });

  test('espaços nas pontas são removidos antes da conversão', () => {
    expect(slugify('  Curso com Espaços nas Pontas  ')).toBe('Curso_com_Espaços_nas_Pontas');
  });
});
