'use strict';

const {
  FORMULA_VERSAO, estimarTokens, limiteTokensEntrada, dividirEmPartes, subdividir,
  secoesAlteradas, emparelharPartes, mediaPonderadaCriterios, resumoSecoes
} = require('../../avaliacao');

const palavras = (n, p = 'texto') => Array.from({ length: n }, () => p).join(' ');
const AULA = `## Variáveis\n\nParágrafo um sobre variáveis.\n\nParágrafo dois.\n\n## Funções\n\n${palavras(200)}.\n\n## Síntese\n\nFechamento final da aula.\n`;

describe('estimarTokens e limite', () => {
  test('~3,5 caracteres por token, arredondado para cima', () => {
    expect(estimarTokens('')).toBe(0);
    expect(estimarTokens('a'.repeat(35))).toBe(10);
    expect(estimarTokens('a'.repeat(36))).toBe(11);
  });

  test('limite padrão 24.000 e configurável por AVALIACAO_MAX_TOKENS_ENTRADA', () => {
    expect(limiteTokensEntrada({})).toBe(24000);
    expect(limiteTokensEntrada({ AVALIACAO_MAX_TOKENS_ENTRADA: '5000' })).toBe(5000);
    expect(limiteTokensEntrada({ AVALIACAO_MAX_TOKENS_ENTRADA: 'abc' })).toBe(24000);
    expect(limiteTokensEntrada({ AVALIACAO_MAX_TOKENS_ENTRADA: '-3' })).toBe(24000);
  });
});

describe('dividirEmPartes — nada é descartado', () => {
  test('divide por seção "##" e as partes juntas reproduzem o texto original', () => {
    const partes = dividirEmPartes(AULA, 100_000);
    expect(partes.map(p => p.titulo)).toEqual(['Variáveis', 'Funções', 'Síntese']);
    expect(partes.map(p => p.texto).join('')).toBe(AULA);
  });

  test('texto antes da primeira seção vira "Abertura"', () => {
    const t = `Introdução solta.\n\n${AULA}`;
    const partes = dividirEmPartes(t, 100_000);
    expect(partes[0].titulo).toBe('Abertura');
    expect(partes.map(p => p.texto).join('')).toBe(t);
  });

  test('seção grande é subdividida; o texto completo continua coberto e cada parte respeita o limite', () => {
    const grande = `## Seção Grande\n\n${Array.from({ length: 40 }, (_, i) => `Parágrafo ${i} ${palavras(60)}.`).join('\n\n')}\n\n## Final\n\nFim.`;
    const limite = 400; // tokens
    const partes = dividirEmPartes(grande, limite);
    expect(partes.length).toBeGreaterThan(3);
    expect(partes.map(p => p.texto).join('')).toBe(grande);
    for (const p of partes) expect(estimarTokens(p.texto)).toBeLessThanOrEqual(limite);
    expect(partes[0].titulo).toMatch(/Seção Grande \(parte 1 de \d+\)/);
    expect(partes[partes.length - 1].titulo).toBe('Final');
  });

  test('texto sem seções é dividido só por tamanho, sem perda', () => {
    const t = Array.from({ length: 30 }, (_, i) => `Parágrafo ${i} ${palavras(50)}.`).join('\n\n');
    const partes = dividirEmPartes(t, 300);
    expect(partes.length).toBeGreaterThan(2);
    expect(partes.map(p => p.texto).join('')).toBe(t);
  });

  test('parágrafo único gigante é quebrado em frases/palavras sem perder nenhuma palavra', () => {
    const t = Array.from({ length: 200 }, (_, i) => `Frase número ${i} com várias palavras aqui.`).join(' ');
    const partes = subdividir(t, 200);
    expect(partes.length).toBeGreaterThan(3);
    expect(partes.join('')).toBe(t);
    const semEspacos = Array.from({ length: 50 }, () => 'x'.repeat(100)).join(' ');
    expect(subdividir(semEspacos, 150).join('')).toBe(semEspacos);
  });

  test('vazio e texto pequeno', () => {
    expect(dividirEmPartes('')).toEqual([]);
    expect(dividirEmPartes('Só um texto curto.')).toEqual([{ titulo: 'Aula', secao: 'Aula', texto: 'Só um texto curto.' }]);
  });
});

describe('secoesAlteradas', () => {
  const original = '## A\n\nTexto A.\n\n## B\n\nTexto B.\n\n## Síntese\n\nFim.\n';

  test('detecta só a seção alterada — inclusive a última', () => {
    const candidato = '## A\n\nTexto A.\n\n## B\n\nTexto B.\n\n## Síntese\n\nFim melhorado com exemplo novo.\n';
    const r = secoesAlteradas(original, candidato);
    expect(r.alteradas).toHaveLength(1);
    expect(r.alteradas[0]).toMatchObject({ titulo: 'Síntese', tipo: 'alterada' });
    expect(r.alteradas[0].original).toContain('Fim.');
    expect(r.alteradas[0].candidato).toContain('exemplo novo');
    expect(r.titulos).toEqual(['A', 'B', 'Síntese']);
  });

  test('seção nova e seção removida', () => {
    const candidato = '## A\n\nTexto A.\n\n## C\n\nSeção nova.\n\n## Síntese\n\nFim.\n';
    const r = secoesAlteradas(original, candidato);
    expect(r.alteradas.map(a => [a.titulo, a.tipo]).sort()).toEqual([['B', 'removida'], ['C', 'nova']].sort());
  });

  test('textos idênticos (mesmo com espaços finais diferentes) não têm alterações', () => {
    expect(secoesAlteradas(original, original + '\n').alteradas).toEqual([]);
  });

  test('título comparado sem caixa/acento', () => {
    const r = secoesAlteradas('## Funções\n\nx\n', '## FUNCOES\n\ny\n');
    expect(r.alteradas).toHaveLength(1);
    expect(r.alteradas[0].tipo).toBe('alterada');
  });
});

describe('emparelharPartes', () => {
  test('cabe: um par; grande: partes emparelhadas por posição, faltante vira vazio', () => {
    expect(emparelharPartes('a', 'b', 1000)).toEqual([{ original: 'a', candidato: 'b' }]);
    const longo = Array.from({ length: 20 }, (_, i) => `P${i} ${palavras(40)}.`).join('\n\n');
    const pares = emparelharPartes(longo, 'curto', 200);
    expect(pares.length).toBeGreaterThan(2);
    expect(pares[0].candidato).toBe('curto');
    expect(pares[1].candidato).toBe('');
    expect(pares.map(p => p.original).join('')).toBe(longo);
  });
});

describe('mediaPonderadaCriterios', () => {
  test('média por critério ponderada pelo peso (palavras); critério ausente → null', () => {
    const r = mediaPonderadaCriterios([
      { criterios: { planoAula: 10, qualidadeDidatica: 4 }, peso: 300 },
      { criterios: { planoAula: 6, qualidadeDidatica: 8 }, peso: 100 }
    ]);
    expect(r.planoAula).toBe(9);
    expect(r.qualidadeDidatica).toBe(5);
    expect(r.clarezaEstrutura).toBeNull();
  });
});

describe('resumoSecoes', () => {
  test('TODAS as seções entram no resumo (inclusive a última), com título e contagem de palavras', () => {
    const r = resumoSecoes(AULA, 5);
    expect(r).toContain('- Variáveis');
    expect(r).toContain('- Funções');
    expect(r).toContain('- Síntese');
    expect(r).toContain('Fechamento final da aula.');
    expect(r.split('\n')).toHaveLength(3);
  });
});

test('versão da fórmula', () => {
  expect(FORMULA_VERSAO).toBe('2');
});
