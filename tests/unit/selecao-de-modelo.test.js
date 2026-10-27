'use strict';

// Seleção do modelo por papel na tela (change selecao-de-modelo-na-tela): lista permitida,
// validação, persistência, precedência, degradação de perfil e aviso de mistura.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarGovernanca, modelosPermitidos } = require('../../orcamento');

const VARIAVEIS = ['OPENAI_RESEARCH_MODEL', 'OPENAI_CONTENT_MODEL', 'OPENAI_ECONOMY_MODEL', 'OPENAI_SUMMARY_MODEL', 'OPENAI_EVAL_MODEL', 'OPENAI_JUDGE_MODEL'];
let dir;
let logger;
let guardadas;

function novo() {
  logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };
  return criarGovernanca({
    courseScrDir: (sess) => (sess.config?.nome ? path.join(dir, 'scr') : null),
    logger,
    env: { USO_DIARIO_FILE: path.join(dir, 'uso-diario.json') },
    arquivoDiarioPadrao: path.join(dir, 'uso-diario-padrao.json')
  });
}
const sessao = (extra = {}) => ({ config: { nome: 'Curso Teste' }, custoProjetoUsd: 0, ...extra });
const arquivoUso = () => path.join(dir, 'scr', 'uso.json');

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selecao-modelo-'));
  guardadas = Object.fromEntries(VARIAVEIS.map(v => [v, process.env[v]]));
  for (const v of VARIAVEIS) delete process.env[v];
});
afterEach(() => {
  for (const v of VARIAVEIS) { if (guardadas[v] === undefined) delete process.env[v]; else process.env[v] = guardadas[v]; }
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('lista de modelos permitidos', () => {
  const precos = { porMilhaoDeTokens: { 'gpt-4o': {}, 'gpt-4o-mini': {}, 'sem-busca': {} } };
  const tabela = {
    modelos: {
      'gpt-4o': { busca_web: true }, 'gpt-4o-mini': { busca_web: true }, 'sem-busca': { busca_web: false },
      'gpt-4.1': { busca_web: true } // sem preço: nunca aparece
    },
    exigencias: { pesquisa: ['busca_web'], redacao: [] }
  };

  test('pesquisa exige busca web; modelo sem preço nunca aparece', () => {
    expect(modelosPermitidos('pesquisa', precos, tabela)).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  test('papel sem exigência aceita qualquer modelo com preço e capacidades conhecidas', () => {
    expect(modelosPermitidos('redacao', precos, tabela)).toEqual(['gpt-4o', 'gpt-4o-mini', 'sem-busca']);
  });

  test('com as tabelas reais a lista da pesquisa é gpt-4o e gpt-4o-mini', () => {
    expect(modelosPermitidos('pesquisa')).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  test('GET devolve a lista por papel', () => {
    const G = novo();
    const e = G.estado(sessao());
    expect(Object.keys(e.modelosDisponiveis).sort()).toEqual(['avaliacao', 'juiz', 'pesquisa', 'redacao', 'resumos']);
    expect(e.modelosDisponiveis.pesquisa).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });
});

describe('escolha, persistência e restauração', () => {
  test('sem escolha nada muda: efetivo vem do perfil e das variáveis', () => {
    const G = novo();
    const sess = sessao();
    G.ajustar(sess, { perfil: 'economico' });
    const e = G.estado(sess);
    expect(e.modelosEscolhidos).toEqual({});
    expect(e.modelos.pesquisa).toBe('gpt-4o-mini'); // modeloPesquisa do perfil Econômico
    expect(Object.values(e.modelosOrigem).every(o => o === 'perfil')).toBe(true);
  });

  test('a escolha vale na próxima chamada e vence o original, o perfil e a variável', () => {
    process.env.OPENAI_EVAL_MODEL = 'gpt-4o-mini';
    const G = novo();
    const sess = sessao();
    G.ajustar(sess, { perfil: 'economico' });
    expect(G.ajustar(sess, { modelos: { avaliacao: 'gpt-4o', pesquisa: 'gpt-4o', redacao: 'gpt-4o' } })).toEqual({ ok: true });
    expect(G.modeloPara(sess, 'revisao.secao', 'gpt-4o-mini')).toBe('gpt-4o');
    expect(G.modeloPara(sess, 'pesquisa.web', 'gpt-4o-mini')).toBe('gpt-4o');
    expect(G.modeloPara(sess, 'conteudo.secao', 'gpt-4o-mini')).toBe('gpt-4o');
    expect(G.modeloDoPapel(sess, 'pesquisa', 'gpt-4o-mini')).toBe('gpt-4o');
    const e = G.estado(sess);
    expect(e.modelosEscolhidos).toEqual({ avaliacao: 'gpt-4o', pesquisa: 'gpt-4o', redacao: 'gpt-4o' });
    expect(e.modelosOrigem).toMatchObject({ pesquisa: 'usuario', avaliacao: 'usuario', redacao: 'usuario', resumos: 'perfil' });
    expect(e.modelos.pesquisa).toBe('gpt-4o');
  });

  test('chamada sem papel conhecido mantém o modelo da skill', () => {
    const G = novo();
    const sess = sessao();
    G.ajustar(sess, { modelos: { redacao: 'gpt-4o' } });
    expect(G.modeloPara(sess, 'openai.chat', 'gpt-4o-mini')).toBe('gpt-4o-mini');
  });

  test('null volta ao padrão do perfil e remove a escolha do uso.json', () => {
    const G = novo();
    const sess = sessao();
    G.ajustar(sess, { perfil: 'economico' });
    G.ajustar(sess, { modelos: { pesquisa: 'gpt-4o' } });
    G.ajustar(sess, { modelos: { pesquisa: null } });
    expect(G.modeloDoPapel(sess, 'pesquisa')).toBe('gpt-4o-mini');
    expect(JSON.parse(fs.readFileSync(arquivoUso(), 'utf-8')).modelosEscolhidos).toEqual({});
  });

  test('a escolha é gravada em uso.json e restaurada ao carregar o projeto', () => {
    const G = novo();
    G.ajustar(sessao(), { modelos: { pesquisa: 'gpt-4o-mini' } });
    expect(JSON.parse(fs.readFileSync(arquivoUso(), 'utf-8')).modelosEscolhidos).toEqual({ pesquisa: 'gpt-4o-mini' });

    const G2 = novo();
    const reaberta = sessao();
    G2.carregarUso(reaberta);
    expect(G2.estado(reaberta).modelosEscolhidos).toEqual({ pesquisa: 'gpt-4o-mini' });
    expect(G2.modeloPara(reaberta, 'pesquisa.web', 'gpt-4o')).toBe('gpt-4o-mini');
  });

  test('uso.json antigo, sem o campo, vale como nenhuma escolha', () => {
    fs.mkdirSync(path.dirname(arquivoUso()), { recursive: true });
    fs.writeFileSync(arquivoUso(), JSON.stringify({ versao: 1, perfil: 'padrao' }));
    const G = novo();
    const sess = sessao();
    G.carregarUso(sess);
    expect(G.estado(sess).modelosEscolhidos).toEqual({});
  });

  test('o gasto por modelo (uso.modelos) continua separado da escolha', () => {
    const G = novo();
    const sess = sessao();
    G.ajustar(sess, { modelos: { redacao: 'gpt-4o' } });
    expect(G.estado(sess).porModelo).toEqual({});
  });
});

describe('validação', () => {
  test('modelo fora da lista dá erro e nada muda, nem as chaves válidas do mesmo corpo', () => {
    const G = novo();
    const sess = sessao();
    const r = G.ajustar(sess, { modelos: { redacao: 'gpt-4o', juiz: 'gpt-9-fantasia' } });
    expect(r.erro).toMatch(/gpt-9-fantasia/);
    expect(G.estado(sess).modelosEscolhidos).toEqual({});
  });

  test('papel desconhecido', () => {
    const G = novo();
    expect(G.ajustar(sessao(), { modelos: { traducao: 'gpt-4o' } }).erro).toMatch(/traducao/);
  });

  test('modelos precisa ser um objeto', () => {
    const G = novo();
    expect(G.ajustar(sessao(), { modelos: 'gpt-4o' }).erro).toMatch(/objeto/);
    expect(G.ajustar(sessao(), { modelos: ['gpt-4o'] }).erro).toMatch(/objeto/);
    expect(G.ajustar(sessao(), { modelos: null }).erro).toMatch(/objeto/);
  });

  test('escolha que deixou de ser permitida é ignorada com aviso no log', () => {
    fs.mkdirSync(path.dirname(arquivoUso()), { recursive: true });
    fs.writeFileSync(arquivoUso(), JSON.stringify({ versao: 1, modelosEscolhidos: { redacao: 'gpt-removido' } }));
    const G = novo();
    const sess = sessao();
    G.carregarUso(sess);
    expect(G.modeloPara(sess, 'conteudo.secao', 'gpt-4o-mini')).toBe('gpt-4o-mini');
    expect(G.estado(sess).modelosEscolhidos).toEqual({});
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/gpt-removido/));
  });
});

describe('degradação de perfil e aviso de mistura', () => {
  test('a descida automática de perfil não altera a escolha do usuário', () => {
    const G = novo();
    const sess = sessao();
    G.ajustar(sess, { perfil: 'premium', modelos: { redacao: 'gpt-4o' } });
    G.usoDe(sess).degradarPendente = true;
    expect(G.aplicarDegradacao(sess)).toBeTruthy();
    expect(G.perfil(sess).id).toBe('padrao');
    const e = G.estado(sess);
    expect(e.modelosEscolhidos).toEqual({ redacao: 'gpt-4o' });
    expect(e.modelosOrigem.redacao).toBe('usuario');
  });

  test('projeto sem gasto: troca sem aviso', () => {
    const G = novo();
    expect(G.ajustar(sessao(), { modelos: { redacao: 'gpt-4o' } })).toEqual({ ok: true });
  });

  test('projeto com gasto: a troca vale e traz o aviso de mistura de modelos', () => {
    const G = novo();
    const sess = sessao({ custoProjetoUsd: 0.3 });
    const r = G.ajustar(sess, { modelos: { redacao: 'gpt-4o' } });
    expect(r.ok).toBe(true);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toMatch(/outro modelo/);
    expect(G.modeloDoPapel(sess, 'redacao')).toBe('gpt-4o');
  });

  test('repetir a mesma escolha não gera aviso', () => {
    const G = novo();
    const sess = sessao({ custoProjetoUsd: 0.3 });
    G.ajustar(sess, { modelos: { redacao: 'gpt-4o' } });
    expect(G.ajustar(sess, { modelos: { redacao: 'gpt-4o' } })).toEqual({ ok: true });
  });

  test('a troca de modelo limpa uma pausa por orçamento', () => {
    const G = novo();
    const sess = sessao();
    G.usoDe(sess).pausa = { escopo: 'projeto' };
    G.ajustar(sess, { modelos: { pesquisa: 'gpt-4o-mini' } });
    expect(G.usoDe(sess).pausa).toBeNull();
  });
});
