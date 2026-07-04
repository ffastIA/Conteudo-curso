const { detectStage } = require('../../server');

describe('detectStage — detecção de etapa pelo nome do arquivo', () => {
  const sessVazia = {};

  test('nome exato de stage fixo', () => {
    expect(detectStage('metodologia.docx', null, sessVazia))
      .toEqual({ stage: 'metodologia', detectadoPor: 'nome' });
    expect(detectStage('plano_de_ensino.docx', null, sessVazia))
      .toEqual({ stage: 'plano_de_ensino', detectadoPor: 'nome' });
  });

  test('nome exportado pelo sistema (prefixo do curso + _stage)', () => {
    expect(detectStage('Curso_de_Logica_metodologia.docx', null, sessVazia))
      .toEqual({ stage: 'metodologia', detectadoPor: 'nome' });
    expect(detectStage('Excel_Avancado_plano_de_ensino.docx', null, sessVazia))
      .toEqual({ stage: 'plano_de_ensino', detectadoPor: 'nome' });
    expect(detectStage('Meu_Curso_revisao_qualidade.docx', null, sessVazia))
      .toEqual({ stage: 'revisao_qualidade', detectadoPor: 'nome' });
  });

  test('sufixo é case-insensitive', () => {
    expect(detectStage('CURSO_METODOLOGIA.docx', null, sessVazia))
      .toEqual({ stage: 'metodologia', detectadoPor: 'nome' });
  });

  test('nome de aula, exato e com prefixo do curso', () => {
    expect(detectStage('aula03_conteudo.docx', null, sessVazia))
      .toEqual({ stage: 'aula03_conteudo', detectadoPor: 'nome' });
    expect(detectStage('Curso_X_aula03_conteudo.docx', null, sessVazia))
      .toEqual({ stage: 'aula03_conteudo', detectadoPor: 'nome' });
  });

  test('stage sem separador _ no prefixo não casa (evita falso positivo)', () => {
    expect(detectStage('minhametodologia.docx', null, sessVazia)).toBeNull();
  });

  test('nome ambíguo sem H1 correspondente retorna null', () => {
    expect(detectStage('Aula 3 revisada.docx', null, sessVazia)).toBeNull();
    expect(detectStage('documento.docx', 'Texto qualquer', sessVazia)).toBeNull();
  });

  test('detecção por título H1 de aula continua funcionando', () => {
    const sess = { aulas: [{ titulo: 'Introdução' }, { titulo: 'Listas e Laços' }] };
    const r = detectStage('arquivo qualquer.docx', '# Aula 2 — Listas e Laços', sess);
    expect(r).toMatchObject({ stage: 'aula02_conteudo', detectadoPor: 'titulo' });
  });
});
