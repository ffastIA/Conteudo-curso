'use strict';

jest.mock('openai');
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFile: jest.fn()
}));

const request = require('supertest');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const app = require('../../server');

let tmp;
let arquivo;

// Faz o execFile mockado responder como o PowerShell: stdout = pasta escolhida
// ('' simula cancelamento) ou erro.
function dialogoRetorna(stdout) {
  execFile.mockImplementation((_cmd, _args, _opts, cb) => cb(null, stdout, ''));
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-ultima-pasta-'));
  arquivo = path.join(tmp, 'ultima-pasta.json');
  process.env.ULTIMA_PASTA_FILE = arquivo;
  execFile.mockReset();
});

afterEach(() => {
  delete process.env.ULTIMA_PASTA_FILE;
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('GET /api/escolher-pasta — última pasta lembrada', () => {
  test('grava a pasta escolhida', async () => {
    const escolhida = fs.mkdtempSync(path.join(tmp, 'curso-'));
    dialogoRetorna(`${escolhida}\r\n`);

    const res = await request(app).get('/api/escolher-pasta');

    expect(res.status).toBe(200);
    expect(res.body.pasta).toBe(escolhida);
    expect(JSON.parse(fs.readFileSync(arquivo, 'utf-8')).pasta).toBe(escolhida);
  });

  test('próxima abertura repassa a última pasta como PASTA_INICIAL', async () => {
    const escolhida = fs.mkdtempSync(path.join(tmp, 'curso-'));
    fs.writeFileSync(arquivo, JSON.stringify({ pasta: escolhida }), 'utf-8');
    dialogoRetorna('');

    await request(app).get('/api/escolher-pasta');

    const opts = execFile.mock.calls[0][2];
    expect(opts.env.PASTA_INICIAL).toBe(escolhida);
    // O caminho não é interpolado no texto do script PowerShell.
    expect(execFile.mock.calls[0][1].join(' ')).not.toContain(escolhida);
  });

  test('cancelar não altera a pasta lembrada', async () => {
    const escolhida = fs.mkdtempSync(path.join(tmp, 'curso-'));
    fs.writeFileSync(arquivo, JSON.stringify({ pasta: escolhida }), 'utf-8');
    const antes = fs.readFileSync(arquivo, 'utf-8');
    dialogoRetorna('');

    const res = await request(app).get('/api/escolher-pasta');

    expect(res.body.pasta).toBeNull();
    expect(fs.readFileSync(arquivo, 'utf-8')).toBe(antes);
  });

  test('pasta lembrada que não existe mais é ignorada', async () => {
    fs.writeFileSync(arquivo, JSON.stringify({ pasta: path.join(tmp, 'removida') }), 'utf-8');
    dialogoRetorna('');

    await request(app).get('/api/escolher-pasta');

    expect(execFile.mock.calls[0][2].env.PASTA_INICIAL).toBe('');
  });

  test('arquivo de persistência corrompido não quebra o seletor', async () => {
    fs.writeFileSync(arquivo, '{{{ lixo', 'utf-8');
    const escolhida = fs.mkdtempSync(path.join(tmp, 'curso-'));
    dialogoRetorna(escolhida);

    const res = await request(app).get('/api/escolher-pasta');

    expect(res.status).toBe(200);
    expect(res.body.pasta).toBe(escolhida);
    expect(execFile.mock.calls[0][2].env.PASTA_INICIAL).toBe('');
    expect(JSON.parse(fs.readFileSync(arquivo, 'utf-8')).pasta).toBe(escolhida);
  });

  test('falha ao gravar a persistência não impede o retorno da pasta', async () => {
    // Aponta o arquivo para dentro de um diretório inexistente: a gravação falha.
    process.env.ULTIMA_PASTA_FILE = path.join(tmp, 'nao-existe', 'ultima.json');
    const escolhida = fs.mkdtempSync(path.join(tmp, 'curso-'));
    dialogoRetorna(escolhida);

    const res = await request(app).get('/api/escolher-pasta');

    expect(res.status).toBe(200);
    expect(res.body.pasta).toBe(escolhida);
  });

  test('erro do PowerShell continua retornando 500 com mensagem', async () => {
    execFile.mockImplementation((_cmd, _args, _opts, cb) => cb(new Error('falhou'), '', 'stderr'));

    const res = await request(app).get('/api/escolher-pasta');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});
