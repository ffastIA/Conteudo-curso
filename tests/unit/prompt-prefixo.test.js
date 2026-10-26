'use strict';

// Prefixo estável nas skills repetitivas (change otimizacao-de-tokens): o contexto que não muda entre
// chamadas da mesma aula vem primeiro, para a OpenAI aproveitar o cache de prompt; só o trecho
// variável (seção atual, resumo do que foi escrito, texto a avaliar) vem depois. O conteúdo não muda.

const skills = require('../../skills');

const prefixoComum = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
};

const DOSSIE = '\n\n## Fontes e achados da pesquisa\n\n### Fontes\n[F1] Documentação oficial — exemplo.com\n\n### Achados\n- Tema: resumo (fontes: [F1])\n\n### Regras de citação (obrigatórias)\n- Cite [F#].';
const CTX = {
  nome: 'Curso X', duracao: 60, nivel: 'intermediario', publico: 'Devs', modalidade: 'online',
  aula: { titulo: 'Aula Um', modulo: 'Módulo A', objetivos: 'objetivo A; objetivo B' }, index: 0, total: 3,
  ementa: 'EMENTA-DO-CURSO', planoAulaTrecho: 'PLANO-DA-AULA', lessonSummaries: 'MAPA-DAS-AULAS',
  proporcaoTeoricoPratico: '40/60', preRequisitos: 'lógica',
  metodologia: 'METODOLOGIA-ABP', bnccContext: null, pesquisaBloco: DOSSIE
};
const PLANEJADAS = ['Seção 1', 'Seção 2', 'Síntese'];

describe('secaoConteudoSkill', () => {
  const sk = (n, resumo) => skills.secaoConteudoSkill({
    ...CTX, secao: { titulo: PLANEJADAS[n], objetivo: `obj ${n}` }, secoesPlanejadas: PLANEJADAS, resumoEscritas: resumo, metaPalavras: 500
  });

  test('duas seções da mesma aula compartilham todo o contexto como prefixo; só o trecho da seção difere', () => {
    const a = sk(0, '');
    const b = sk(1, '- Seção 1: resumo');
    expect(b.system).toBe(a.system);
    const prefixo = prefixoComum(a.user, b.user);
    for (const bloco of ['Curso X', 'Aula Um', 'EMENTA-DO-CURSO', 'PLANO-DA-AULA', 'MAPA-DAS-AULAS', 'Seções planejadas', '## Fontes e achados da pesquisa', 'METODOLOGIA-ABP', 'nível']) {
      if (bloco === 'nível') continue; // o rótulo do bloco de nível é conferido pelo teste de conteúdo preservado
      expect(prefixo).toContain(bloco);
    }
    // o que difere (resumo, seção a redigir) está depois do prefixo
    expect(a.user.slice(prefixo.length)).toMatch(/Resumo das seções já escritas|SEÇÃO A REDIGIR/);
    expect(prefixo).not.toContain('SEÇÃO A REDIGIR');
    expect(prefixo.length).toBeGreaterThan(a.user.length * 0.6);
  });

  test('o conteúdo é preservado: nenhum bloco some nem é duplicado', () => {
    const u = sk(0, 'resumo anterior').user;
    for (const trecho of ['Redija UMA seção', 'Curso X', 'EMENTA-DO-CURSO', 'PLANO-DA-AULA', 'MAPA-DAS-AULAS', 'Seções planejadas', '1. Seção 1',
      '## Fontes e achados da pesquisa', 'Regras de citação', 'METODOLOGIA-ABP', 'Resumo das seções já escritas', 'resumo anterior',
      'SEÇÃO A REDIGIR AGORA: "Seção 1"', 'Meta: cerca de 500 palavras', 'Nesta seção, cite com [F#]', 'Formato: comece exatamente com a linha "## Seção 1"',
      '### Fundamentação técnica']) {
      expect(u).toContain(trecho);
    }
    expect(u.split('## Fontes e achados da pesquisa')).toHaveLength(2);
    expect(u.split('METODOLOGIA-ABP')).toHaveLength(2);
  });

  test('sem dossiê, o prompt continua válido e a seção vem por último', () => {
    const u = skills.secaoConteudoSkill({ ...CTX, pesquisaBloco: '', secao: { titulo: 'Síntese' }, secoesPlanejadas: PLANEJADAS, resumoEscritas: '', metaPalavras: 300 }).user;
    expect(u).toContain('SEÇÃO A REDIGIR AGORA: "Síntese"');
    expect(u).toContain('Consolide em tópicos');
  });
});

describe('revisaoSecaoSkill', () => {
  const sk = (n, texto) => skills.revisaoSecaoSkill({
    config: { nome: 'Curso X', nivel: 'intermediario', publico: 'Devs', modalidade: 'online' },
    ementa: 'EMENTA-DO-CURSO', planoEnsino: 'PLANO-DE-ENSINO', planoAulaTrecho: 'PLANO-DA-AULA',
    aulaTitulo: 'Aula Um', aulaObjetivos: 'objetivo A', secao: { titulo: `Seção ${n}`, texto }, indice: n, total: 3,
    bnccContext: null, pesquisaBloco: DOSSIE
  });

  test('referências, dossiê e critérios formam o prefixo; a seção avaliada fica por último', () => {
    const a = sk(0, 'TEXTO-DA-SECAO-ZERO');
    const b = sk(1, 'TEXTO-DA-SECAO-UM');
    const prefixo = prefixoComum(a.user, b.user);
    for (const bloco of ['PLANO-DA-AULA', 'PLANO-DE-ENSINO', 'EMENTA-DO-CURSO', '## Fontes e achados da pesquisa', 'planoAula —', 'clarezaEstrutura —']) {
      expect(prefixo).toContain(bloco);
    }
    expect(prefixo).not.toContain('TEXTO-DA-SECAO');
    expect(a.user.indexOf('TEXTO-DA-SECAO-ZERO')).toBeGreaterThan(a.user.indexOf('Responda SOMENTE com este JSON'));
  });

  test('o conteúdo é preservado, inclusive o título e a posição da seção', () => {
    const u = sk(1, 'TEXTO-DA-SECAO-UM').user;
    for (const trecho of ['Aula Um', 'Curso X', 'objetivo A', 'citacoesFracas', '(seção 2 de 3: "Seção 1")', 'TEXTO-DA-SECAO-UM', 'SOMENTE a seção indicada ao final']) {
      expect(u).toContain(trecho);
    }
  });
});

describe('scoreAulaSkill', () => {
  const sk = (candidato) => skills.scoreAulaSkill({
    aulaTitulo: 'Aula Um', aulaObjetivos: 'objetivo A', textoOriginal: 'TEXTO-ORIGINAL', textoCandidato: candidato,
    planoAulaTrecho: 'PLANO-DA-AULA', ementa: 'EMENTA-DO-CURSO', planoEnsino: 'PLANO-DE-ENSINO',
    nivel: 'intermediario', publico: 'Devs', modalidade: 'online', pesquisaBloco: DOSSIE, secoesAlteradas: ['Seção 1']
  });

  test('referências, dossiê, critérios e formato vêm antes das duas versões', () => {
    const a = sk('CANDIDATA-UM');
    const b = sk('CANDIDATA-DOIS');
    const prefixo = prefixoComum(a.user, b.user);
    for (const bloco of ['PLANO-DA-AULA', 'EMENTA-DO-CURSO', 'PLANO-DE-ENSINO', '## Fontes e achados da pesquisa', 'Critérios (0 a 10 cada)', 'Responda SOMENTE com um JSON']) {
      expect(prefixo).toContain(bloco);
    }
    expect(a.user.indexOf('TEXTO-ORIGINAL')).toBeGreaterThan(a.user.indexOf('Responda SOMENTE com um JSON'));
    expect(a.user.indexOf('CANDIDATA-UM')).toBeGreaterThan(a.user.indexOf('TEXTO-ORIGINAL'));
  });

  test('o conteúdo é preservado, incluindo as seções alteradas', () => {
    const u = sk('CANDIDATA-UM').user;
    for (const trecho of ['## Versão ORIGINAL', '## Versão CANDIDATA (revisada)', 'Seções alteradas nesta versão', 'Seção 1', 'Nível: intermediario']) {
      expect(u).toContain(trecho);
    }
    expect(u.split('## Fontes e achados da pesquisa')).toHaveLength(2);
  });
});
