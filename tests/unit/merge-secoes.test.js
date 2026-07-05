const skills = require('../../skills');
const { mergeSecoesConteudo, parseSecoesFixas, removerEcoTitulo, isRespostaMelhoriasCompleta } = require('../../server');

const AULA_ORIGINAL =
  '# Aula 1: Ferramentas Avançadas do CapCut\n\n' +
  'Objetivos da Aula\n\n1. Aprimorar habilidades.\n\n' +
  'Fundamentação Técnica\n\n' +
  'Texto original da fundamentação, com detalhes técnicos.\n\n' +
  'Exemplos Práticos\n\n' +
  'Texto original dos exemplos.\n\n' +
  'Erros Comuns e Pontos de Atenção\n\n' +
  'Texto original dos erros comuns.\n';

describe('mergeSecoesConteudo — patch por seção', () => {
  test('substitui uma seção do meio preservando as demais', () => {
    const patch =
      '<<<SECAO: Exemplos Práticos>>>\n' +
      'Novo exemplo prático revisado, mais detalhado.\n' +
      '<<<FIM_SECAO>>>\n\n' +
      '### Melhorias Aplicadas\n1. Exemplos ampliados';
    const { texto, substituidas, novas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(substituidas).toEqual(['Exemplos Práticos']);
    expect(novas).toEqual([]);
    expect(texto).toContain('Novo exemplo prático revisado, mais detalhado.');
    expect(texto).not.toContain('Texto original dos exemplos.');
    // Demais seções preservadas
    expect(texto).toContain('Texto original da fundamentação, com detalhes técnicos.');
    expect(texto).toContain('Texto original dos erros comuns.');
    // A seção de melhorias NÃO fica misturada no conteúdo da aula
    expect(texto).not.toContain('### Melhorias Aplicadas');
  });

  test('múltiplas seções no mesmo patch', () => {
    const patch =
      '<<<SECAO: Fundamentação Técnica>>>\nNova fundamentação.\n<<<FIM_SECAO>>>\n\n' +
      '<<<SECAO: Erros Comuns e Pontos de Atenção>>>\nNovos erros comuns.\n<<<FIM_SECAO>>>\n';
    const { texto, substituidas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(substituidas.sort()).toEqual(['Erros Comuns e Pontos de Atenção', 'Fundamentação Técnica'].sort());
    expect(texto).toContain('Nova fundamentação.');
    expect(texto).toContain('Novos erros comuns.');
    expect(texto).toContain('Texto original dos exemplos.'); // não tocada
  });

  test('título novo é acrescentado ao final', () => {
    const patch = '<<<SECAO: Discussão Online: Ética na Produção>>>\nConteúdo novo sobre ética.\n<<<FIM_SECAO>>>\n';
    const { texto, novas, substituidas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(novas).toEqual(['Discussão Online: Ética na Produção']);
    expect(substituidas).toEqual([]);
    expect(texto).toContain('Conteúdo novo sobre ética.');
    expect(texto.indexOf('Discussão Online')).toBeGreaterThan(texto.indexOf('Erros Comuns'));
  });

  test('título casa com variação de acentuação/caixa/espaço', () => {
    const patch = '<<<SECAO:   fundamentacao tecnica  >>>\nFundamentação atualizada.\n<<<FIM_SECAO>>>\n';
    const { texto, substituidas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(substituidas).toEqual(['fundamentacao tecnica']);
    expect(texto).toContain('Fundamentação atualizada.');
    expect(texto).not.toContain('Texto original da fundamentação');
  });

  test('sem marcadores <<<SECAO:>>>, retorna o patch como reescrita integral (fallback)', () => {
    const reescritaCompleta = 'Aula inteira reescrita do zero.\n\n### Melhorias Aplicadas\n1. Tudo revisado';
    const { texto, substituidas, novas } = mergeSecoesConteudo(AULA_ORIGINAL, reescritaCompleta);
    expect(texto).toBe(reescritaCompleta);
    expect(substituidas).toEqual([]);
    expect(novas).toEqual([]);
  });

  test('texto original vazio ainda funciona (acrescenta como seção nova)', () => {
    const patch = '<<<SECAO: Introdução>>>\nConteúdo.\n<<<FIM_SECAO>>>\n';
    const { texto, novas } = mergeSecoesConteudo('', patch);
    expect(novas).toEqual(['Introdução']);
    expect(texto).toContain('Conteúdo.');
  });
});

describe('parseSecoesFixas — detecção de cabeçalho isolado por linha em branco', () => {
  test('reconhece cabeçalhos isolados por linha em branco', () => {
    const texto = 'Fundamentação Técnica\n\nCorpo da seção.\n\nExemplos Práticos\n\nOutro corpo.\n';
    const secoes = parseSecoesFixas(texto);
    expect(secoes.map(s => s.titulo)).toEqual(['Fundamentação Técnica', 'Exemplos Práticos']);
  });

  test('ignora frase de corpo que menciona o título de outra seção como substring', () => {
    const texto =
      'Fundamentação Técnica\n\n' +
      'Este texto discute os erros comuns e pontos de atenção que os alunos costumam cometer.\n\n' +
      'Erros Comuns e Pontos de Atenção\n\n' +
      'Conteúdo real da seção.\n';
    const secoes = parseSecoesFixas(texto);
    expect(secoes.map(s => s.titulo)).toEqual(['Fundamentação Técnica', 'Erros Comuns e Pontos de Atenção']);
  });

  test('ignora linha curta terminada em pontuação, mesmo isolada por linha em branco', () => {
    const texto = 'Fundamentação Técnica\n\nUma frase curta.\n\nOutra seção\n\nCorpo.\n';
    const secoes = parseSecoesFixas(texto);
    expect(secoes.map(s => s.titulo)).toEqual(['Fundamentação Técnica', 'Outra seção']);
  });
});

describe('mergeSecoesConteudo — regressão do bug de duplicação (título mencionado em texto corrido)', () => {
  const AULA_COM_MENCAO =
    'Objetivos da Aula\n\nObjetivo especial.\n\n' +
    'Fundamentação Técnica\n\n' +
    'Este texto discute os erros comuns e pontos de atenção que os alunos costumam cometer, ' +
    'mas não é o título da seção.\n\n' +
    'Erros Comuns e Pontos de Atenção\n\n' +
    'Conteúdo real da seção de erros comuns.\n';

  test('não confunde menção em texto corrido com o cabeçalho real', () => {
    const patch = '<<<SECAO: Erros Comuns e Pontos de Atenção>>>\nNovo conteúdo de erros comuns.\n<<<FIM_SECAO>>>\n';
    const { texto, substituidas } = mergeSecoesConteudo(AULA_COM_MENCAO, patch);
    expect(substituidas).toEqual(['Erros Comuns e Pontos de Atenção']);
    expect(texto).toContain('Novo conteúdo de erros comuns.');
    expect(texto).toContain('Este texto discute os erros comuns e pontos de atenção');
    expect(texto).not.toContain('Conteúdo real da seção de erros comuns.');
  });
});

describe('mergeSecoesConteudo — deduplicação de blocos repetidos no mesmo patch', () => {
  test('mantém só o último bloco quando o mesmo título aparece duas vezes no patch', () => {
    const patch =
      '<<<SECAO: Exemplos Práticos>>>\nPrimeira tentativa (truncada e reenviada).\n<<<FIM_SECAO>>>\n' +
      '<<<SECAO: Exemplos Práticos>>>\nVersão final da continuação.\n<<<FIM_SECAO>>>\n';
    const { texto, substituidas, suspeitas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(substituidas).toEqual(['Exemplos Práticos']);
    expect(texto).toContain('Versão final da continuação.');
    expect(texto).not.toContain('Primeira tentativa');
    expect(suspeitas.some(s => s.motivo === 'duplicado_no_patch')).toBe(true);
  });
});

describe('mergeSecoesConteudo — título ambíguo no original', () => {
  const AULA_AMBIGUA =
    'Objetivo 1\n\nFundamentação Técnica\n\nPrimeira fundamentação (objetivo 1).\n\n' +
    'Objetivo 2\n\nFundamentação Técnica\n\nSegunda fundamentação (objetivo 2).\n';

  test('aplica só à primeira ocorrência e sinaliza a ambiguidade', () => {
    const patch = '<<<SECAO: Fundamentação Técnica>>>\nFundamentação revisada.\n<<<FIM_SECAO>>>\n';
    const { texto, suspeitas } = mergeSecoesConteudo(AULA_AMBIGUA, patch);
    expect(texto).toContain('Fundamentação revisada.');
    expect(texto).toContain('Segunda fundamentação (objetivo 2).');
    expect(texto).not.toContain('Primeira fundamentação (objetivo 1).');
    expect(suspeitas.some(s => s.motivo === 'titulo_ambiguo' && s.ocorrencias === 2)).toBe(true);
  });
});

describe('mergeSecoesConteudo — rede de segurança pós-merge', () => {
  test('rejeita o merge se o corpo novo introduzir um cabeçalho duplicado por acidente', () => {
    const corpoComCabecalhoAcidental =
      'Início do novo exemplo.\n\nFundamentação Técnica\n\nEssa frase parece um cabeçalho por acidente.';
    const patch = `<<<SECAO: Exemplos Práticos>>>\n${corpoComCabecalhoAcidental}\n<<<FIM_SECAO>>>\n`;
    const { texto, substituidas, suspeitas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(texto).toBe(AULA_ORIGINAL);
    expect(substituidas).toEqual([]);
    expect(suspeitas.some(s => s.motivo === 'merge_rejeitado_duplicacao')).toBe(true);
  });
});

describe('isRespostaMelhoriasCompleta — bloco de patch aberto sem fechamento', () => {
  test('bloco <<<SECAO:>>> sem <<<FIM_SECAO>>> correspondente é incompleta', () => {
    const texto = '<<<SECAO: Exemplos>>>\ntexto cortado no meio';
    expect(isRespostaMelhoriasCompleta(texto, 'length')).toBe(false);
    expect(isRespostaMelhoriasCompleta(texto, 'stop')).toBe(false);
  });

  test('blocos balanceados + seção de melhorias é completa', () => {
    const texto = '<<<SECAO: Exemplos>>>\ntexto\n<<<FIM_SECAO>>>\n\n### Melhorias Aplicadas\n1. ok';
    expect(isRespostaMelhoriasCompleta(texto, 'stop')).toBe(true);
  });

  test('múltiplos blocos balanceados', () => {
    const texto =
      '<<<SECAO: A>>>\nx\n<<<FIM_SECAO>>>\n<<<SECAO: B>>>\ny\n<<<FIM_SECAO>>>\n\n### Melhorias Aplicadas\n1. ok';
    expect(isRespostaMelhoriasCompleta(texto, 'stop')).toBe(true);
  });
});

describe('aplicarMelhoriasSkill — prompt de patch seccional', () => {
  test('instrui o formato de patch e a cópia literal do título', () => {
    const s = skills.aplicarMelhoriasSkill({
      config: { nome: 'X' }, aulaIndex: 0, aulaTitulo: 'A', conteudoAtual: 'c',
      melhorias: ['Adicionar exemplos']
    });
    expect(s.user).toContain('<<<SECAO:');
    expect(s.user).toContain('<<<FIM_SECAO>>>');
    expect(s.user).toContain('NÃO reescreva a aula inteira');
    expect(s.user).toContain('copie o título EXATAMENTE');
  });
});

describe('removerEcoTitulo', () => {
  test('remove a primeira linha quando ela ecoa exatamente o título', () => {
    const corpo = 'Fundamentação Técnica\n\nConteúdo real da seção aqui.';
    expect(removerEcoTitulo(corpo, 'fundamentacao tecnica')).toBe('Conteúdo real da seção aqui.');
  });

  test('tolera linhas em branco antes do eco', () => {
    const corpo = '\n\nFundamentação Técnica\n\nConteúdo real.';
    expect(removerEcoTitulo(corpo, 'fundamentacao tecnica')).toBe('Conteúdo real.');
  });

  test('não remove nada quando a primeira linha não é o título', () => {
    const corpo = 'Conteúdo direto, sem eco de título.';
    expect(removerEcoTitulo(corpo, 'fundamentacao tecnica')).toBe(corpo);
  });

  test('não remove menção parcial ou diferente do título', () => {
    const corpo = 'Fundamentação Técnica e Conceitos Avançados\n\nConteúdo real.';
    expect(removerEcoTitulo(corpo, 'fundamentacao tecnica')).toBe(corpo);
  });
});

describe('mergeSecoesConteudo — regressão do falso positivo por eco de título', () => {
  test('corpo que ecoa o título da seção não é rejeitado pela rede de segurança', () => {
    const patch = '<<<SECAO: Fundamentação Técnica>>>\nFundamentação Técnica\n\nConteúdo revisado e completo.\n<<<FIM_SECAO>>>\n';
    const { texto, substituidas, suspeitas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(substituidas).toEqual(['Fundamentação Técnica']);
    expect(suspeitas.some(s => s.motivo === 'merge_rejeitado_duplicacao')).toBe(false);
    expect(texto).toContain('Conteúdo revisado e completo.');
    // O eco não sobrevive como um segundo "Fundamentação Técnica" isolado no resultado.
    const contagem = (texto.match(/Fundamenta[cç][aã]o T[ée]cnica/gi) || []).length;
    expect(contagem).toBe(1);
  });

  // A rejeição de um cabeçalho DIFERENTE introduzido por acidente (não um eco
  // do próprio título) já é coberta por "rede de segurança pós-merge" acima —
  // continua passando sem alteração, confirmando que a sanitização de eco não
  // enfraquece essa proteção.
});
