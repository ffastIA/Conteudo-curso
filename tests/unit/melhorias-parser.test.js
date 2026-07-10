const skills = require('../../skills');
const { parseMelhoriasEstruturadas, extractResumoMelhorias } = require('../../server');

describe('parseMelhoriasEstruturadas — seção "Melhorias a serem Aplicadas"', () => {
  const DOC =
    'Relatório de revisão...\n\n# Aula 1: Intro\nTexto livre do revisor.\n\n' +
    'Melhorias a serem Aplicadas\n\n' +
    'Aula 01\nAdicionar exemplos práticos\nRevisar vocabulário técnico\n\n' +
    'Aula 02\n- Incluir exercício de fixação\n\n' +
    'Aula 03\nNenhuma\n';

  test('extrai itens por aula, uma linha = uma melhoria (sem exigir marcador)', () => {
    const r = parseMelhoriasEstruturadas(DOC, 3);
    expect(r.porAula[0]).toEqual(['Adicionar exemplos práticos', 'Revisar vocabulário técnico']);
    expect(r.porAula[1]).toEqual(['Incluir exercício de fixação']);
  });

  test('remove prefixos de lista variados', () => {
    const doc = 'Melhorias a serem Aplicadas\nAula 01\n- item a\n• item b\n2. item c\n3) item d\n';
    const r = parseMelhoriasEstruturadas(doc, 1);
    expect(r.porAula[0]).toEqual(['item a', 'item b', 'item c', 'item d']);
  });

  test('palavra reservada Nenhuma pula a aula e trava o bloco', () => {
    const r = parseMelhoriasEstruturadas(DOC, 3);
    expect(r.porAula[2]).toEqual([]);
    const doc = 'Melhorias a serem Aplicadas\nAula 01\nitem antes\nNenhuma\nitem depois ignorado\n';
    expect(parseMelhoriasEstruturadas(doc, 1).porAula[0]).toEqual([]);
  });

  test('mapeia pelo número: blocos fora de ordem e ausentes', () => {
    const doc = 'Melhorias a serem Aplicadas\nAula 03\nmelhoria da três\n\nAula 01\nmelhoria da um\n';
    const r = parseMelhoriasEstruturadas(doc, 3);
    expect(r.porAula[0]).toEqual(['melhoria da um']);
    expect(r.porAula[1]).toEqual([]);
    expect(r.porAula[2]).toEqual(['melhoria da três']);
  });

  test('número fora do intervalo é ignorado com aviso', () => {
    const doc = 'Melhorias a serem Aplicadas\nAula 07\nitem perdido\nAula 01\nitem válido\n';
    const r = parseMelhoriasEstruturadas(doc, 2);
    expect(r.porAula[0]).toEqual(['item válido']);
    expect(r.avisos.length).toBe(1);
    expect(r.avisos[0]).toContain('Aula 7');
  });

  test('usa a última ocorrência da âncora (frase repetida no corpo)', () => {
    const doc =
      'melhorias a serem aplicadas foram discutidas acima? não, isto é corpo\n' +
      'Melhorias a serem aplicadas\nAula 01\nprimeira seção falsa\n\n' +
      'MELHORIAS A SEREM APLICADAS\nAula 01\nitem verdadeiro\n';
    const r = parseMelhoriasEstruturadas(doc, 1);
    expect(r.porAula[0]).toEqual(['item verdadeiro']);
  });

  test('âncora tolerante a acentos e prefixo #', () => {
    const doc = '## MELHORIAS A SEREM APLICADAS\nAula 01\nitem x\n';
    expect(parseMelhoriasEstruturadas(doc, 1).porAula[0]).toEqual(['item x']);
  });

  test('seção ausente retorna null (aciona fallback legado)', () => {
    expect(parseMelhoriasEstruturadas('Documento antigo sem a seção.\nAula 1: ...\nObservações do Revisor\nalgo', 2)).toBeNull();
    expect(parseMelhoriasEstruturadas('', 2)).toBeNull();
  });

  test('aceita "Aula 1" sem zero à esquerda e com título após', () => {
    const doc = 'Melhorias a serem Aplicadas\nAula 1: Introdução\nitem um\n';
    expect(parseMelhoriasEstruturadas(doc, 1).porAula[0]).toEqual(['item um']);
  });

  test('itens após o marcador [user] entram na lista e sinalizam a aula como forçada', () => {
    const doc =
      'Melhorias a serem Aplicadas\n' +
      'Aula 01\nsugestão da IA\n[user]\nitem do revisor\n\n' +
      'Aula 02\noutra sugestão\n[user]\n';
    const r = parseMelhoriasEstruturadas(doc, 2);
    expect(r.porAula[0]).toEqual(['sugestão da IA', 'item do revisor']);
    expect(r.forcadoPorAula[0]).toBe(true);
  });

  test('marcador [user] sem itens preenchidos não força nada', () => {
    const doc = 'Melhorias a serem Aplicadas\nAula 01\nsugestão da IA\n[user]\n';
    const r = parseMelhoriasEstruturadas(doc, 1);
    expect(r.porAula[0]).toEqual(['sugestão da IA']);
    expect(r.forcadoPorAula[0]).toBe(false);
  });

  test('aula sem nenhum bloco ou marcador não é sinalizada como forçada', () => {
    const doc = 'Melhorias a serem Aplicadas\nAula 01\nsugestão da IA\n';
    const r = parseMelhoriasEstruturadas(doc, 2);
    expect(r.forcadoPorAula).toEqual([false, false]);
  });

  test('marcador tolerante a variações de grafia ([User], [USER], [user].)', () => {
    expect(parseMelhoriasEstruturadas('Melhorias a serem Aplicadas\nAula 01\n[User]\nitem\n', 1).forcadoPorAula[0]).toBe(true);
    expect(parseMelhoriasEstruturadas('Melhorias a serem Aplicadas\nAula 01\n[USER]\nitem\n', 1).forcadoPorAula[0]).toBe(true);
    expect(parseMelhoriasEstruturadas('Melhorias a serem Aplicadas\nAula 01\n[user].\nitem\n', 1).forcadoPorAula[0]).toBe(true);
  });

  test('Nenhuma após itens [user] no mesmo bloco reseta a lista e a sinalização de forçada', () => {
    const doc = 'Melhorias a serem Aplicadas\nAula 01\n[user]\nitem forçado\nNenhuma\n';
    const r = parseMelhoriasEstruturadas(doc, 1);
    expect(r.porAula[0]).toEqual([]);
    expect(r.forcadoPorAula[0]).toBe(false);
  });

  // Caso real observado em produção: revisor escreveu "[user] texto" na mesma
  // linha (mesmo padrão já usado pela tag [Critério] deste app), não o
  // marcador sozinho numa linha separada. O prefixo precisa ser removido do
  // texto (senão "[user]" vaza literalmente para o prompt do modelo) e a
  // aula sinalizada como forçada mesmo assim.
  test('[user] como prefixo do item (mesma linha) força só aquele item e remove o prefixo do texto', () => {
    const doc =
      'Melhorias a serem Aplicadas\n' +
      'Aula 01\n[user] Incluir conceitos mais modernos dos tipos de memória ROM\n';
    const r = parseMelhoriasEstruturadas(doc, 1);
    expect(r.porAula[0]).toEqual(['Incluir conceitos mais modernos dos tipos de memória ROM']);
    expect(r.forcadoPorAula[0]).toBe(true);
  });

  test('[user] inline misturado com itens normais no mesmo bloco', () => {
    const doc =
      'Melhorias a serem Aplicadas\n' +
      'Aula 01\nsugestão da IA\n[user] item forçado do revisor\noutra sugestão da IA\n';
    const r = parseMelhoriasEstruturadas(doc, 1);
    expect(r.porAula[0]).toEqual(['sugestão da IA', 'item forçado do revisor', 'outra sugestão da IA']);
    expect(r.forcadoPorAula[0]).toBe(true);
  });

  test('[user] inline tolerante a variações de grafia e sem texto após não gera item vazio', () => {
    expect(parseMelhoriasEstruturadas('Melhorias a serem Aplicadas\nAula 01\n[User] texto\n', 1).porAula[0]).toEqual(['texto']);
    expect(parseMelhoriasEstruturadas('Melhorias a serem Aplicadas\nAula 01\n[user]. texto\n', 1).porAula[0]).toEqual(['texto']);
    const semTexto = parseMelhoriasEstruturadas('Melhorias a serem Aplicadas\nAula 01\n[user] \n', 1);
    expect(semTexto.porAula[0]).toEqual([]);
    expect(semTexto.forcadoPorAula[0]).toBe(false);
  });
});

describe('extractResumoMelhorias — bullets da revisão de uma aula', () => {
  test('extrai bullets da subseção, parando na próxima seção', () => {
    const texto =
      '### Nota de Qualidade\nNota: 0.8\n\n' +
      '### Resumo de Melhorias Propostas\n- Adicionar exemplos\n- Revisar tempos\n\n' +
      '### Observações do Revisor\n';
    expect(extractResumoMelhorias(texto)).toEqual(['Adicionar exemplos', 'Revisar tempos']);
  });

  test('"Nenhuma" e subseção ausente retornam lista vazia', () => {
    expect(extractResumoMelhorias('### Resumo de Melhorias Propostas\nNenhuma\n\n### Observações do Revisor\n')).toEqual([]);
    expect(extractResumoMelhorias('revisão sem a subseção')).toEqual([]);
  });
});

describe('skills — prompts do ciclo estruturado', () => {
  test('revisaoQualidadeSkill exige o Resumo de Melhorias Propostas', () => {
    const s = skills.revisaoQualidadeSkill({ config: { nome: 'X' }, aulaIndex: 0, aulaTitulo: 'A', aulaConteudo: 'c' });
    expect(s.user).toContain('### Resumo de Melhorias Propostas');
    expect(s.user).toContain('UM POR LINHA');
  });

  test('aplicarMelhoriasSkill com lista: numeração e rastreabilidade por número', () => {
    const s = skills.aplicarMelhoriasSkill({
      config: { nome: 'X' }, aulaIndex: 0, aulaTitulo: 'A', conteudoAtual: 'c',
      melhorias: ['Adicionar exemplos', 'Revisar tempos']
    });
    expect(s.user).toContain('1. Adicionar exemplos');
    expect(s.user).toContain('2. Revisar tempos');
    expect(s.user).toContain('PELO NÚMERO');
    expect(s.user).toContain('Não omita nenhum número');
  });

  test('aplicarMelhoriasSkill sem lista mantém o modo legado', () => {
    const s = skills.aplicarMelhoriasSkill({
      config: { nome: 'X' }, aulaIndex: 0, aulaTitulo: 'A', conteudoAtual: 'c',
      observacoesRevisor: 'texto livre do revisor'
    });
    expect(s.user).toContain('texto livre do revisor');
    expect(s.user).toContain('Liste em bullets curtos cada melhoria aplicada');
    expect(s.user).not.toContain('PELO NÚMERO');
  });
});
