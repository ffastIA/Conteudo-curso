'use strict';

// Modelos configuráveis por ambiente e contexto BNCC em formato único
// (change docx-markdown-completo).
const fs = require('fs');
const path = require('path');
const skills = require('../../skills');
const modelos = require('../../config/modelos');

const VARS = ['OPENAI_RESEARCH_MODEL', 'OPENAI_CONTENT_MODEL', 'OPENAI_ECONOMY_MODEL'];
const original = Object.fromEntries(VARS.map(v => [v, process.env[v]]));
afterEach(() => {
  for (const v of VARS) { if (original[v] === undefined) delete process.env[v]; else process.env[v] = original[v]; }
});

const CONFIG = { nome: 'Curso', publico: 'Adultos', nivel: 'basico', carga: '4', duracao: '60', modalidade: 'online' };
const AULA = { titulo: 'Aula A', modulo: 'M1', objetivos: 'o' };

describe('modelos por ambiente', () => {
  test('sem variáveis: padrões atuais', () => {
    for (const v of VARS) delete process.env[v];
    expect(modelos.modeloPesquisa()).toBe('gpt-4o');
    expect(modelos.modeloEconomia()).toBe('gpt-4o-mini');
    expect(modelos.modeloConteudo()).toBe('gpt-4o-mini');
    expect(skills.conteudoSkill({ nome: 'x', duracao: 60, nivel: 'basico', publico: 'p', aula: AULA, index: 0, total: 1 }).model).toBe('gpt-4o-mini');
  });

  test('OPENAI_CONTENT_MODEL altera o modelo de conteudoSkill', () => {
    process.env.OPENAI_CONTENT_MODEL = 'outro-modelo';
    const skill = skills.conteudoSkill({ nome: 'x', duracao: 60, nivel: 'basico', publico: 'p', aula: AULA, index: 0, total: 1 });
    expect(skill.model).toBe('outro-modelo');
  });

  test('OPENAI_ECONOMY_MODEL altera as demais skills, e o conteúdo o herda sem OPENAI_CONTENT_MODEL', () => {
    process.env.OPENAI_ECONOMY_MODEL = 'modelo-barato';
    expect(skills.ementaSkill({ nome: 'x', publico: 'p', carga: 4, duracao: 60, nivel: 'basico', objetivos: 'o' }).model).toBe('modelo-barato');
    expect(skills.qualidadeSkill({ config: CONFIG }).model).toBe('modelo-barato');
    expect(modelos.modeloConteudo()).toBe('modelo-barato');
    process.env.OPENAI_CONTENT_MODEL = 'modelo-de-conteudo';
    expect(modelos.modeloConteudo()).toBe('modelo-de-conteudo');
  });

  test('OPENAI_RESEARCH_MODEL altera o modelo da pesquisa', () => {
    process.env.OPENAI_RESEARCH_MODEL = 'gpt-4.1';
    expect(skills.modeloPesquisa()).toBe('gpt-4.1');
  });

  test('valor em branco volta ao padrão', () => {
    process.env.OPENAI_ECONOMY_MODEL = '   ';
    expect(modelos.modeloEconomia()).toBe('gpt-4o-mini');
  });

  test('nenhum arquivo de código fixa nome de modelo fora de config/modelos.js', () => {
    for (const arq of ['server.js', 'skills.js', 'avaliacao.js', 'fundamentacao.js', 'conteudo-secoes.js', 'custo.js']) {
      const src = fs.readFileSync(path.join(__dirname, '../..', arq), 'utf-8');
      expect(src).not.toMatch(/['"]gpt-4[o.\d-]/);
    }
  });
});

describe('contexto BNCC em formato único', () => {
  const bncc = { ativo: true, nivel: 'ef2', itens: [{ codigo: 'EF09CI14', descricao: 'Tecnologias digitais' }] };
  const bloco = skills.bnccBlock(bncc);

  test('bnccBlock: formato com título, código e descrição; vazio sem BNCC', () => {
    expect(bloco).toBe('## Alinhamento BNCC — EF2\n- [EF09CI14] Tecnologias digitais');
    expect(skills.bnccBlock({ ativo: false, itens: [] })).toBe('');
    expect(skills.bnccBlock(null)).toBe('');
    expect(skills.bnccBlock({ ativo: true, nivel: 'competencias', itens: [{ descricao: 'x' }] })).toContain('Competências Gerais');
  });

  test('ementa com BNCC: o bloco no prompt é o gerado por pedagCtxBlock', () => {
    const skill = skills.ementaSkill({ nome: 'x', publico: 'p', carga: 4, duracao: 60, nivel: 'basico', objetivos: 'o', metodologia: 'ABP', bnccContext: bloco });
    expect(skill.user).toContain(skills.pedagCtxBlock('ABP', bloco));
  });

  test('qualidade, competências e PPC usam o mesmo bloco, sem formatos paralelos', () => {
    const q = skills.qualidadeSkill({ config: CONFIG, bncc, metodologia: 'ABP' });
    const c = skills.competenciasSkill({ config: CONFIG, bncc });
    const p = skills.ppcAssemblySkill({ config: CONFIG, bncc, metodologia: 'ABP' });
    for (const skill of [q, c, p]) {
      expect(skill.user).toContain(bloco);
      expect(skill.user).not.toContain('Competências/Habilidades BNCC Selecionadas');
      expect(skill.user).not.toContain('Alinhamento BNCC (');
    }
    expect(q.user).toContain(skills.pedagCtxBlock('ABP', bloco));
  });

  test('sem BNCC ativa, nenhuma skill injeta o bloco', () => {
    const vazio = { ativo: false, itens: [] };
    expect(skills.qualidadeSkill({ config: CONFIG, bncc: vazio }).user).not.toContain('Alinhamento BNCC —');
    expect(skills.ppcAssemblySkill({ config: CONFIG, bncc: vazio }).user).toContain('Alinhamento BNCC: Não aplicável');
  });

  test('revisões recebem o contexto pelo mesmo helper', () => {
    const r = skills.revisaoSecaoSkill({
      config: CONFIG, aulaTitulo: 'A', aulaObjetivos: 'o', secao: { titulo: 's', texto: 't' }, indice: 0, total: 1, bnccContext: bloco
    });
    expect(r.user).toContain(bloco);
  });

  test('buildPedagogicalContext (server) usa o mesmo bloco BNCC', () => {
    const app = require('../../server');
    const ctx = app.buildPedagogicalContext({ config: { modalidade: 'online' }, metodologia: '', bncc });
    expect(ctx).toContain(bloco);
  });
});
