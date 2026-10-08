'use strict';

jest.mock('openai');

const request = require('supertest');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

function novaPasta(prefixo) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
  const scrDir = path.join(baseDir, 'scr');
  fs.mkdirSync(scrDir, { recursive: true });
  return { baseDir, scrDir };
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('POST /api/carregar-projeto com projeto.json corrompido', () => {
  test('carrega os .txt, preserva o arquivo como .bak e devolve aviso', async () => {
    const { baseDir, scrDir } = novaPasta('gc-corrompido-txt-');
    const lixo = 'You are grading whether retrieved excerpts are sufficient...';
    fs.writeFileSync(path.join(scrDir, 'projeto.json'), lixo, 'utf-8');
    fs.writeFileSync(path.join(scrDir, 'ementa.txt'), '# Ementa\nTexto da ementa', 'utf-8');
    fs.writeFileSync(path.join(scrDir, 'aula01_conteudo.txt'), '# Aula 1 - Introdução\nConteúdo', 'utf-8');

    const res = await request(app).post('/api/carregar-projeto').send({ pasta: baseDir });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.aviso).toMatch(/corrompido/i);
    expect(res.body.etapasCarregadas).toEqual(expect.arrayContaining(['ementa', 'aula01_conteudo']));
    expect(res.body.arquivos.map(a => a.baseName)).toEqual(expect.arrayContaining(['ementa', 'aula01_conteudo']));
    expect(res.body.camposFaltantes).toEqual(expect.arrayContaining(['bncc', 'metodologia']));

    expect(res.body.backup).toMatch(/^projeto\.json\.corrompido-.*\.bak$/);
    expect(fs.readFileSync(path.join(scrDir, res.body.backup), 'utf-8')).toBe(lixo);
    // O conteúdo ruim não permanece em projeto.json: ou o arquivo some, ou é
    // regenerado como JSON válido (autocura reconstrói as aulas e regrava).
    const projetoPath = path.join(scrDir, 'projeto.json');
    if (fs.existsSync(projetoPath)) {
      expect(() => JSON.parse(fs.readFileSync(projetoPath, 'utf-8'))).not.toThrow();
    }
  });

  test('segunda carga não gera outro .bak', async () => {
    const { baseDir, scrDir } = novaPasta('gc-corrompido-2x-');
    fs.writeFileSync(path.join(scrDir, 'projeto.json'), '{{{', 'utf-8');
    fs.writeFileSync(path.join(scrDir, 'ementa.txt'), 'x', 'utf-8');

    await request(app).post('/api/carregar-projeto').send({ pasta: baseDir });
    const res2 = await request(app).post('/api/carregar-projeto').send({ pasta: baseDir });

    expect(res2.status).toBe(200);
    expect(res2.body.aviso).toBeUndefined();
    const baks = fs.readdirSync(scrDir).filter(f => f.endsWith('.bak'));
    expect(baks).toHaveLength(1);
  });

  test('falha no rename não aborta o carregamento (aviso sem backup)', async () => {
    const { baseDir, scrDir } = novaPasta('gc-corrompido-rename-');
    fs.writeFileSync(path.join(scrDir, 'projeto.json'), '{{{', 'utf-8');
    fs.writeFileSync(path.join(scrDir, 'ementa.txt'), 'x', 'utf-8');

    const spy = jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('EPERM'); });
    let res;
    try {
      res = await request(app).post('/api/carregar-projeto').send({ pasta: baseDir });
    } finally {
      spy.mockRestore();
    }

    expect(res.status).toBe(200);
    expect(res.body.aviso).toMatch(/corrompido/i);
    expect(res.body.backup).toBeUndefined();
    expect(res.body.etapasCarregadas).toContain('ementa');
  });

  test('projeto.json válido continua sendo carregado sem aviso', async () => {
    const { baseDir, scrDir } = novaPasta('gc-valido-');
    fs.writeFileSync(path.join(scrDir, 'projeto.json'), JSON.stringify({
      config: { nome: 'Curso Válido' },
      bncc: { ativo: false, publico: null, nivel: null, itens: [] },
      metodologia: 'm',
      aulas: [],
      stages: {}
    }), 'utf-8');
    fs.writeFileSync(path.join(scrDir, 'ementa.txt'), 'x', 'utf-8');

    const res = await request(app).post('/api/carregar-projeto').send({ pasta: baseDir });

    expect(res.status).toBe(200);
    expect(res.body.aviso).toBeUndefined();
    expect(res.body.nome).toBe('Curso Válido');
    expect(fs.readdirSync(scrDir).filter(f => f.endsWith('.bak'))).toHaveLength(0);
  });
});

describe('saveProject — gravação atômica', () => {
  test('projeto.json fica válido e sem temporário residual', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-atomico-'));
    const agent = request.agent(app);

    const res = await agent.post('/api/config').send({
      nome: 'Curso Atômico',
      publico: 'Qualquer',
      carga: '10',
      duracao: '60',
      nivel: 'basico',
      objetivos: 'Testar',
      modalidade: 'online',
      proporcaoTeoricoPratico: '50% / 50%',
      preRequisitos: '',
      pastaProjeto: baseDir
    });
    expect(res.status).toBe(200);

    const scrDir = path.join(baseDir, 'scr');
    const json = JSON.parse(fs.readFileSync(path.join(scrDir, 'projeto.json'), 'utf-8'));
    expect(json.config.nome).toBe('Curso Atômico');
    expect(fs.readdirSync(scrDir).filter(f => f.includes('.tmp-'))).toHaveLength(0);
  });
});
