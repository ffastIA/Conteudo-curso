'use strict';

const {
  ementaSkill,
  planoEnsinoSkill,
  metodologiaSkill,
  qualidadeSkill,
  MODEL_ECONOMY
} = require('../../skills');

const BASE_CONFIG = {
  nome: 'Curso de Node.js',
  publico: 'Desenvolvedores júnior',
  carga: '40',
  nivel: 'intermediario',
  objetivos: 'Aprender Node.js',
  duracao: '60'
};

// ── Grupo 4.1 / 4.2: ementaSkill — estrutura e propagação de erro ─────────────
describe('ementaSkill', () => {
  test('retorna objeto com model, system e user', () => {
    const skill = ementaSkill(BASE_CONFIG);
    expect(skill).toHaveProperty('model');
    expect(skill).toHaveProperty('system');
    expect(skill).toHaveProperty('user');
  });

  test('usa MODEL_ECONOMY', () => {
    const skill = ementaSkill(BASE_CONFIG);
    expect(skill.model).toBe(MODEL_ECONOMY);
  });

  test('inclui nome do curso no prompt', () => {
    const skill = ementaSkill(BASE_CONFIG);
    expect(skill.user).toContain('Node.js');
  });
});

// ── Grupo 4.3: planoEnsinoSkill — parâmetros pedagógicos opcionais ────────────
describe('planoEnsinoSkill — parâmetros pedagógicos opcionais', () => {
  test('chamada sem metodologia e sem bnccContext não lança erro', () => {
    expect(() => {
      planoEnsinoSkill({ ...BASE_CONFIG, ementa: 'Ementa teste', pesquisa: '' });
    }).not.toThrow();
  });

  test('chamada sem pedagógicos retorna objeto válido', () => {
    const skill = planoEnsinoSkill({ ...BASE_CONFIG, ementa: 'Ementa' });
    expect(skill.model).toBeDefined();
    expect(skill.user).toBeDefined();
  });

  test('chamada com metodologia injeta o texto no prompt', () => {
    const skill = planoEnsinoSkill({
      ...BASE_CONFIG,
      ementa: 'Ementa',
      metodologia: 'Aprendizagem Baseada em Projetos'
    });
    expect(skill.user).toContain('Aprendizagem Baseada em Projetos');
  });

  test('chamada com bnccContext injeta o texto no prompt', () => {
    const skill = planoEnsinoSkill({
      ...BASE_CONFIG,
      ementa: 'Ementa',
      bnccContext: '## Alinhamento BNCC\n- EF09CI14'
    });
    expect(skill.user).toContain('EF09CI14');
  });
});

// ── Grupo 4.4: metodologiaSkill ───────────────────────────────────────────────
describe('metodologiaSkill', () => {
  test('retorna objeto com model, system e user', () => {
    const skill = metodologiaSkill({
      nome: 'Curso de Python',
      publico: 'Estudantes universitários',
      carga: '60',
      nivel: 'basico',
      proporcaoTeoricoPratico: '50% teórico / 50% prático'
    });
    expect(skill).toHaveProperty('model', MODEL_ECONOMY);
    expect(skill).toHaveProperty('system');
    expect(skill).toHaveProperty('user');
  });

  test('inclui nome do curso e nível no prompt', () => {
    const skill = metodologiaSkill({
      nome: 'Curso de Python',
      publico: 'Estudantes',
      carga: '60',
      nivel: 'basico'
    });
    expect(skill.user).toContain('Python');
    expect(skill.user).toContain('basico');
  });
});

// ── Grupo 4.5: qualidadeSkill ─────────────────────────────────────────────────
describe('qualidadeSkill', () => {
  test('retorna objeto com model, system e user', () => {
    const skill = qualidadeSkill({
      config: BASE_CONFIG,
      ementa: 'Ementa do curso',
      planoEnsino: 'Plano de ensino',
      planoAula: 'Plano de aula',
      resumosAulas: 'Resumo aula 1',
      metodologia: 'ABP',
      bncc: { ativo: false, itens: [] }
    });
    expect(skill).toHaveProperty('model', MODEL_ECONOMY);
    expect(skill).toHaveProperty('system');
    expect(skill).toHaveProperty('user');
  });

  test('prompt inclui ementa e nome do curso', () => {
    const skill = qualidadeSkill({
      config: BASE_CONFIG,
      ementa: 'Ementa do curso de Node.js',
      planoEnsino: 'Plano',
      planoAula: 'Aula'
    });
    expect(skill.user).toContain('Node.js');
    expect(skill.user).toContain('Ementa do curso de Node.js');
  });

  test('com BNCC ativo injeta itens no prompt', () => {
    const skill = qualidadeSkill({
      config: BASE_CONFIG,
      ementa: 'Ementa',
      planoEnsino: 'Plano',
      planoAula: 'Aula',
      bncc: {
        ativo: true,
        itens: [{ codigo: 'EF09CI14', descricao: 'Tecnologias digitais' }]
      }
    });
    expect(skill.user).toContain('EF09CI14');
  });
});
