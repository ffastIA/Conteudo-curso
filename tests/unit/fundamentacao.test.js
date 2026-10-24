'use strict';

const {
  agruparModulos, selecionarFontesParaAula, similaridade, verificarCitacoes,
  montarReferencias, substituirReferencias, removerSecaoReferencias,
  removerMarcadoresFonte, limparParaMidia, calcularFundamentacao
} = require('../../fundamentacao');

const AULAS = [
  { titulo: 'Variáveis', modulo: 'Fundamentos', objetivos: 'declarar variáveis e tipos primitivos' },
  { titulo: 'Funções', modulo: 'Fundamentos', objetivos: 'criar funções e escopo' },
  { titulo: 'Requisições HTTP', modulo: 'Web', objetivos: 'consumir APIs REST com fetch' }
];

describe('agruparModulos', () => {
  test('agrupa as aulas por módulo na ordem de aparecimento, com ids e objetivos', () => {
    const m = agruparModulos(AULAS);
    expect(m.map(x => [x.id, x.titulo, x.aulas])).toEqual([['m1', 'Fundamentos', [0, 1]], ['m2', 'Web', [2]]]);
    expect(m[0].objetivos).toEqual([
      'Aula 1 (Variáveis): declarar variáveis e tipos primitivos',
      'Aula 2 (Funções): criar funções e escopo'
    ]);
  });

  test('aula sem módulo cai em "Módulo único"; títulos equivalentes (caixa/acento) são o mesmo módulo', () => {
    const m = agruparModulos([{ titulo: 'A' }, { titulo: 'B', modulo: '  ' }, { titulo: 'C', modulo: 'Módulo único' }, { titulo: 'D', modulo: 'MODULO UNICO' }]);
    expect(m).toHaveLength(1);
    expect(m[0].aulas).toEqual([0, 1, 2, 3]);
  });
});

describe('selecionarFontesParaAula', () => {
  const pesquisaModulos = {
    modulos: [{ id: 'm1', titulo: 'Fundamentos' }, { id: 'm2', titulo: 'Web' }],
    fontes: [
      { id: 'f1', url: 'https://mdn.dev/vars', titulo: 'MDN Variáveis', dominio: 'mdn.dev' },
      { id: 'f2', url: 'https://mdn.dev/fn', titulo: 'MDN Funções', dominio: 'mdn.dev' },
      { id: 'f3', url: 'https://web.dev/fetch', titulo: 'Fetch API', dominio: 'web.dev' }
    ],
    achados: [
      { moduloId: 'm1', tema: 'Fundamentos', resumo: 'variáveis e funções em JavaScript', fonteIds: ['f1', 'f2'] },
      { moduloId: 'm2', tema: 'Web', resumo: 'consumir APIs REST com fetch', fonteIds: ['f3'] }
    ]
  };
  const pesquisaGeral = {
    fontes: [
      { id: 'f1', url: 'https://mercado.com/js', titulo: 'Mercado JS', dominio: 'mercado.com' },
      { id: 'f2', url: 'https://cert.org/js', titulo: 'Certificações', dominio: 'cert.org' }
    ],
    achados: [
      { tema: 'Mercado', resumo: 'demanda por declarar variáveis e tipos em JavaScript no mercado', fonteIds: ['f1'] },
      { tema: 'Certificações', resumo: 'exames profissionais de linguagens', fonteIds: ['f2'] }
    ]
  };

  test('usa os achados do módulo da aula primeiro e renumera as fontes como F1..Fk locais', () => {
    const { achados, fontes } = selecionarFontesParaAula({ aula: AULAS[0], aulas: AULAS, pesquisaModulos, pesquisaGeral });
    expect(achados[0].tema).toBe('Fundamentos');
    expect(achados[0].fonteIds).toEqual(['F1', 'F2']);
    expect(fontes.slice(0, 2).map(f => [f.id, f.url])).toEqual([['F1', 'https://mdn.dev/vars'], ['F2', 'https://mdn.dev/fn']]);
    // o achado do módulo "Web" não é da aula 1 e não tem termos em comum: fora
    expect(achados.map(a => a.tema)).not.toContain('Web');
  });

  test('completa com achados gerais mais próximos por sobreposição de termos, sem cortar achados', () => {
    const { achados, fontes } = selecionarFontesParaAula({ aula: AULAS[0], aulas: AULAS, pesquisaModulos, pesquisaGeral });
    expect(achados.map(a => a.tema)).toContain('Mercado'); // termos "declarar variáveis tipos"
    expect(achados.find(a => a.tema === 'Mercado').resumo).toContain('demanda por declarar variáveis'); // inteiro
    expect(achados.map(a => a.tema)).not.toContain('Certificações'); // sem termos em comum
    expect(fontes.map(f => f.id)).toEqual(['F1', 'F2', 'F3']);
  });

  test('respeita o máximo de achados e IDs de pesquisas diferentes não colidem', () => {
    const r = selecionarFontesParaAula({ aula: AULAS[0], aulas: AULAS, pesquisaModulos, pesquisaGeral, maxAchados: 1 });
    expect(r.achados).toHaveLength(1);
    // f1 do módulo e f1 da pesquisa geral são URLs diferentes e ganham IDs locais diferentes
    const todos = selecionarFontesParaAula({ aula: AULAS[0], aulas: AULAS, pesquisaModulos, pesquisaGeral });
    expect(new Set(todos.fontes.map(f => f.url)).size).toBe(todos.fontes.length);
  });

  test('sem pesquisa devolve dossiê vazio', () => {
    expect(selecionarFontesParaAula({ aula: AULAS[0], aulas: AULAS })).toEqual({ achados: [], fontes: [] });
  });

  test('similaridade por termos', () => {
    expect(similaridade('variáveis e tipos primitivos', 'tipos primitivos e variáveis')).toBe(1);
    expect(similaridade('abc defg', 'xyz wxyz')).toBe(0);
    expect(similaridade('', 'qualquer texto aqui')).toBe(0);
  });
});

describe('verificarCitacoes', () => {
  const fontes = [
    { id: 'F1', url: 'https://a.com/1' }, { id: 'F2', url: 'https://b.com/2' }, { id: 'F3', url: 'https://a.com/1' }
  ];

  test('conta fontes distintas por URL e detecta IDs inexistentes', () => {
    const r = verificarCitacoes('Texto [F1] e mais [F2][F9]. Outro [F1].', fontes);
    expect(r.usadas).toEqual(['F1', 'F2']);
    expect(r.idsInvalidos).toEqual(['F9']);
    expect(r.distintas).toBe(2);
    expect(r.minimoAtingido).toBe(true);
  });

  test('F1 e F3 apontam para a mesma URL: contam como uma fonte distinta', () => {
    expect(verificarCitacoes('a [F1] b [F3]', fontes).distintas).toBe(1);
  });

  test('dado numérico sem citação é contado; com [F#], código e títulos não', () => {
    const texto = [
      '## Mercado 2026',
      'O mercado cresceu 35% em 2025 sem fonte nenhuma.',
      'Outra frase com 120 mil vagas [F1].',
      '```js\nconst total = 12345;\n```',
      'Parágrafo sem números.'
    ].join('\n\n');
    expect(verificarCitacoes(texto, fontes).numerosSemCitacao).toBe(1);
  });

  test('sem citações: nenhuma fonte usada, mínimo não atingido', () => {
    const r = verificarCitacoes('Nada citado aqui, 50% do texto.', fontes);
    expect(r).toMatchObject({ usadas: [], distintas: 0, minimoAtingido: false, numerosSemCitacao: 1 });
  });
});

describe('referências', () => {
  const fontes = [{ id: 'F1', url: 'https://a.com', titulo: 'Fonte A' }, { id: 'F2', url: 'https://b.com', titulo: 'Fonte B' }];

  test('monta a seção só com as fontes citadas, com título e URL', () => {
    expect(montarReferencias(fontes, ['F2'])).toBe('### Referências da aula\n\n- [F2] Fonte B — https://b.com');
  });

  test('sem fontes citadas, informa em vez de simular referências', () => {
    expect(montarReferencias(fontes, [])).toMatch(/Nenhuma fonte do dossiê/);
  });

  test('substituirReferencias troca a seção escrita pelo modelo pela autoritativa, sempre no fim', () => {
    const texto = '## Seção\n\nCorpo [F1].\n\n### Referências da aula\n\n- inventada — https://falsa.com\n';
    const r = substituirReferencias(texto, fontes, ['F1']);
    expect(r).not.toContain('falsa.com');
    expect(r).toMatch(/### Referências da aula\n\n- \[F1\] Fonte A — https:\/\/a\.com\n$/);
    expect(r.match(/### Referências da aula/g)).toHaveLength(1);
  });

  test('removerSecaoReferencias preserva as demais seções, mesmo quando as referências estão no meio', () => {
    const texto = '## A\n\ntexto A\n\n### Referências da aula\n\n- x\n\n## B\n\ntexto B';
    expect(removerSecaoReferencias(texto)).toBe('## A\n\ntexto A\n\n## B\n\ntexto B');
  });
});

describe('limpeza para slides, roteiros e vídeo', () => {
  test('remove marcadores [F#] (inclusive agrupados) sem deixar espaço antes da pontuação', () => {
    expect(removerMarcadoresFonte('O Node usa V8 [F1]. Também [F2][F3] e [F1, F2], fim.'))
      .toBe('O Node usa V8. Também e, fim.');
  });

  test('limparParaMidia também remove a seção de referências', () => {
    const texto = '## Tema\n\nFato [F1].\n\n### Referências da aula\n\n- [F1] Fonte — https://a.com\n';
    expect(limparParaMidia(texto)).toBe('## Tema\n\nFato.');
  });

  test('texto sem marcadores permanece igual', () => {
    expect(limparParaMidia('Texto normal.')).toBe('Texto normal.');
  });
});

describe('calcularFundamentacao', () => {
  const fontes = [{ id: 'F1', url: 'https://a.com' }, { id: 'F2', url: 'https://b.com' }];

  test('texto bem fundamentado (dados citados, 2 fontes, IDs válidos) tem score 1', () => {
    const r = calcularFundamentacao('Cresceu 35% [F1]. Há 120 mil vagas [F2]. Conceito sem número.', fontes);
    expect(r.score).toBe(1);
    expect(r.fontesDistintas).toBe(2);
  });

  test('dado sem citação, fonte única e ID inválido reduzem o score', () => {
    const bom = calcularFundamentacao('Cresceu 35% [F1]. Há 120 mil vagas [F2].', fontes).score;
    const semCitar = calcularFundamentacao('Cresceu 35%. Há 120 mil vagas [F2].', fontes);
    expect(semCitar.score).toBeLessThan(bom);
    expect(semCitar.numerosSemCitacao).toBe(1);
    const invalido = calcularFundamentacao('Cresceu 35% [F9]. Há 120 mil vagas [F2].', fontes);
    expect(invalido.score).toBeLessThan(bom);
    expect(invalido.idsInvalidos).toEqual(['F9']);
    const umaFonte = calcularFundamentacao('Cresceu 35% [F1]. Há 120 mil vagas [F1].', fontes);
    expect(umaFonte.score).toBeLessThan(bom);
  });

  test('a seção de referências não conta como citação', () => {
    const texto = 'Texto sem citar nada.\n\n### Referências da aula\n\n- [F1] Fonte A — https://a.com\n- [F2] Fonte B — https://b.com\n';
    expect(calcularFundamentacao(texto, fontes).fontesDistintas).toBe(0);
  });

  test('score sempre entre 0 e 1', () => {
    const r = calcularFundamentacao('Nada citado, 50% e 2026.', fontes);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
