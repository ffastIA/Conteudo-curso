const skills = require('../../skills');
const { replaceLessonBlock, extractLessonBlock, extractScopeAlerts } = require('../../server');

const PLANO =
  '# Aula 1: Introdução\n\nCorpo da aula 1.\nAtividade A.\n\n' +
  '# Aula 2: Listas\n\nCorpo da aula 2.\nAtividade B.\n\n' +
  '# Aula 3: Laços\n\nCorpo da aula 3.\nAtividade C.\n';

describe('replaceLessonBlock — substituição seccional do plano de aula', () => {
  test('substitui a aula do meio preservando as demais e o heading', () => {
    const novo = replaceLessonBlock(PLANO, 1, 'NOVO corpo da aula 2.');
    expect(novo).toContain('# Aula 2: Listas');
    expect(novo).toContain('NOVO corpo da aula 2.');
    expect(novo).not.toContain('Corpo da aula 2.');
    expect(novo).toContain('Corpo da aula 1.\nAtividade A.');
    expect(novo).toContain('Corpo da aula 3.\nAtividade C.');
  });

  test('substitui primeira e última aula', () => {
    const p1 = replaceLessonBlock(PLANO, 0, 'X1');
    expect(p1.startsWith('# Aula 1: Introdução\n\nX1')).toBe(true);
    expect(p1).toContain('Corpo da aula 2.');
    const p3 = replaceLessonBlock(PLANO, 2, 'X3');
    expect(p3).toContain('# Aula 3: Laços\n\nX3');
    expect(p3).toContain('Corpo da aula 1.');
  });

  test('índice inexistente ou texto vazio retorna o original', () => {
    expect(replaceLessonBlock(PLANO, 9, 'X')).toBe(PLANO);
    expect(replaceLessonBlock('', 0, 'X')).toBe('');
  });

  test('round-trip com extractLessonBlock: seção substituída é extraível', () => {
    const novo = replaceLessonBlock(PLANO, 1, 'Sequência atualizada.');
    expect(extractLessonBlock(novo, 1)).toBe('# Aula 2: Listas\n\nSequência atualizada.');
    expect(extractLessonBlock(novo, 0)).toContain('Corpo da aula 1.');
  });
});

describe('extractScopeAlerts — alertas de escopo fora do plano persistido', () => {
  test('extrai alertas e limpa a seção', () => {
    const texto = 'Corpo do plano.\n\n> ⚠️ ALERTA DE ESCOPO: Docker não consta da ementa\n> ⚠️ ALERTA DE ESCOPO: Kubernetes não consta do plano de ensino';
    const { secao, alertas } = extractScopeAlerts(texto);
    expect(alertas).toEqual(['Docker não consta da ementa', 'Kubernetes não consta do plano de ensino']);
    expect(secao).toBe('Corpo do plano.');
  });

  test('sem alertas, seção fica intacta', () => {
    const { secao, alertas } = extractScopeAlerts('Só o corpo.\nSem alertas.');
    expect(alertas).toEqual([]);
    expect(secao).toBe('Só o corpo.\nSem alertas.');
  });
});

describe('realinharPlanoAulaSkill — prompt de realinhamento', () => {
  const args = {
    nome: 'Curso X', duracao: 120, nivel: 'Básico', publico: 'Jovens',
    aula: { titulo: 'Listas', objetivos: 'compreender listas' }, index: 1, total: 3,
    planoAulaTrechoAtual: '# Aula 2: Listas\n\nAtividade antiga.',
    conteudoMelhorado: 'Conteúdo melhorado da aula.',
    ementa: 'Ementa oficial.', planoEnsinoResumo: 'Módulos oficiais.'
  };

  test('contém seção atual, conteúdo melhorado e escopo oficial', () => {
    const s = skills.realinharPlanoAulaSkill(args);
    expect(s.user).toContain('Atividade antiga.');
    expect(s.user).toContain('Conteúdo melhorado da aula.');
    expect(s.user).toContain('Ementa oficial.');
    expect(s.user).toContain('Módulos oficiais.');
  });

  test('exige manter objetivos/escopo e devolver só o corpo da seção', () => {
    const s = skills.realinharPlanoAulaSkill(args);
    expect(s.user).toContain('Objetivos (IMUTÁVEIS)');
    expect(s.user).toContain('SEM a linha de título');
    expect(s.user).toContain('# Aula 2:');
    expect(s.system).toContain('sem jamais alterar objetivos');
  });

  test('define o formato exato do alerta de escopo', () => {
    expect(skills.realinharPlanoAulaSkill(args).user).toContain('> ⚠️ ALERTA DE ESCOPO:');
  });

  test('injeta diretrizes de nível e peso alto; sem nível fica neutro', () => {
    const s = skills.realinharPlanoAulaSkill(args);
    expect(s.user).toContain('## Diretrizes de Nível — Básico');
    expect(s.system).toContain('PESO ALTO');
    const sem = skills.realinharPlanoAulaSkill({ ...args, nivel: undefined });
    expect(sem.user).not.toContain('## Diretrizes de Nível');
  });

  test('usa o modelo econômico', () => {
    expect(skills.realinharPlanoAulaSkill(args).model).toBe(skills.MODEL_ECONOMY);
  });
});
