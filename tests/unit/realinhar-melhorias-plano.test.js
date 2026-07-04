const skills = require('../../skills');

describe('realinharPlanoAulaSkill — melhorias que descrevem o plano de aula', () => {
  const base = {
    nome: 'Curso X', duracao: 120, nivel: 'Básico', publico: 'Jovens',
    aula: { titulo: 'Aula 1', objetivos: 'obj' }, index: 0, total: 3,
    planoAulaTrechoAtual: '# Aula 1: X\n\nDinâmica presencial "Círculo de Histórias".',
    conteudoMelhorado: 'Conteúdo melhorado sem menção à dinâmica.'
  };

  test('com melhorias: injeta a lista numerada e a instrução de corrigir o plano', () => {
    const s = skills.realinharPlanoAulaSkill({
      ...base,
      melhorias: ['Substituir o "Círculo de Histórias" por atividade assíncrona.']
    });
    expect(s.user).toContain('## Melhorias pedidas pelo revisor para esta aula');
    expect(s.user).toContain('1. Substituir o "Círculo de Histórias" por atividade assíncrona.');
    expect(s.user).toContain('corrija diretamente a atividade na seção do plano');
  });

  test('sem melhorias (ou lista vazia): comportamento retrocompatível, sem a seção nova', () => {
    const semLista = skills.realinharPlanoAulaSkill(base);
    expect(semLista.user).not.toContain('Melhorias pedidas pelo revisor');

    const listaVazia = skills.realinharPlanoAulaSkill({ ...base, melhorias: [] });
    expect(listaVazia.user).not.toContain('Melhorias pedidas pelo revisor');
  });

  test('mantém as regras de saída existentes (escopo, objetivos imutáveis)', () => {
    const s = skills.realinharPlanoAulaSkill({ ...base, melhorias: ['Ajustar atividade X'] });
    expect(s.user).toContain('Objetivos (IMUTÁVEIS)');
    expect(s.user).toContain('> ⚠️ ALERTA DE ESCOPO:');
    expect(s.system).toContain('sem jamais alterar objetivos');
  });
});
