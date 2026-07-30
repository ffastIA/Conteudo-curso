'use strict';

const skills = require('../../skills');

describe('estimarPalavrasAlvo — heurística de duração do roteiro de avatar', () => {
  test('~2,5 palavras por segundo', () => {
    expect(skills.estimarPalavrasAlvo(15)).toBe(38); // 15 * 2.5 = 37.5 -> arredonda
    expect(skills.estimarPalavrasAlvo(30)).toBe(75);
    expect(skills.estimarPalavrasAlvo(120)).toBe(300);
  });

  test('duração maior gera alvo de palavras maior', () => {
    expect(skills.estimarPalavrasAlvo(120)).toBeGreaterThan(skills.estimarPalavrasAlvo(15));
  });
});

describe('roteiroAvatarSkill', () => {
  const base = {
    aulaTitulo: 'Memórias RAM e ROM',
    aulaTexto: 'Conteúdo técnico da aula sobre memórias RAM e ROM.',
    segundos: 30,
    publico: 'Jovens de 16 a 18 anos',
    nivel: 'intermediario',
    metodologia: '',
    bnccContext: ''
  };

  test('usa o modelo econômico', () => {
    const skill = skills.roteiroAvatarSkill(base);
    expect(skill.model).toBe(skills.MODEL_ECONOMY);
  });

  test('system não pede o formato em blocos da Etapa 9 (## BLOCO, VOZ DO AVATAR)', () => {
    const skill = skills.roteiroAvatarSkill(base);
    expect(skill.system).not.toMatch(/## BLOCO|VOZ DO AVATAR/i);
    expect(skill.system.toLowerCase()).toContain('texto corrido');
  });

  test('user inclui título da aula, público, nível e o alvo de palavras', () => {
    const skill = skills.roteiroAvatarSkill(base);
    expect(skill.user).toContain('Memórias RAM e ROM');
    expect(skill.user).toContain('Jovens de 16 a 18 anos');
    expect(skill.user).toContain('intermediario');
    expect(skill.user).toContain(String(skills.estimarPalavrasAlvo(30)));
  });

  test('trunca o conteúdo da aula em 1500 caracteres', () => {
    const textoLongo = 'a'.repeat(2000);
    const skill = skills.roteiroAvatarSkill({ ...base, aulaTexto: textoLongo });
    expect(skill.user).toContain('a'.repeat(1500) + '...');
    expect(skill.user).not.toContain('a'.repeat(1501));
  });
});
