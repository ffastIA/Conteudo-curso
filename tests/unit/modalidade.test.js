const os = require('os');
const fs = require('fs');
const path = require('path');
const skills = require('../../skills');
const { buildPedagogicalContext } = require('../../server');

describe('modalidadeBlock — diretrizes por modalidade', () => {
  test('gera bloco para cada modalidade do enum, tolerante a caixa/acentos', () => {
    for (const m of ['presencial', 'EaD', 'híbrido', 'HÍBRIDO', 'ead']) {
      const bloco = skills.modalidadeBlock(m);
      expect(bloco).toContain(`## Modalidade do Curso: ${m}`);
      expect(bloco).toContain('a Metodologia Pedagógica prevalece');
    }
  });

  test('modalidade ausente ou desconhecida retorna vazio (projetos legados)', () => {
    expect(skills.modalidadeBlock('')).toBe('');
    expect(skills.modalidadeBlock(undefined)).toBe('');
    expect(skills.modalidadeBlock('semipresencial')).toBe('');
  });

  test('distribuição híbrida preenchida entra no bloco com instrução de respeito', () => {
    const bloco = skills.modalidadeBlock('híbrido', { distribuicaoHibrida: '40% presencial / 60% EaD' });
    expect(bloco).toContain('40% presencial / 60% EaD');
    expect(bloco).toContain('respeite-a rigorosamente');
  });

  test('carga síncrona por aula preenchida entra no bloco (EaD)', () => {
    const bloco = skills.modalidadeBlock('EaD', { cargaSincronaPorAula: '15 min por aula' });
    expect(bloco).toContain('15 min por aula');
    expect(bloco).toContain('reserve essa janela');
  });
});

describe('skills — modalidade nos prompts', () => {
  const base = { nome: 'Curso X', publico: 'Jovens', carga: 40, duracao: 120, nivel: 'Básico', modalidade: 'EaD' };

  test('metodologiaSkill exige compatibilidade com a modalidade', () => {
    const s = skills.metodologiaSkill(base);
    expect(s.user).toContain('Modalidade: EaD');
    expect(s.user).toContain('DEVE ser compatível e');
  });

  test('skills geradoras incluem a linha Modalidade', () => {
    expect(skills.ementaSkill(base).user).toContain('Modalidade: EaD');
    expect(skills.planoEnsinoSkill(base).user).toContain('Modalidade: EaD');
    expect(skills.planLessonsSkill({ ...base, planoEnsino: 'x', numAulas: 5 }).user).toContain('Modalidade: EaD');
    expect(skills.planoAulaSkill({ ...base, aula: { titulo: 'A', objetivos: 'o' }, index: 0, total: 1 }).user).toContain('Modalidade: EaD');
    expect(skills.conteudoSkill({ ...base, aula: { titulo: 'A', objetivos: 'o' }, index: 0, total: 1 }).user).toContain('Modalidade: EaD');
    expect(skills.pesquisaWebSkill(base).user).toContain('Modalidade: EaD');
    expect(skills.pesquisaFallbackSkill(base).user).toContain('Modalidade: EaD');
  });

  test('ementa e planos instruem cabeçalho de identificação com modalidade', () => {
    expect(skills.ementaSkill(base).user).toContain('cabeçalho de identificação');
    expect(skills.planoEnsinoSkill(base).user).toContain('cabeçalho de identificação');
    expect(skills.planoAulaSkill({ ...base, aula: { titulo: 'A' }, index: 0, total: 1 }).user).toContain('cabeçalho de identificação');
  });

  test('revisão e melhorias consideram a modalidade via config', () => {
    const config = { nome: 'Curso X', publico: 'Jovens', modalidade: 'EaD' };
    const rev = skills.revisaoQualidadeSkill({ config, aulaIndex: 0, aulaTitulo: 'A', aulaConteudo: 'c' });
    expect(rev.user).toContain('Adequação à Modalidade (EaD)');
    const mel = skills.aplicarMelhoriasSkill({ config, aulaIndex: 0, aulaTitulo: 'A', conteudoAtual: 'c' });
    expect(mel.user).toContain('Modalidade do curso: EaD');
  });

  test('sem modalidade, prompts mantêm o comportamento anterior', () => {
    const semMod = { ...base, modalidade: undefined };
    expect(skills.ementaSkill(semMod).user).not.toContain('Modalidade:');
    const rev = skills.revisaoQualidadeSkill({ config: { nome: 'X' }, aulaIndex: 0, aulaTitulo: 'A', aulaConteudo: 'c' });
    expect(rev.user).not.toContain('Adequação à Modalidade');
  });
});

describe('buildPedagogicalContext — modalidade e fallback de metodologia em disco', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ger-cont-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('inclui bloco de modalidade a partir de sess.config', () => {
    const sess = { config: { nome: 'Curso X', pastaProjeto: tmpDir, modalidade: 'híbrido', distribuicaoHibrida: 'prática presencial, teoria EaD' } };
    const ctx = buildPedagogicalContext(sess);
    expect(ctx).toContain('## Modalidade do Curso: híbrido');
    expect(ctx).toContain('prática presencial, teoria EaD');
  });

  test('sessão perdida: metodologia é relida de scr/metodologia.txt', () => {
    const scr = path.join(tmpDir, 'scr');
    fs.mkdirSync(scr, { recursive: true });
    fs.writeFileSync(path.join(scr, 'metodologia.txt'), 'Metodologia EDITADA pelo usuário', 'utf-8');
    const sess = { config: { nome: 'Curso X', pastaProjeto: tmpDir } }; // sem sess.metodologia
    const ctx = buildPedagogicalContext(sess);
    expect(ctx).toContain('## Metodologia Pedagógica');
    expect(ctx).toContain('Metodologia EDITADA pelo usuário');
  });

  test('sem metodologia em sessão nem em disco, contexto omite o bloco sem erro', () => {
    const sess = { config: { nome: 'Curso X', pastaProjeto: tmpDir } };
    const ctx = buildPedagogicalContext(sess);
    expect(ctx).not.toContain('## Metodologia Pedagógica');
  });

  test('sess.metodologia presente tem precedência sobre o disco', () => {
    const scr = path.join(tmpDir, 'scr');
    fs.mkdirSync(scr, { recursive: true });
    fs.writeFileSync(path.join(scr, 'metodologia.txt'), 'versão antiga em disco', 'utf-8');
    const sess = { config: { nome: 'Curso X', pastaProjeto: tmpDir }, metodologia: 'versão da sessão' };
    const ctx = buildPedagogicalContext(sess);
    expect(ctx).toContain('versão da sessão');
    expect(ctx).not.toContain('versão antiga em disco');
  });
});
