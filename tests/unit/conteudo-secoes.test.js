'use strict';

const {
  contarPalavras, parseRoteiroAula, estimarMetaPalavrasAula, distribuirMetaPalavras,
  verificarCompletude, caudaAberta, blocoDeCodigoAberto
} = require('../../conteudo-secoes');

const palavras = (n, p = 'palavra') => Array.from({ length: n }, () => p).join(' ');

describe('parseRoteiroAula', () => {
  test('lê o JSON de seções e garante a síntese por último', () => {
    const r = parseRoteiroAula(JSON.stringify({ secoes: [
      { titulo: 'Variáveis e tipos', objetivo: 'Declarar variáveis', tipo: 'teorica' },
      { titulo: 'Síntese', objetivo: 'fechar' },
      { titulo: 'Funções', objetivo: 'Criar funções', tipo: 'pratica' }
    ] }));
    expect(r.map(s => s.titulo)).toEqual(['Variáveis e tipos', 'Funções', 'Síntese']);
  });

  test('acrescenta a síntese quando o modelo não a planejou', () => {
    const r = parseRoteiroAula('{"secoes":[{"titulo":"Introdução ao tema"}]}');
    expect(r.map(s => s.titulo)).toEqual(['Introdução ao tema', 'Síntese']);
  });

  test('aceita cerca ```json e texto ao redor; remove # do título e duplicados', () => {
    const r = parseRoteiroAula('Aqui está:\n```json\n{"secoes":[{"titulo":"## Loops"},{"titulo":"loops"},{"titulo":"Arrays"}]}\n```');
    expect(r.map(s => s.titulo)).toEqual(['Loops', 'Arrays', 'Síntese']);
  });

  test.each([
    ['texto livre sem JSON', 'Conteúdo original da Aula 1.'],
    ['JSON inválido', '{secoes: [}'],
    ['sem seções', '{"secoes":[]}'],
    ['título curto demais', '{"secoes":[{"titulo":"A"}]}'],
    ['seções demais', JSON.stringify({ secoes: Array.from({ length: 13 }, (_, i) => ({ titulo: `Seção número ${i}` })) })],
    ['vazio', '']
  ])('inválido (%s) devolve null', (_nome, entrada) => {
    expect(parseRoteiroAula(entrada)).toBeNull();
  });
});

describe('metas de palavras', () => {
  test('cresce com a duração e o nível, respeitando limites', () => {
    expect(estimarMetaPalavrasAula({ duracao: 60, nivel: 'intermediario' })).toBe(1800);
    expect(estimarMetaPalavrasAula({ duracao: 60, nivel: 'basico' })).toBe(1620);
    expect(estimarMetaPalavrasAula({ duracao: 60, nivel: 'avançado' })).toBe(2070);
    expect(estimarMetaPalavrasAula({ duracao: 5 })).toBe(800);
    expect(estimarMetaPalavrasAula({ duracao: 600 })).toBe(6000);
    expect(estimarMetaPalavrasAula({})).toBe(1800); // padrão 60 min
  });

  test('distribui pelas seções com a síntese pesando metade', () => {
    const metas = distribuirMetaPalavras(1000, [{ titulo: 'A seção' }, { titulo: 'B seção' }, { titulo: 'Síntese' }]);
    expect(metas).toEqual([400, 400, 200]);
  });
});

describe('verificarCompletude', () => {
  const secoes = (extra = {}) => [
    { titulo: 'Conceitos', texto: palavras(100), meta: 100 },
    { titulo: 'Prática', texto: palavras(100), meta: 100 },
    { titulo: 'Síntese', texto: palavras(50), meta: 50, ...extra }
  ];

  test('aula com todas as seções, no tamanho e terminando bem é completa', () => {
    const r = verificarCompletude({ secoes: secoes() });
    expect(r).toMatchObject({ estado: 'completa', motivos: [], ausentes: [], curtas: [], palavras: 250 });
  });

  test('seção abaixo de 80% da meta torna a aula curta (não incompleta)', () => {
    const s = secoes();
    s[0].texto = palavras(79);
    const r = verificarCompletude({ secoes: s });
    expect(r.estado).toBe('curta');
    expect(r.curtas).toEqual(['Conceitos']);
  });

  test('exatamente 80% da meta ainda é suficiente', () => {
    const s = secoes();
    s[0].texto = palavras(80);
    expect(verificarCompletude({ secoes: s }).estado).toBe('completa');
  });

  test('seção ausente (vazia) torna a aula incompleta', () => {
    const s = secoes();
    s[1].texto = '';
    const r = verificarCompletude({ secoes: s });
    expect(r.estado).toBe('incompleta');
    expect(r.ausentes).toEqual(['Prática']);
    expect(r.motivos.join(' ')).toMatch(/ausentes: Prática/);
  });

  test('seção truncada ou truncamento geral torna a aula incompleta', () => {
    expect(verificarCompletude({ secoes: secoes({ truncada: true }) }).estado).toBe('incompleta');
    expect(verificarCompletude({ texto: 'ok.', truncada: true }).estado).toBe('incompleta');
  });

  test('bloco de código aberto torna a aula incompleta', () => {
    const s = secoes();
    s[2].texto = `${palavras(50)}\n\`\`\`js\nconst a = 1;`;
    const r = verificarCompletude({ secoes: s });
    expect(r.codigoAberto).toBe(true);
    expect(r.estado).toBe('incompleta');
  });

  test('texto terminando em lista aberta ou dois-pontos torna a aula incompleta', () => {
    const s = secoes();
    s[2].texto = `${palavras(50)}\n- primeiro item\n-`;
    expect(verificarCompletude({ secoes: s }).caudaAberta).toBe(true);
    s[2].texto = `${palavras(50)} como veremos a seguir:`;
    expect(verificarCompletude({ secoes: s }).estado).toBe('incompleta');
  });

  test('síntese fora do final torna a aula incompleta', () => {
    const s = secoes();
    s.push({ titulo: 'Extra', texto: palavras(60), meta: 60 });
    const r = verificarCompletude({ secoes: s });
    expect(r.estado).toBe('incompleta');
    expect(r.motivos.join(' ')).toMatch(/síntese não está no final/);
  });

  test('modo de passada única: só truncamento, código e cauda abertos são avaliados', () => {
    expect(verificarCompletude({ texto: 'Texto curto e fechado.' }).estado).toBe('completa');
    expect(verificarCompletude({ texto: 'Texto cortado no meio de' }).estado).toBe('incompleta');
    expect(verificarCompletude({ texto: '```js\nx' }).estado).toBe('incompleta');
  });
});

describe('auxiliares', () => {
  test('contarPalavras', () => {
    expect(contarPalavras('')).toBe(0);
    expect(contarPalavras('  um  dois\ntrês ')).toBe(3);
  });
  test('caudaAberta e blocoDeCodigoAberto', () => {
    expect(caudaAberta('Fim.')).toBe(false);
    expect(caudaAberta('Veja:')).toBe(true);
    expect(caudaAberta('1.')).toBe(true);
    expect(caudaAberta('Texto que termina em para')).toBe(true);
    // URL ou domínio terminando em "com" não é conector solto
    expect(caudaAberta('- fonte — https://exemplo.com')).toBe(false);
    expect(caudaAberta('Veja o site exemplo.com.br')).toBe(false);
    expect(blocoDeCodigoAberto('```a\n```')).toBe(false);
    expect(blocoDeCodigoAberto('```a')).toBe(true);
  });
});
