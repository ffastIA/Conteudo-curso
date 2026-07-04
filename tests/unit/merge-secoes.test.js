const skills = require('../../skills');
const { mergeSecoesConteudo, isRespostaMelhoriasCompleta } = require('../../server');

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
