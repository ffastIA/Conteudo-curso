'use strict';

jest.mock('openai');

const request = require('supertest');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const VALID_CONFIG = {
  nome: 'Curso de Node.js',
  publico: 'Desenvolvedores júnior',
  carga: '40',
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender Node.js',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-de-node-js')
};

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ── 5.2: POST /api/config com payload completo → 200 ─────────────────────────
describe('POST /api/config', () => {
  test('payload completo retorna 200', async () => {
    const res = await request(app)
      .post('/api/config')
      .send(VALID_CONFIG);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  // ── 5.3: sem modalidade → 400 ──────────────────────────────────────────────
  test('sem modalidade retorna 400', async () => {
    const { modalidade, ...payload } = VALID_CONFIG;
    const res = await request(app)
      .post('/api/config')
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('sem proporcaoTeoricoPratico retorna 400', async () => {
    const { proporcaoTeoricoPratico, ...payload } = VALID_CONFIG;
    const res = await request(app)
      .post('/api/config')
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('sem pastaProjeto retorna 400', async () => {
    const { pastaProjeto, ...payload } = VALID_CONFIG;
    const res = await request(app)
      .post('/api/config')
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ── 5.4: GET /api/bncc?nivel=ef1 → 200 com itens ─────────────────────────────
describe('GET /api/bncc', () => {
  test('nivel=ef1 retorna 200 com itens', async () => {
    const res = await request(app).get('/api/bncc?nivel=ef1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('itens');
    expect(Array.isArray(res.body.itens)).toBe(true);
    expect(res.body.itens.length).toBeGreaterThan(0);
  });

  test('nivel=ef2 retorna itens', async () => {
    const res = await request(app).get('/api/bncc?nivel=ef2');
    expect(res.status).toBe(200);
    expect(res.body.itens.length).toBeGreaterThan(0);
  });

  test('nivel=em retorna itens', async () => {
    const res = await request(app).get('/api/bncc?nivel=em');
    expect(res.status).toBe(200);
    expect(res.body.itens.length).toBeGreaterThan(0);
  });

  // ── 5.5: tipo=competencias retorna C2 e C5 ─────────────────────────────────
  test('tipo=competencias retorna 200 com C2 e C5', async () => {
    const res = await request(app).get('/api/bncc?tipo=competencias');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('itens');
    const ids = res.body.itens.map(i => i.id);
    expect(ids).toContain('C2');
    expect(ids).toContain('C5');
  });

  // ── 5.6: nível inválido → 400 ──────────────────────────────────────────────
  test('nivel invalido retorna 400', async () => {
    const res = await request(app).get('/api/bncc?nivel=invalido');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ── 5.7 + 5.8: POST /api/bncc/selecionar ─────────────────────────────────────
describe('POST /api/bncc/selecionar', () => {
  test('seleção válida retorna 200', async () => {
    const res = await request(app)
      .post('/api/bncc/selecionar')
      .send({
        publico: 'basica',
        nivel: 'ef1',
        itens: [{ id: '1', codigo: 'EF04LP01', descricao: 'Identificar tecnologias digitais' }]
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  test('itens vazio retorna 400', async () => {
    const res = await request(app)
      .post('/api/bncc/selecionar')
      .send({ publico: 'basica', nivel: 'ef1', itens: [] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ── 5.9: POST /api/export/ementa sem sessão → 400 ────────────────────────────
describe('POST /api/export/ementa', () => {
  test('sem ementa na sessão retorna 400', async () => {
    const res = await request(app)
      .post('/api/export/ementa')
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── POST /api/export/:step — gera .docx válido em disco ──────────────────────
describe('POST /api/export/plano-ensino', () => {
  test('com conteúdo gera .docx válido (assinatura ZIP) na pastaProjeto', async () => {
    const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-export-'));
    const ag = request.agent(app);
    await ag.post('/api/config').send({ ...VALID_CONFIG, pastaProjeto });
    await ag.post('/api/importar/confirmar').send({
      stage: 'plano_de_ensino',
      texto: 'Conteúdo de teste do plano de ensino, usado para validar a exportação em .docx.'
    });

    const res = await ag.post('/api/export/plano-ensino').send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, saved: true });
    expect(typeof res.body.path).toBe('string');

    const buffer = fs.readFileSync(res.body.path);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.slice(0, 2).toString('latin1')).toBe('PK'); // assinatura ZIP (.docx)
  });

  test('sem conteúdo na sessão retorna 400 com error', async () => {
    const res = await request(app)
      .post('/api/export/plano-ensino')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ── POST /api/carregar-projeto — reconstrói sessão a partir do disco ─────────
describe('POST /api/carregar-projeto', () => {
  test('pasta com projeto.json válido e ementa.txt carrega a etapa', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-carregar-'));
    const scrDir = path.join(baseDir, 'scr');
    fs.mkdirSync(scrDir, { recursive: true });
    fs.writeFileSync(path.join(scrDir, 'projeto.json'), JSON.stringify({
      config: { nome: 'Curso Carregado', pastaProjeto: baseDir },
      bncc: { ativo: false, publico: null, nivel: null, itens: [] },
      metodologia: '',
      aulas: [],
      inputs: {},
      estiloVisual: null,
      stages: {}
    }), 'utf-8');
    fs.writeFileSync(path.join(scrDir, 'ementa.txt'), 'Ementa de teste do curso carregado.', 'utf-8');

    const res = await request(app)
      .post('/api/carregar-projeto')
      .send({ pasta: baseDir });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.etapasCarregadas).toContain('ementa');
    expect(res.body.config).toMatchObject({ nome: 'Curso Carregado' });
  });

  test('pasta inexistente retorna 404', async () => {
    const pastaInexistente = path.join(os.tmpdir(), 'gc-carregar-inexistente-' + Date.now());
    const res = await request(app)
      .post('/api/carregar-projeto')
      .send({ pasta: pastaInexistente });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('projeto.json corrompido retorna 200 com aviso de corrupção', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-carregar-corrompido-'));
    const scrDir = path.join(baseDir, 'scr');
    fs.mkdirSync(scrDir, { recursive: true });
    fs.writeFileSync(path.join(scrDir, 'projeto.json'), '{{{ isso não é JSON válido', 'utf-8');

    const res = await request(app)
      .post('/api/carregar-projeto')
      .send({ pasta: baseDir });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('aviso');
    expect(res.body.aviso).toMatch(/corrompido/i);
  });
});

// ── Extra: endpoints simples ──────────────────────────────────────────────────
describe('GET /api/tokens', () => {
  test('retorna total de tokens como número', async () => {
    const res = await request(app).get('/api/tokens');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(typeof res.body.total).toBe('number');
  });
});

describe('POST /api/bncc/pular', () => {
  test('reseta BNCC da sessão e retorna ok', async () => {
    const res = await request(app).post('/api/bncc/pular');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

describe('GET /api/metodologia', () => {
  test('com config válido retorna metodologia', async () => {
    const OpenAIModule = require('openai');
    OpenAIModule.__setResponse('Metodologia: Aprendizagem Baseada em Projetos.');

    const ag = request.agent(app);
    await ag.post('/api/config').send(VALID_CONFIG);
    const res = await ag.get('/api/metodologia');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('metodologia');
    expect(typeof res.body.metodologia).toBe('string');
  });

  test('sem config retorna metodologia vazia ou ok', async () => {
    const OpenAIModule = require('openai');
    OpenAIModule.__setResponse('');
    const res = await request(app).get('/api/metodologia');
    expect([200, 500]).toContain(res.status);
  });
});
