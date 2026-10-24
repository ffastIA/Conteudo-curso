'use strict';

// Fronteira local (change endurecer-fronteira-local): bind, cookie, origem,
// seed, seletor de pasta, validação de pasta, upload e expiração de sessão.
jest.mock('openai');
jest.mock('mammoth');

const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'fronteira-'));
const app = require('../../server');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  jest.restoreAllMocks();
  fs.rmSync(raiz, { recursive: true, force: true });
});

describe('bind', () => {
  const original = process.env.HOST;
  afterEach(() => { if (original === undefined) delete process.env.HOST; else process.env.HOST = original; });

  test('padrão é 127.0.0.1', () => {
    delete process.env.HOST;
    expect(app.hostDeBind()).toBe('127.0.0.1');
  });
  test('HOST define o endereço', () => {
    process.env.HOST = '0.0.0.0';
    expect(app.hostDeBind()).toBe('0.0.0.0');
  });
  test('server.js chama listen com o host', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf-8');
    expect(src).toMatch(/app\.listen\(PORT,\s*HOST/);
  });
});

describe('cookie de sessão', () => {
  test('HttpOnly e SameSite=Lax', async () => {
    const res = await request(app).post('/api/config').send({});
    const cookie = (res.headers['set-cookie'] || []).join(';');
    expect(cookie).toMatch(/sessionId=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});

describe('seed de desenvolvimento', () => {
  test('GET /api/dev/seed responde 404 sem ENABLE_DEV_SEED', async () => {
    const res = await request(app).get('/api/dev/seed');
    expect(res.status).toBe(404);
  });
});

describe('verificação de origem', () => {
  test('Origin estranho em POST → 403', async () => {
    const res = await request(app).post('/api/config').set('Origin', 'https://outro-site.com').send({});
    expect(res.status).toBe(403);
  });
  test('Origin estranho em GET de /api → 403', async () => {
    const res = await request(app).get('/api/bncc?tipo=competencias').set('Origin', 'https://outro-site.com');
    expect(res.status).toBe(403);
  });
  test('Origin "null" → 403', async () => {
    const res = await request(app).post('/api/config').set('Origin', 'null').send({});
    expect(res.status).toBe(403);
  });
  test('Sec-Fetch-Site cross-site → 403', async () => {
    const res = await request(app).get('/api/bncc?tipo=competencias').set('Sec-Fetch-Site', 'cross-site');
    expect(res.status).toBe(403);
  });
  test('Host fora do loopback com bind em loopback (DNS rebinding) → 403', async () => {
    const res = await request(app).get('/api/bncc?tipo=competencias').set('Host', 'atacante.example.com');
    expect(res.status).toBe(403);
  });
  test('mesma origem passa', async () => {
    const srv = app.listen(0, '127.0.0.1');
    await new Promise(r => srv.once('listening', r));
    try {
      const { port } = srv.address();
      const ok = await request(`http://127.0.0.1:${port}`).get('/api/bncc?tipo=competencias').set('Origin', `http://127.0.0.1:${port}`);
      expect(ok.status).toBe(200);
    } finally {
      srv.close();
    }
  });
  test('HOST fora do loopback: Origin igual ao Host passa', async () => {
    process.env.HOST = '0.0.0.0';
    try {
      const res = await request(app).get('/api/bncc?tipo=competencias').set('Host', 'maquina.lan:3000').set('Origin', 'http://maquina.lan:3000');
      expect(res.status).toBe(200);
      const ruim = await request(app).get('/api/bncc?tipo=competencias').set('Host', 'maquina.lan:3000').set('Origin', 'http://outro.com');
      expect(ruim.status).toBe(403);
    } finally {
      delete process.env.HOST;
    }
  });
});

describe('seletor de pasta', () => {
  test('responde 403 quando o IP não é loopback', async () => {
    const handler = app._router.stack.find(l => l.route?.path === '/api/escolher-pasta').route.stack[0].handle;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await handler({ socket: { remoteAddress: '192.168.0.10' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('validação de pasta de projeto', () => {
  test('pasta vazia e inexistente são aceitas', () => {
    const vazia = fs.mkdtempSync(path.join(raiz, 'vazia-'));
    expect(app.validarPastaProjeto(vazia).ok).toBe(true);
    expect(app.validarPastaProjeto(path.join(raiz, 'nova')).ok).toBe(true);
  });
  test('pasta com scr/projeto.json é aceita', () => {
    const d = fs.mkdtempSync(path.join(raiz, 'proj-'));
    fs.mkdirSync(path.join(d, 'scr'));
    fs.writeFileSync(path.join(d, 'scr', 'projeto.json'), '{}');
    fs.writeFileSync(path.join(d, 'x.txt'), 'x');
    expect(app.validarPastaProjeto(d).ok).toBe(true);
  });
  test('pasta arbitrária com conteúdo é recusada', () => {
    const d = fs.mkdtempSync(path.join(raiz, 'arb-'));
    fs.writeFileSync(path.join(d, 'segredo.txt'), 'x');
    const v = app.validarPastaProjeto(d);
    expect(v.ok).toBe(false);
    expect(v.erro).toMatch(/projeto\.json/);
  });
  test('/api/carregar-projeto recusa pasta arbitrária com 400', async () => {
    const d = fs.mkdtempSync(path.join(raiz, 'arb2-'));
    fs.writeFileSync(path.join(d, 'segredo.txt'), 'x');
    const res = await request(app).post('/api/carregar-projeto').send({ pasta: d });
    expect(res.status).toBe(400);
  });
  test('/api/config recusa pasta arbitrária com 400', async () => {
    const d = fs.mkdtempSync(path.join(raiz, 'arb3-'));
    fs.writeFileSync(path.join(d, 'segredo.txt'), 'x');
    const res = await request(app).post('/api/config').send({
      nome: 'X', publico: 'p', carga: '2', duracao: '60', nivel: 'basico', objetivos: 'o',
      modalidade: 'online', proporcaoTeoricoPratico: '40/60', pastaProjeto: d
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vazia|projeto/i);
  });
});

describe('upload', () => {
  test('arquivo que não é .docx → 400 sem processar', async () => {
    const res = await request(app).post('/api/aplicar-melhorias').attach('arquivo', Buffer.from('x'), 'a.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/docx/i);
  });
  test('arquivo acima do limite → 413', async () => {
    let appPequeno;
    jest.isolateModules(() => {
      process.env.UPLOAD_MAX_BYTES = '1024';
      appPequeno = require('../../server');
    });
    delete process.env.UPLOAD_MAX_BYTES;
    const res = await request(appPequeno).post('/api/aplicar-melhorias').attach('arquivo', Buffer.alloc(4096, 1), 'grande.docx');
    expect(res.status).toBe(413);
  });
});

describe('expiração de sessão', () => {
  test('remove sessões inativas há mais de 12 h e mantém as recentes', () => {
    const agora = Date.now();
    app.sessions.velha = { ultimoAcesso: agora - 13 * 3600 * 1000 };
    app.sessions.recente = { ultimoAcesso: agora - 3600 * 1000 };
    expect(app.limparSessoesInativas(agora)).toBeGreaterThanOrEqual(1);
    expect(app.sessions.velha).toBeUndefined();
    expect(app.sessions.recente).toBeDefined();
    delete app.sessions.recente;
  });
});
