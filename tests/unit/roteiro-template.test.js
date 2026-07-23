const { preencherTemplateRoteiro, extrairBlocoVozAvatar, preencherBlocoVozNoRoteiro } = require('../../server');

describe('preencherTemplateRoteiro — substituição dos placeholders do roteiro', () => {
  test('substitui %%TEMA%% mesmo com o espaço espúrio real do template ("[%% TEMA%%]") e remove a anotação de orientação', () => {
    const template = 'Tema: [%% TEMA%%]  (tema da aula + objetivos especificos)';
    const resultado = preencherTemplateRoteiro(template, {
      temaObjetivos: 'Memórias RAM e ROM. Objetivos específicos: Definir RAM e ROM',
      idade: 'Jovens de 16 a 18 anos',
      blocos: 4
    });
    expect(resultado).toBe('Tema: [Memórias RAM e ROM. Objetivos específicos: Definir RAM e ROM]');
  });

  test('preserva os colchetes literais ao redor de cada placeholder e remove a anotação "(já vem do sistema)"', () => {
    const template = 'Faixa etária: [%%IDADE%%] (já vem do sistema)\nGere [%%BLOCOS%%] blocos.';
    const resultado = preencherTemplateRoteiro(template, {
      temaObjetivos: 'x',
      idade: 'Adultos',
      blocos: 3
    });
    expect(resultado).toBe('Faixa etária: [Adultos]\nGere [3] blocos.');
  });

  test('remove as anotações de orientação do prompt final, mas não afeta o restante do texto', () => {
    const template =
      'Tema: [%% TEMA%%]  (tema da aula + objetivos especificos)\n' +
      'Faixa etária: [%%IDADE%%] (já vem do sistema)\n\n' +
      'Regras obrigatórias para TODOS os blocos:';
    const resultado = preencherTemplateRoteiro(template, {
      temaObjetivos: 'Tema X',
      idade: 'Adultos',
      blocos: 2
    });
    expect(resultado).not.toMatch(/tema da aula \+ objetivos especificos/i);
    expect(resultado).not.toMatch(/já vem do sistema/i);
    expect(resultado).toBe(
      'Tema: [Tema X]\n' +
      'Faixa etária: [Adultos]\n\n' +
      'Regras obrigatórias para TODOS os blocos:'
    );
  });

  test('substitui %%IDADE%% e %%BLOCOS%% sem espaço espúrio normalmente', () => {
    const template = '[%%IDADE%%] / [%%BLOCOS%%]';
    const resultado = preencherTemplateRoteiro(template, { temaObjetivos: 'x', idade: 'Crianças', blocos: 6 });
    expect(resultado).toBe('[Crianças] / [6]');
  });

  test('substitui todas as ocorrências do mesmo placeholder (regex global)', () => {
    const template = '%%TEMA%% ... %%TEMA%% de novo';
    const resultado = preencherTemplateRoteiro(template, { temaObjetivos: 'Tema X', idade: 'a', blocos: 1 });
    expect(resultado).toBe('Tema X ... Tema X de novo');
  });
});

describe('extrairBlocoVozAvatar — extração do bloco de voz do template', () => {
  test('extrai o texto entre "VOZ DO AVATAR (...)":" e "FALAS:"', () => {
    const template =
      'VOZ DO AVATAR (OBRIGATÓRIA EM TODOS OS BLOCOS):\n\n' +
      'Voz masculina, aveludada, quente e amigável.\n\n\n\n' +
      'Ritmo de fala moderado, bem articulado.\n\n\n\n' +
      'FALAS:\n\n- Cada bloco deve ter UMA fala do avatar';
    const bloco = extrairBlocoVozAvatar(template);
    expect(bloco).toContain('Voz masculina, aveludada, quente e amigável.');
    expect(bloco).toContain('Ritmo de fala moderado, bem articulado.');
    expect(bloco).not.toMatch(/FALAS:/);
  });

  test('colapsa 3+ quebras de linha seguidas em uma linha em branco só', () => {
    const template = 'VOZ DO AVATAR (OBRIGATÓRIA):\n\nParágrafo 1.\n\n\n\nParágrafo 2.\n\nFALAS:\n...';
    const bloco = extrairBlocoVozAvatar(template);
    expect(bloco).toBe('Parágrafo 1.\n\nParágrafo 2.');
  });

  test('retorna string vazia quando o template não tem a seção', () => {
    expect(extrairBlocoVozAvatar('texto qualquer sem a seção')).toBe('');
  });
});

describe('preencherBlocoVozNoRoteiro — corrige o placeholder que a IA deixa literal', () => {
  const blocoVoz = 'Voz masculina, aveludada, quente e amigável.';

  test('substitui "[REPETIR EXATAMENTE O BLOCO DE VOZ ACIMA]" pelo texto real da voz', () => {
    const texto =
      '🎙️ VOZ DO AVATAR:\n\n[REPETIR EXATAMENTE O BLOCO DE VOZ ACIMA]\n\n🗣️ FALA DO AVATAR:';
    const resultado = preencherBlocoVozNoRoteiro(texto, blocoVoz);
    expect(resultado).toContain(blocoVoz);
    expect(resultado).not.toMatch(/REPETIR EXATAMENTE/i);
  });

  test('substitui todas as ocorrências (um bloco por "aula", vários blocos no roteiro)', () => {
    const texto = '[REPETIR EXATAMENTE O BLOCO DE VOZ ACIMA]\n...\n[REPETIR EXATAMENTE O BLOCO DE VOZ ACIMA]';
    const resultado = preencherBlocoVozNoRoteiro(texto, blocoVoz);
    expect(resultado.split(blocoVoz).length - 1).toBe(2);
  });

  test('é tolerante a variação sem colchetes ou de maiúsculas/minúsculas', () => {
    const texto = 'VOZ: repetir exatamente o bloco de voz acima';
    const resultado = preencherBlocoVozNoRoteiro(texto, blocoVoz);
    expect(resultado).toBe(`VOZ: ${blocoVoz}`);
  });

  test('texto sem o placeholder permanece inalterado', () => {
    const texto = 'Um roteiro qualquer sem o placeholder.';
    expect(preencherBlocoVozNoRoteiro(texto, blocoVoz)).toBe(texto);
  });

  test('sem bloco de voz disponível (template sem a seção), devolve o texto original', () => {
    const texto = '[REPETIR EXATAMENTE O BLOCO DE VOZ ACIMA]';
    expect(preencherBlocoVozNoRoteiro(texto, '')).toBe(texto);
  });
});
