'use strict';

// Cache local das consultas de pesquisa web (change otimizacao-de-tokens).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarCachePesquisa, VERSAO_FORMATO } = require('../../pesquisa-cache');

const DIA = 24 * 60 * 60 * 1000;
const ANNOTATIONS = [{ type: 'url_citation', url_citation: { url: 'https://exemplo.com/a', title: 'A' } }];
const SKILL = { model: 'gpt-4o', searchContextSize: 'medium', system: 'instruções', user: 'consulta 1' };

let dir;
let agora;
let avisos;
const criar = (envExtra = {}) => criarCachePesquisa({
  env: { PESQUISA_CACHE_DIR: dir, ...envExtra },
  agora: () => agora,
  logger: { warn: (m) => avisos.push(m) }
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pesquisa-cache-'));
  agora = Date.parse('2026-10-25T12:00:00Z');
  avisos = [];
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('chave', () => {
  test('é estável para a mesma entrada e muda com qualquer parte do prompt, do modelo ou do contexto de busca', () => {
    const c = criar();
    const k = c.chave(SKILL, 3000);
    expect(c.chave({ ...SKILL }, 3000)).toBe(k);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    for (const mudanca of [{ user: 'consulta 2' }, { system: 'outras instruções' }, { model: 'gpt-4o-mini' }, { searchContextSize: 'high' }]) {
      expect(c.chave({ ...SKILL, ...mudanca }, 3000)).not.toBe(k);
    }
    expect(c.chave(SKILL, 4000)).not.toBe(k);
  });
});

describe('gravar e ler', () => {
  test('a segunda leitura devolve o texto, as citações, o modelo e a idade', () => {
    const c = criar();
    const k = c.chave(SKILL, 3000);
    expect(c.ler(k)).toBeNull();
    expect(c.gravar(k, { texto: 'Resultado da pesquisa', annotations: ANNOTATIONS, modelo: 'gpt-4o' })).toBe(true);
    agora += 3 * DIA;
    const e = c.ler(k);
    expect(e).toMatchObject({ texto: 'Resultado da pesquisa', annotations: ANNOTATIONS, modelo: 'gpt-4o', idadeDias: 3 });
    expect(fs.readdirSync(dir).filter(f => f.includes('.tmp'))).toEqual([]); // gravação atômica não deixa temporário
  });

  test('só grava sucesso: sem texto ou sem citação nada entra', () => {
    const c = criar();
    const k = c.chave(SKILL);
    expect(c.gravar(k, { texto: '', annotations: ANNOTATIONS })).toBe(false);
    expect(c.gravar(k, { texto: '   ', annotations: ANNOTATIONS })).toBe(false);
    expect(c.gravar(k, { texto: 'texto de memória', annotations: [] })).toBe(false);
    expect(c.gravar(k, { texto: 'texto de memória', annotations: undefined })).toBe(false);
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
  });
});

describe('validade', () => {
  test('entrada com mais dias que a validade é tratada como ausente (padrão 30)', () => {
    const c = criar();
    const k = c.chave(SKILL);
    c.gravar(k, { texto: 'x', annotations: ANNOTATIONS });
    agora += 30 * DIA;
    expect(c.ler(k)).not.toBeNull();
    agora += 1 * DIA + 1000;
    expect(c.ler(k)).toBeNull();
  });

  test('PESQUISA_CACHE_TTL_DIAS ajusta a validade; 0 desliga a leitura mas mantém a gravação', () => {
    const k = criar().chave(SKILL);
    const c7 = criar({ PESQUISA_CACHE_TTL_DIAS: '7' });
    c7.gravar(k, { texto: 'x', annotations: ANNOTATIONS });
    agora += 8 * DIA;
    expect(c7.ler(k)).toBeNull();

    const c0 = criar({ PESQUISA_CACHE_TTL_DIAS: '0' });
    expect(c0.gravar(k, { texto: 'y', annotations: ANNOTATIONS })).toBe(true);
    expect(c0.ler(k)).toBeNull();
    expect(criar().ler(k)).not.toBeNull(); // a entrada foi gravada e vale com a validade padrão
  });

  test('validade inválida cai no padrão de 30 dias', () => {
    expect(criar({ PESQUISA_CACHE_TTL_DIAS: 'abc' }).lerConfig().ttlDias).toBe(30);
    expect(criar({ PESQUISA_CACHE_TTL_DIAS: '-3' }).lerConfig().ttlDias).toBe(30);
  });
});

describe('desligado e arquivos ruins', () => {
  test('PESQUISA_CACHE=false não lê nem grava', () => {
    const ligado = criar();
    const k = ligado.chave(SKILL);
    ligado.gravar(k, { texto: 'x', annotations: ANNOTATIONS });

    const desligado = criar({ PESQUISA_CACHE: 'false' });
    expect(desligado.ler(k)).toBeNull();
    expect(desligado.gravar(desligado.chave({ ...SKILL, user: 'outra' }), { texto: 'x', annotations: ANNOTATIONS })).toBe(false);
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });

  test('arquivo corrompido é ignorado com aviso e pode ser regravado', () => {
    const c = criar();
    const k = c.chave(SKILL);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${k}.json`), '{ isto não é json', 'utf-8');
    expect(c.ler(k)).toBeNull();
    expect(avisos.join('\n')).toMatch(/ilegível/);
    expect(c.gravar(k, { texto: 'novo', annotations: ANNOTATIONS })).toBe(true);
    expect(c.ler(k)?.texto).toBe('novo');
  });

  test('entrada de outra versão do formato ou incompleta é ignorada', () => {
    const c = criar();
    const k = c.chave(SKILL);
    const base = { versao: VERSAO_FORMATO, modelo: 'gpt-4o', geradoEm: new Date(agora).toISOString(), texto: 'x', annotations: ANNOTATIONS };
    for (const ruim of [{ ...base, versao: 999 }, { ...base, annotations: [] }, { ...base, texto: '' }, { ...base, geradoEm: 'ontem' }]) {
      fs.writeFileSync(path.join(dir, `${k}.json`), JSON.stringify(ruim), 'utf-8');
      expect(c.ler(k)).toBeNull();
    }
    expect(avisos.length).toBeGreaterThan(0);
  });

  test('pasta que não pode ser criada: a gravação falha com aviso, sem lançar erro', () => {
    const arquivoComoPasta = path.join(dir, 'arquivo.txt');
    fs.writeFileSync(arquivoComoPasta, 'x');
    const c = criarCachePesquisa({ env: { PESQUISA_CACHE_DIR: path.join(arquivoComoPasta, 'sub') }, agora: () => agora, logger: { warn: (m) => avisos.push(m) } });
    expect(c.gravar(c.chave(SKILL), { texto: 'x', annotations: ANNOTATIONS })).toBe(false);
    expect(avisos.join('\n')).toMatch(/não foi possível gravar/);
  });

  test('a pasta padrão é .cache-pesquisa na raiz do app e está no .gitignore', () => {
    expect(criarCachePesquisa({ env: {} }).lerConfig().dir).toBe(path.join(__dirname, '..', '..', '.cache-pesquisa'));
    expect(fs.readFileSync(path.join(__dirname, '..', '..', '.gitignore'), 'utf-8')).toMatch(/^\.cache-pesquisa\/$/m);
  });
});
