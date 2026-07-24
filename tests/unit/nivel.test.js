const skills = require('../../skills');

describe('nivelBlock — diretrizes por nível de conteúdo', () => {
  test('gera bloco geral para cada nível, tolerante a caixa/acentos', () => {
    for (const n of ['Básico', 'Intermediário', 'Avançado', 'básico', 'AVANCADO']) {
      const bloco = skills.nivelBlock(n);
      expect(bloco).toContain(`## Diretrizes de Nível — ${n}`);
      expect(bloco).toContain('Taxonomia de Bloom');
    }
  });

  test('variante pesquisa direciona o tipo de fonte', () => {
    expect(skills.nivelBlock('Básico', 'pesquisa')).toContain('guias introdutórios');
    expect(skills.nivelBlock('Avançado', 'pesquisa')).toContain('benchmarks');
    expect(skills.nivelBlock('Intermediário', 'pesquisa')).toContain('documentação oficial');
  });

  test('nível ausente ou desconhecido retorna vazio (projetos legados)', () => {
    expect(skills.nivelBlock('')).toBe('');
    expect(skills.nivelBlock(undefined)).toBe('');
    expect(skills.nivelBlock('expert')).toBe('');
  });

  test('diretrizes refletem o alvo de Bloom de cada nível', () => {
    expect(skills.nivelBlock('Básico')).toContain('lembrar, entender e aplicar');
    expect(skills.nivelBlock('Intermediário')).toContain('aplicar e analisar');
    expect(skills.nivelBlock('Avançado')).toContain('analisar, avaliar e criar');
  });
});

describe('skills — nível nos prompts', () => {
  const base = { nome: 'Curso X', publico: 'Jovens', carga: 40, duracao: 120, nivel: 'Básico', modalidade: 'presencial' };
  const aula = { titulo: 'A', objetivos: 'o', texto: 'conteúdo' };

  test('skills geradoras injetam o bloco de diretrizes do nível', () => {
    expect(skills.ementaSkill(base).user).toContain('## Diretrizes de Nível — Básico');
    expect(skills.planoEnsinoSkill(base).user).toContain('## Diretrizes de Nível — Básico');
    expect(skills.planLessonsSkill({ ...base, planoEnsino: 'x', numAulas: 5 }).user).toContain('## Diretrizes de Nível — Básico');
    expect(skills.planoAulaSkill({ ...base, aula, index: 0, total: 1 }).user).toContain('## Diretrizes de Nível — Básico');
    expect(skills.conteudoSkill({ ...base, aula, index: 0, total: 1 }).user).toContain('## Diretrizes de Nível — Básico');
    expect(skills.metodologiaSkill(base).user).toContain('## Diretrizes de Nível — Básico');
    expect(skills.estiloVisualSkill({ ...base, objetivos: 'obj' }).user).toContain('## Diretrizes de Nível — Básico');
  });

  test('pesquisas usam a variante pesquisa do nível', () => {
    expect(skills.pesquisaWebSkill(base).user).toContain('Direcionamento da pesquisa pelo nível (Básico)');
    expect(skills.pesquisaFallbackSkill(base).user).toContain('Direcionamento da pesquisa pelo nível (Básico)');
  });

  test('system das skills principais declara PESO ALTO do nível', () => {
    expect(skills.ementaSkill(base).system).toContain('PESO ALTO');
    expect(skills.planoEnsinoSkill(base).system).toContain('PESO ALTO');
    expect(skills.planoAulaSkill({ ...base, aula, index: 0, total: 1 }).system).toContain('PESO ALTO');
    expect(skills.conteudoSkill({ ...base, aula, index: 0, total: 1 }).system).toContain('PESO ALTO');
  });

  test('cabeçalho de identificação inclui o Nível', () => {
    expect(skills.ementaSkill(base).user).toContain(', Nível)');
    expect(skills.planoEnsinoSkill(base).user).toContain(', Nível)');
    expect(skills.planoAulaSkill({ ...base, aula, index: 0, total: 1 }).user).toContain(', Nível)');
  });

  test('revisão avalia adequação ao nível e melhorias o preservam', () => {
    const config = { nome: 'X', publico: 'Y', nivel: 'Básico' };
    const rev = skills.revisaoQualidadeSkill({ config, aulaIndex: 0, aulaTitulo: 'A', aulaConteudo: 'c' });
    expect(rev.user).toContain('Adequação ao Nível Declarado (Básico)');
    const mel = skills.aplicarMelhoriasSkill({ config, aulaIndex: 0, aulaTitulo: 'A', conteudoAtual: 'c' });
    expect(mel.user).toContain('## Diretrizes de Nível — Básico');
  });

  test('sem nível reconhecido, prompts não ganham bloco de diretrizes', () => {
    const semNivel = { ...base, nivel: '' };
    expect(skills.ementaSkill(semNivel).user).not.toContain('## Diretrizes de Nível');
    const rev = skills.revisaoQualidadeSkill({ config: { nome: 'X' }, aulaIndex: 0, aulaTitulo: 'A', aulaConteudo: 'c' });
    expect(rev.user).not.toContain('Adequação ao Nível Declarado');
  });

  test('bloco BNCC permanece intacto e distinto do nível de conteúdo', () => {
    const s = skills.ementaSkill({ ...base, bnccContext: '## Alinhamento BNCC — EM\n- [EM01] Competência X' });
    expect(s.user).toContain('## Alinhamento BNCC — EM');
    expect(s.user).toContain('## Diretrizes de Nível — Básico');
  });
});
