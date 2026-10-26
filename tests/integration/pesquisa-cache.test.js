'use strict';

// Cache local da pesquisa web, tokens em cache e revisão que ignora aula incompleta
// (change otimizacao-de-tokens). A OpenAI é simulada; o cache usa pasta temporária.

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const BASE = path.join(os.tmpdir(), 'gerador-conteudo-tests', 'pesquisa-cache');
const PASTA = path.join(BASE, 'curso');
const SCR = path.join(PASTA, 'scr');
const CACHE_DIR = path.join(BASE, 'cache');
const CONFIG = {
  nome: 'Curso de Cache de Pesquisa',
  publico: 'Desenvolvedores júnior',
  carga: '2', // 2 aulas, 2 módulos
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender JavaScript',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: PASTA
};
const PLANO_AULAS = JSON.stringify({ aulas: [
  { titulo: 'Variáveis', modulo: 'Fundamentos', objetivos: 'declarar variáveis e tipos primitivos' },
  { titulo: 'Requisições HTTP', modulo: 'Web', objetivos: 'consumir APIs REST com fetch' }
] });

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  for (const nome of ['PESQUISA_CACHE', 'PESQUISA_CACHE_DIR', 'PESQUISA_CACHE_TTL_DIAS', 'ORCAMENTO_MAX_USD']) delete process.env[nome];
  process.env.PESQUISA_CACHE = 'false';
  process.env.PESQUISA_MODULOS_OBRIGATORIA = 'false';
  jest.restoreAllMocks();
});

beforeEach(() => {
  OpenAI.__reset();
  fs.rmSync(BASE, { recursive: true, force: true });
  process.env.PESQUISA_CACHE = 'true';
  process.env.PESQUISA_CACHE_DIR = CACHE_DIR;
  delete process.env.PESQUISA_CACHE_TTL_DIAS;
  delete process.env.ORCAMENTO_MAX_USD;
  process.env.PESQUISA_MODULOS_OBRIGATORIA = 'false';
  process.env.CONTEUDO_MODO = 'unico';
});

function parseSSE(body) {
  return String(body).split('\n\n').filter(b => b.startsWith('data:'))
    .map(b => { try { return JSON.parse(b.replace(/^data:\s*/, '')); } catch { return null; } })
    .filter(Boolean);
}

async function sse(ag, rota) {
  const res = await ag.get(rota).buffer(true).parse((r, cb) => {
    let d = '';
    r.on('data', c => { d += c.toString(); });
    r.on('end', () => cb(null, d));
  });
  return parseSSE(res.body);
}

async function sessao() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(CONFIG);
  return ag;
}

async function sessaoComPlano() {
  const ag = await sessao();
  OpenAI.__setResponses([PLANO_AULAS, 'Plano detalhado gerado a partir do JSON.']);
  await sse(ag, '/api/plano-aula');
  OpenAI.__reset();
  return ag;
}

const json = (nome) => JSON.parse(fs.readFileSync(path.join(SCR, nome), 'utf-8'));
const buscas = () => OpenAI.__getResponsesMock().mock.calls.length;
const arquivosCache = () => (fs.existsSync(CACHE_DIR) ? fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')) : []);
const progresso = (eventos) => eventos.filter(e => e.type === 'progress').map(e => e.message);

describe('cache da pesquisa geral (GET /api/search)', () => {
  test('a segunda execução com a mesma entrada não chama a OpenAI, avisa o acerto e marca as consultas no pesquisa.json', async () => {
    const ag = await sessao();

    const primeira = await sse(ag, '/api/search');
    expect(primeira.map(e => e.type)).toContain('done');
    expect(buscas()).toBe(4);
    expect(arquivosCache()).toHaveLength(4);
    expect(json('pesquisa.json').consultas.some(c => c.deCache)).toBe(false);

    OpenAI.__reset();
    OpenAI.__setResponse('texto que NÃO deve aparecer: o cache responde');
    const segunda = await sse(ag, '/api/search');

    expect(buscas()).toBe(0);
    expect(segunda.map(e => e.type)).toContain('done');
    expect(segunda.find(e => e.type === 'done').fullText).not.toContain('NÃO deve aparecer');
    expect(progresso(segunda).filter(m => /resultado do cache/.test(m))).toHaveLength(4);
    const meta = json('pesquisa.json');
    expect(meta.status).toBe('web');
    expect(meta.consultas).toHaveLength(4);
    for (const c of meta.consultas) {
      expect(c.deCache).toBe(true);
      expect(Date.parse(c.pesquisadoEm)).not.toBeNaN();
    }
    expect(meta.fontes.length).toBeGreaterThanOrEqual(3);
  });

  test('?semCache=1 ignora o cache, consulta de novo e regrava', async () => {
    const ag = await sessao();
    await sse(ag, '/api/search');
    OpenAI.__reset();

    const eventos = await sse(ag, '/api/search?semCache=1');
    expect(buscas()).toBe(4);
    expect(progresso(eventos).some(m => /resultado do cache/.test(m))).toBe(false);
    expect(json('pesquisa.json').consultas.some(c => c.deCache)).toBe(false);
  });

  test('entrada diferente (tópicos extras mudam o prompt) gera outra chave e consulta a OpenAI', async () => {
    const ag = await sessao();
    await sse(ag, '/api/search');
    OpenAI.__reset();

    await sse(ag, '/api/search?topicos=Docker');
    expect(buscas()).toBeGreaterThan(0);
  });

  test('PESQUISA_CACHE=false não lê nem grava', async () => {
    process.env.PESQUISA_CACHE = 'false';
    const ag = await sessao();
    await sse(ag, '/api/search');
    expect(arquivosCache()).toHaveLength(0);
    OpenAI.__reset();
    await sse(ag, '/api/search');
    expect(buscas()).toBe(4);
  });

  test('resposta sem citações nunca entra no cache e a falha continua tratada como antes', async () => {
    OpenAI.__setCitations([]);
    const ag = await sessao();
    const eventos = await sse(ag, '/api/search');
    expect(eventos.find(e => e.type === 'error')?.status).toBe('falhou');
    expect(arquivosCache()).toHaveLength(0);
  });

  test('o fallback "sem pesquisa web" não grava no cache', async () => {
    const ag = await sessao();
    await sse(ag, '/api/search?semBusca=1');
    expect(arquivosCache()).toHaveLength(0);
    expect(json('pesquisa.json').status).toBe('sem_web');
  });

  test('entrada expirada (validade menor que a idade) é consultada de novo', async () => {
    const ag = await sessao();
    await sse(ag, '/api/search');
    // envelhece as entradas em 40 dias
    for (const f of arquivosCache()) {
      const arq = path.join(CACHE_DIR, f);
      const e = JSON.parse(fs.readFileSync(arq, 'utf-8'));
      e.geradoEm = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
      fs.writeFileSync(arq, JSON.stringify(e));
    }
    OpenAI.__reset();
    await sse(ag, '/api/search');
    expect(buscas()).toBe(4);
  });
});

describe('acerto de cache não consome orçamento nem calibra', () => {
  test('o gasto do projeto não aumenta e o fator de calibração não muda no acerto', async () => {
    process.env.ORCAMENTO_MAX_USD = '50';
    OpenAI.__setUsage(20_000, 1_000);
    const ag = await sessao();
    await sse(ag, '/api/search');
    const depoisDaPrimeira = (await ag.get('/api/orcamento')).body;
    expect(depoisDaPrimeira.projeto.gastoUsd).toBeGreaterThan(0);

    OpenAI.__reset();
    await sse(ag, '/api/search');
    const depoisDoAcerto = (await ag.get('/api/orcamento')).body;
    expect(buscas()).toBe(0);
    expect(depoisDoAcerto.projeto.gastoUsd).toBe(depoisDaPrimeira.projeto.gastoUsd);
    expect(depoisDoAcerto.calibracao).toEqual(depoisDaPrimeira.calibracao);
  });
});

describe('cache da pesquisa por módulo (GET /api/pesquisa-modulos)', () => {
  test('refazer a pesquisa por módulo reaproveita o cache e marca as consultas; semCache refaz de verdade', async () => {
    const ag = await sessaoComPlano();
    const primeira = await sse(ag, '/api/pesquisa-modulos');
    expect(primeira.map(e => e.type)).toContain('done');
    const chamadas = buscas();
    expect(chamadas).toBe(2); // um módulo por chamada

    OpenAI.__reset();
    const segunda = await sse(ag, '/api/pesquisa-modulos?refazer=1&semCache=0');
    // refazer=1 ignora também o cache (pedido explícito de nova pesquisa)
    expect(buscas()).toBe(2);
    expect(segunda.map(e => e.type)).toContain('done');

    // Sem refazer, a retomada por módulo já cobre; aqui apagamos o resultado do projeto e mantemos o cache global.
    fs.rmSync(path.join(SCR, 'pesquisa_modulos.json'), { force: true });
    OpenAI.__reset();
    const terceira = await sse(ag, '/api/pesquisa-modulos');
    expect(buscas()).toBe(0);
    expect(terceira.map(e => e.type)).toContain('done');
    expect(progresso(terceira).filter(m => /resultado do cache/.test(m))).toHaveLength(2);
    const meta = json('pesquisa_modulos.json');
    expect(meta.consultas.every(c => c.deCache === true)).toBe(true);
    expect(meta.completo).toBe(true);
  });
});

describe('modelo de pesquisa definido pelo perfil de custo', () => {
  const ARQ_PERFIS = path.join(__dirname, '..', '..', 'config', 'perfis-custo.json');

  // O arquivo de perfis é lido a cada uso; o teste o altera e restaura o original.
  async function comModeloPesquisaNoPerfil(modelo, fn) {
    const original = fs.readFileSync(ARQ_PERFIS, 'utf-8');
    const cfg = JSON.parse(original);
    cfg.perfis.padrao.modeloPesquisa = modelo;
    fs.writeFileSync(ARQ_PERFIS, JSON.stringify(cfg), 'utf-8');
    try { return await fn(); } finally { fs.writeFileSync(ARQ_PERFIS, original, 'utf-8'); }
  }

  test('o perfil com modeloPesquisa usa esse modelo nas consultas e o registra na pesquisa', async () => {
    await comModeloPesquisaNoPerfil('gpt-4o-mini', async () => {
      const ag = await sessao();
      const eventos = await sse(ag, '/api/search');
      expect(eventos.map(e => e.type)).toContain('done');
      const modelos = OpenAI.__getResponsesMock().mock.calls.map(([p]) => p.model);
      expect(modelos).toHaveLength(4);
      expect(new Set(modelos)).toEqual(new Set(['gpt-4o-mini']));
      expect(json('pesquisa.json').modelo).toBe('gpt-4o-mini');
      expect((await ag.get('/api/orcamento')).body.perfil.modeloPesquisa).toBe('gpt-4o-mini');
    });
  });

  test('o cache não serve o resultado de um modelo de pesquisa a outro (a chave inclui o modelo)', async () => {
    const ag = await sessao();
    await sse(ag, '/api/search'); // modelo padrão (gpt-4o) grava no cache
    OpenAI.__reset();
    await comModeloPesquisaNoPerfil('gpt-4o-mini', async () => {
      await sse(ag, '/api/search');
      expect(buscas()).toBe(4); // nenhuma consulta veio do cache do outro modelo
    });
  });

  test('sem modeloPesquisa no perfil, a pesquisa usa o modelo do papel (gpt-4o)', async () => {
    const ag = await sessao();
    await sse(ag, '/api/search');
    const modelos = OpenAI.__getResponsesMock().mock.calls.map(([p]) => p.model);
    expect(new Set(modelos)).toEqual(new Set(['gpt-4o']));
    expect((await ag.get('/api/orcamento')).body.perfil.modeloPesquisa).toBe('gpt-4o');
  });
});

describe('tokens em cache da OpenAI nas chamadas', () => {
  test('o log de geração registra entradaEmCache e o custo usa o preço de cache', async () => {
    OpenAI.__setUsage(10_000, 1_000);
    OpenAI.__setCachedTokens(8_000);
    const ag = await sessao();
    await sse(ag, '/api/search?semCache=1');
    const log = json('geracao_log.json').filter(r => r.tokens);
    expect(log.length).toBeGreaterThan(0);
    for (const r of log) {
      expect(r.tokens.entradaEmCache).toBe(8_000);
      // gpt-4o: 2.000 × 2,50 + 8.000 × 1,25 + 1.000 × 10 (por milhão) + tarifa da busca por chamada
      const tokens = (2_000 * 2.5 + 8_000 * 1.25 + 1_000 * 10) / 1_000_000;
      expect(r.custoUsd).toBeGreaterThanOrEqual(tokens - 1e-9);
      expect(r.custoUsd).toBeLessThan((10_000 * 2.5 + 1_000 * 10) / 1_000_000 + 0.05);
    }
  });

  test('sem o campo na resposta, entradaEmCache vale 0', async () => {
    OpenAI.__setUsage(10_000, 1_000);
    const ag = await sessao();
    await sse(ag, '/api/search?semCache=1');
    for (const r of json('geracao_log.json').filter(x => x.tokens)) expect(r.tokens.entradaEmCache).toBe(0);
  });
});
