'use strict';

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const VALID_CONFIG = {
  nome: 'Curso de Pesquisa Web',
  publico: 'Desenvolvedores júnior',
  carga: '40',
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender Node.js',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-pesquisa-web')
};

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

const PESQUISA_TXT = path.join(VALID_CONFIG.pastaProjeto, 'scr', 'pesquisa.txt');

beforeEach(() => {
  OpenAI.__reset();
  fs.rmSync(PESQUISA_TXT, { force: true });
});

function parseSSE(body) {
  return String(body)
    .split('\n\n')
    .filter(block => block.startsWith('data:'))
    .map(block => {
      try { return JSON.parse(block.replace(/^data:\s*/, '')); } catch { return null; }
    })
    .filter(Boolean);
}

async function pesquisar(ag, query = '') {
  const res = await ag.get(`/api/search${query}`).buffer(true).parse((r, cb) => {
    let data = '';
    r.on('data', c => { data += c.toString(); });
    r.on('end', () => cb(null, data));
  });
  return parseSSE(res.body);
}

describe('GET /api/search — pesquisa web via Responses API', () => {
  test('usa responses.create com a ferramenta web_search (nunca chat.completions + web_search_options)', async () => {
    OpenAI.__setResponse('Relatório de pesquisa sobre Node.js');
    const ag = request.agent(app);
    await ag.post('/api/config').send(VALID_CONFIG);

    const events = await pesquisar(ag);

    const chamadas = OpenAI.__getResponsesMock().mock.calls;
    expect(chamadas).toHaveLength(1);
    const [params] = chamadas[0];
    expect(params.tools).toEqual([expect.objectContaining({ type: 'web_search' })]);
    expect(params.input).toEqual(expect.stringContaining('Curso de Pesquisa Web'));
    expect(OpenAI.__getMock()).not.toHaveBeenCalledWith(
      expect.objectContaining({ web_search_options: expect.anything() }),
      expect.anything()
    );
    expect(events.map(e => e.type)).toContain('done');
  });

  test('emite um evento site por fonte citada e devolve o texto no done', async () => {
    OpenAI.__setResponse('Relatório de pesquisa sobre Node.js');
    const ag = request.agent(app);
    await ag.post('/api/config').send(VALID_CONFIG);

    const events = await pesquisar(ag);

    const sites = events.filter(e => e.type === 'site');
    // parâmetros utm_* (ex.: ?utm_source=openai) são removidos das URLs
    expect(sites.map(s => s.url)).toEqual([
      'https://nodejs.org/docs',
      'https://developer.mozilla.org/js',
      'https://www.w3schools.com/nodejs'
    ]);
    const done = events.find(e => e.type === 'done');
    expect(done.fullText).toBe('Relatório de pesquisa sobre Node.js');
  });

  test('erro 400 da API (parâmetro inválido) emite error sem cair no fallback', async () => {
    const err = new OpenAI.BadRequestError('Web search options not supported with this model.');
    OpenAI.__setError(err);
    const ag = request.agent(app);
    await ag.post('/api/config').send(VALID_CONFIG);

    const events = await pesquisar(ag);

    expect(events.map(e => e.type)).toContain('error');
    expect(OpenAI.__getMock()).not.toHaveBeenCalled(); // fallback gpt-4o-mini não acionado
  });

  test('sem nenhuma citação: emite error com semPesquisaDisponivel e NÃO grava pesquisa.txt', async () => {
    OpenAI.__setResponse('Texto de memória do modelo, sem fontes');
    OpenAI.__setCitations([]);
    const ag = request.agent(app);
    await ag.post('/api/config').send(VALID_CONFIG);

    const events = await pesquisar(ag);

    const erro = events.find(e => e.type === 'error');
    expect(erro).toBeDefined();
    expect(erro.semPesquisaDisponivel).toBe(true);
    expect(erro.message).toMatch(/nenhuma fonte/i);
    expect(events.map(e => e.type)).not.toContain('done');
    expect(fs.existsSync(PESQUISA_TXT)).toBe(false);
    expect(OpenAI.__getMock()).not.toHaveBeenCalled(); // sem fallback automático
  });

  test('fontes insuficientes (2 fontes) é tratado como falha e nada é gravado', async () => {
    OpenAI.__setCitations([
      { url: 'https://nodejs.org/docs', title: 'Node.js Docs' },
      { url: 'https://developer.mozilla.org/js', title: 'MDN' }
    ]);
    const ag = request.agent(app);
    await ag.post('/api/config').send(VALID_CONFIG);

    const events = await pesquisar(ag);

    expect(events.find(e => e.type === 'error').message).toMatch(/poucas fontes/i);
    expect(fs.existsSync(PESQUISA_TXT)).toBe(false);
  });

  test('3 fontes em um único domínio também é falha', async () => {
    OpenAI.__setCitations([
      { url: 'https://nodejs.org/a', title: 'A' },
      { url: 'https://nodejs.org/b', title: 'B' },
      { url: 'https://nodejs.org/c', title: 'C' }
    ]);
    const ag = request.agent(app);
    await ag.post('/api/config').send(VALID_CONFIG);

    const events = await pesquisar(ag);

    expect(events.find(e => e.type === 'error')).toBeDefined();
    expect(fs.existsSync(PESQUISA_TXT)).toBe(false);
  });

  test('semBusca=1: usa o modelo sem busca, grava com selo e fonte modelo_sem_busca', async () => {
    OpenAI.__setResponse('Texto gerado do conhecimento do modelo');
    const ag = request.agent(app);
    await ag.post('/api/config').send(VALID_CONFIG);

    const events = await pesquisar(ag, '?semBusca=1');

    expect(OpenAI.__getResponsesMock()).not.toHaveBeenCalled();
    expect(OpenAI.__getMock()).toHaveBeenCalledTimes(1);
    expect(events.map(e => e.type)).not.toContain('site');
    const done = events.find(e => e.type === 'done');
    expect(done.fullText).toMatch(/^> ⚠️ SEM PESQUISA WEB/);
    expect(done.fullText).toContain('Texto gerado do conhecimento do modelo');
    const gravado = fs.readFileSync(PESQUISA_TXT, 'utf-8');
    expect(gravado).toMatch(/^> ⚠️ SEM PESQUISA WEB/);
    const projeto = JSON.parse(fs.readFileSync(path.join(VALID_CONFIG.pastaProjeto, 'scr', 'projeto.json'), 'utf-8'));
    expect(projeto.stages.pesquisa.fonte).toBe('modelo_sem_busca');
  });
});

describe('limparUrlFonte', () => {
  const { limparUrlFonte } = app;

  test('remove utm_* e preserva os demais parâmetros', () => {
    expect(limparUrlFonte('https://x.com/p?id=7&utm_source=openai&utm_medium=cpc')).toBe('https://x.com/p?id=7');
  });

  test('sem parâmetros de rastreamento a URL não muda', () => {
    expect(limparUrlFonte('https://x.com/a/b?id=7')).toBe('https://x.com/a/b?id=7');
  });

  test('URL inválida é devolvida como veio', () => {
    expect(limparUrlFonte('não é url')).toBe('não é url');
  });
});
