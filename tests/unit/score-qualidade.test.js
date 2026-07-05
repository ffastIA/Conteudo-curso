const skills = require('../../skills');
const {
  computeScoreDeterministico,
  computeScoreComposto,
  parseRubricaCriterios,
  PESOS_RUBRICA,
  EPSILON_ACEITE,
  EPSILON_CONVERGENCIA
} = require('../../server');

const AULA = { objetivos: 'compreender keyframes e aplicar máscaras em vídeos' };

const CONTEUDO_COMPLETO =
  'Fundamentação Técnica\nExplicação sobre keyframes e máscaras.\n\n' +
  'Exemplos Práticos\nUm exemplo de aplicação de máscaras.\n\n' +
  'Erros Comuns\nEsquecer de ajustar a curva de velocidade.\n\n' +
  'Síntese\nOs alunos devem compreender keyframes e aplicar máscaras.';

describe('computeScoreDeterministico', () => {
  test('cobertura de objetivos alta quando os termos aparecem no texto', () => {
    const { componentes } = computeScoreDeterministico(CONTEUDO_COMPLETO, AULA, 0);
    expect(componentes.cobertura).toBeGreaterThan(0.5);
  });

  test('cobertura de objetivos baixa quando os termos não aparecem', () => {
    const { componentes } = computeScoreDeterministico('Texto totalmente não relacionado sobre culinária.', AULA, 0);
    expect(componentes.cobertura).toBeLessThan(0.5);
  });

  test('objetivos vazios não penalizam a cobertura (assume 1)', () => {
    const { componentes } = computeScoreDeterministico('qualquer texto', { objetivos: '' }, 0);
    expect(componentes.cobertura).toBe(1);
  });

  test('sobreposição abaixo do limiar 0.55 não penaliza', () => {
    const { componentes } = computeScoreDeterministico(CONTEUDO_COMPLETO, AULA, 0.40);
    expect(componentes.penalidadeSobreposicao).toBe(1);
  });

  test('sobreposição acima do limiar penaliza proporcionalmente', () => {
    const { componentes } = computeScoreDeterministico(CONTEUDO_COMPLETO, AULA, 0.80);
    expect(componentes.penalidadeSobreposicao).toBeCloseTo(1 - (0.80 - 0.55), 5);
  });

  test('completude estrutural total quando as 4 seções esperadas estão presentes', () => {
    const { componentes } = computeScoreDeterministico(CONTEUDO_COMPLETO, AULA, 0);
    expect(componentes.completudeEstrutural).toBe(1);
  });

  test('completude estrutural parcial quando faltam seções', () => {
    const { componentes } = computeScoreDeterministico('Fundamentação Técnica\napenas isso.', AULA, 0);
    expect(componentes.completudeEstrutural).toBeCloseTo(0.25, 5);
  });

  test('determ combinado fica entre 0 e 1', () => {
    const { determ } = computeScoreDeterministico(CONTEUDO_COMPLETO, AULA, 0);
    expect(determ).toBeGreaterThanOrEqual(0);
    expect(determ).toBeLessThanOrEqual(1);
  });
});

describe('computeScoreComposto', () => {
  test('nota máxima em todos os critérios e determinístico 1 produz score 1', () => {
    const rubrica10 = { planoAula: 10, planoEnsinoEmenta: 10, nivelPublicoModalidade: 10, qualidadeDidatica: 10, clarezaEstrutura: 10 };
    const { score, rubricaLLM } = computeScoreComposto(rubrica10, 1);
    expect(score).toBe(1);
    expect(rubricaLLM).toBe(1);
  });

  test('nota mínima em tudo produz score 0', () => {
    const rubrica10 = { planoAula: 0, planoEnsinoEmenta: 0, nivelPublicoModalidade: 0, qualidadeDidatica: 0, clarezaEstrutura: 0 };
    const { score } = computeScoreComposto(rubrica10, 0);
    expect(score).toBe(0);
  });

  test('pesos aplicados corretamente (só o critério de maior peso pontuado)', () => {
    const rubrica10 = { planoAula: 10, planoEnsinoEmenta: 0, nivelPublicoModalidade: 0, qualidadeDidatica: 0, clarezaEstrutura: 0 };
    const { rubricaLLM } = computeScoreComposto(rubrica10, 0);
    expect(rubricaLLM).toBeCloseTo(PESOS_RUBRICA.planoAula, 5);
  });

  test('fórmula é 0.7 rubrica + 0.3 determinístico', () => {
    const rubrica10 = { planoAula: 8, planoEnsinoEmenta: 8, nivelPublicoModalidade: 8, qualidadeDidatica: 8, clarezaEstrutura: 8 };
    const { score, rubricaLLM } = computeScoreComposto(rubrica10, 0.5);
    expect(rubricaLLM).toBeCloseTo(0.8, 5);
    expect(score).toBeCloseTo(0.7 * 0.8 + 0.3 * 0.5, 2);
  });

  test('resultado sempre no intervalo [0,1] mesmo com entradas extremas', () => {
    const { score } = computeScoreComposto({ planoAula: 999 }, 5);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('parseRubricaCriterios', () => {
  test('extrai os 5 critérios no formato esperado', () => {
    const texto =
      'Aderência ao Plano de Aula: 8/10 - boa cobertura\n' +
      'Aderência ao Plano de Ensino e Ementa: 7/10\n' +
      'Adequação a Nível/Público/Modalidade: 9/10\n' +
      'Qualidade Didática: 7/10\n' +
      'Clareza e Estrutura: 8/10\n';
    const r = parseRubricaCriterios(texto);
    expect(r).not.toBeNull();
    expect(r.criterios.planoAula).toBe(8);
    expect(r.criterios.planoEnsinoEmenta).toBe(7);
    expect(r.criterios.nivelPublicoModalidade).toBe(9);
    expect(r.criterios.qualidadeDidatica).toBe(7);
    expect(r.criterios.clarezaEstrutura).toBe(8);
    expect(r.rubricaLLM).toBeGreaterThan(0);
  });

  test('retorna null quando faltam critérios (parcial)', () => {
    const texto = 'Aderência ao Plano de Aula: 8/10\nQualidade Didática: 7/10\n';
    expect(parseRubricaCriterios(texto)).toBeNull();
  });

  test('retorna null quando nenhum critério está presente', () => {
    expect(parseRubricaCriterios('Texto de revisão qualquer sem rubrica.')).toBeNull();
  });

  test('tolerante a variação de espaçamento e quebra de linha', () => {
    const texto =
      'Aderência ao Plano de Aula:8/10\n\n' +
      'Aderência ao Plano de Ensino e Ementa: 7 / 10\n' +
      'Adequação a Nível/Público/Modalidade:   9/10\n' +
      'Qualidade Didática: 7/10\n' +
      'Clareza e Estrutura: 8/10';
    const r = parseRubricaCriterios(texto);
    expect(r).not.toBeNull();
    expect(r.criterios.planoAula).toBe(8);
  });
});

describe('constantes de limiar', () => {
  test('epsilons definidos e positivos', () => {
    expect(EPSILON_ACEITE).toBeGreaterThan(0);
    expect(EPSILON_CONVERGENCIA).toBeGreaterThan(0);
  });
});

describe('scoreAulaSkill — prompt do julgamento pareado', () => {
  const args = {
    aulaTitulo: 'Aula 1', aulaObjetivos: 'obj',
    textoOriginal: 'texto original da aula',
    textoCandidato: 'texto candidato revisado',
    planoAulaTrecho: 'trecho do plano', ementa: 'ementa', planoEnsino: 'plano de ensino',
    nivel: 'Básico', publico: 'Jovens', modalidade: 'EaD'
  };

  test('contém as duas versões e as referências', () => {
    const s = skills.scoreAulaSkill(args);
    expect(s.user).toContain('texto original da aula');
    expect(s.user).toContain('texto candidato revisado');
    expect(s.user).toContain('trecho do plano');
    expect(s.user).toContain('Modalidade: EaD');
  });

  test('usa response_format json_object e modelo econômico', () => {
    const s = skills.scoreAulaSkill(args);
    expect(s.response_format).toEqual({ type: 'json_object' });
    expect(s.model).toBe(skills.MODEL_ECONOMY);
  });

  test('exige os 5 critérios para as duas versões no JSON', () => {
    const s = skills.scoreAulaSkill(args);
    expect(s.user).toContain('"original"');
    expect(s.user).toContain('"candidato"');
    expect(s.user).toContain('planoAula');
    expect(s.user).toContain('clarezaEstrutura');
  });
});

describe('revisaoQualidadeSkill — nota por rubrica decomposta', () => {
  test('pede os 5 critérios em vez de nota holística única', () => {
    const s = skills.revisaoQualidadeSkill({
      config: { nome: 'X' }, aulaIndex: 0, aulaTitulo: 'A', aulaConteudo: 'c'
    });
    expect(s.user).toContain('Aderência ao Plano de Aula');
    expect(s.user).toContain('Clareza e Estrutura');
    expect(s.user).toContain('N/10');
    expect(s.user).toContain('NÃO calcule nem informe uma nota final única');
  });
});
