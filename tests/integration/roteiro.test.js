'use strict';

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

function baseConfig(pastaProjeto) {
  return {
    nome: 'Curso de Roteiros',
    publico: 'Jovens de 16 a 18 anos',
    carga: '1',
    duracao: '60',
    nivel: 'intermediario',
    objetivos: 'Aprender o assunto do curso',
    modalidade: 'online',
    proporcaoTeoricoPratico: '40% teórico / 60% prático',
    preRequisitos: '',
    pastaProjeto
  };
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  OpenAI.__reset();
});

function agent() {
  return request.agent(app);
}

function parseSSE(body) {
  const text = typeof body === 'string' ? body : body.toString();
  return text
    .split('\n\n')
    .filter(block => block.startsWith('data:'))
    .map(block => {
      try { return JSON.parse(block.replace(/^data:\s*/, '')); }
      catch { return null; }
    })
    .filter(Boolean);
}

async function collectSSE(ag, urlPath) {
  const res = await ag
    .get(urlPath)
    .buffer(true)
    .parse((res, callback) => {
      let data = '';
      res.on('data', chunk => { data += chunk.toString(); });
      res.on('end', () => callback(null, data));
    });
  return res;
}

// Popula sess.aulas com N aulas via GET /api/plano-aula, cuja primeira chamada
// (planLessons) é não-streaming em response_format json_object — devolvendo o
// texto exato da fila do mock como o JSON de aulas.
async function configurarCursoComAulas(ag, aulas) {
  const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-roteiro-'));
  await ag.post('/api/config').send(baseConfig(pastaProjeto));
  OpenAI.__setResponses([JSON.stringify({ aulas })]);
  await collectSSE(ag, '/api/plano-aula');
  return pastaProjeto;
}

describe('POST /api/roteiro/blocos', () => {
  test('valor válido (1-6) retorna 200 e grava a escolha', async () => {
    const res = await request(app).post('/api/roteiro/blocos').send({ blocos: 4 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, blocos: 4 });
  });

  test.each([0, 7, 1.5, 'x', null, undefined])('valor inválido (%p) retorna 400', async (blocos) => {
    const res = await request(app).post('/api/roteiro/blocos').send({ blocos });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/roteiro/prompt', () => {
  test('sem Etapa 4 concluída (sess.aulas vazio) retorna 400', async () => {
    const ag = agent();
    const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-roteiro-'));
    await ag.post('/api/config').send(baseConfig(pastaProjeto));
    await ag.post('/api/roteiro/blocos').send({ blocos: 3 });

    const res = await ag.get('/api/roteiro/prompt?index=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Etapa 4/);
  });

  test('sem blocos escolhidos retorna 400', async () => {
    const ag = agent();
    await configurarCursoComAulas(ag, [
      { titulo: 'Memórias RAM, ROM e Dispositivos de Armazenamento', modulo: '', objetivos: 'Definir RAM e ROM' }
    ]);

    const res = await ag.get('/api/roteiro/prompt?index=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blocos/i);
  });

  test('índice fora do intervalo retorna 400', async () => {
    const ag = agent();
    await configurarCursoComAulas(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);
    await ag.post('/api/roteiro/blocos').send({ blocos: 2 });

    const res = await ag.get('/api/roteiro/prompt?index=5');
    expect(res.status).toBe(400);
  });

  test('monta o prompt concatenando tema + objetivos e substituindo idade/blocos', async () => {
    const ag = agent();
    await configurarCursoComAulas(ag, [
      {
        titulo: 'Memórias RAM, ROM e Dispositivos de Armazenamento',
        modulo: '',
        objetivos: 'Definir o que são Memórias RAM e ROM, suas características e funções'
      }
    ]);
    await ag.post('/api/roteiro/blocos').send({ blocos: 4 });

    const res = await ag.get('/api/roteiro/prompt?index=0');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ index: 0, numero: '01', total: 1 });
    expect(res.body.prompt).toContain('Memórias RAM, ROM e Dispositivos de Armazenamento');
    expect(res.body.prompt).toContain('Definir o que são Memórias RAM e ROM, suas características e funções');
    expect(res.body.prompt).toContain('Jovens de 16 a 18 anos');
    expect(res.body.prompt).toContain('Gere [4] blocos.');
    expect(res.body.prompt).not.toMatch(/%%/);
  });
});

describe('POST /api/roteiro/aprovar + GET /api/roteiro/gerar', () => {
  test('aprovar sem texto retorna 400', async () => {
    const ag = agent();
    await configurarCursoComAulas(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    const res = await ag.post('/api/roteiro/aprovar').send({ index: 0, texto: '' });
    expect(res.status).toBe(400);
  });

  test('gerar sem prompt aprovado emite evento SSE error', async () => {
    const ag = agent();
    await configurarCursoComAulas(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    const res = await collectSSE(ag, '/api/roteiro/gerar');
    const events = parseSSE(res.body);
    expect(events.some(e => e.type === 'error')).toBe(true);
  });

  test('curso de 1 aula: gera 1 roteiro e proximoIndex é null (fim do ciclo)', async () => {
    const ag = agent();
    const pastaProjeto = await configurarCursoComAulas(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);
    await ag.post('/api/roteiro/blocos').send({ blocos: 2 });
    await ag.post('/api/roteiro/aprovar').send({ index: 0, texto: 'Prompt aprovado da aula 1' });

    OpenAI.__setResponse('roteiro gerado da aula 1');
    const res = await collectSSE(ag, '/api/roteiro/gerar');
    const events = parseSSE(res.body);
    const done = events.find(e => e.type === 'done');

    expect(done).toBeDefined();
    expect(done.numero).toBe('01');
    expect(done.proximoIndex).toBeNull();

    expect(fs.existsSync(path.join(pastaProjeto, 'roteiro01.docx'))).toBe(true);
    expect(fs.existsSync(path.join(pastaProjeto, 'scr', 'roteiro01.txt'))).toBe(true);
  });

  test('substitui o placeholder "[REPETIR EXATAMENTE O BLOCO DE VOZ ACIMA]" pelo texto real da voz, quando a IA o deixa literal', async () => {
    const ag = agent();
    const pastaProjeto = await configurarCursoComAulas(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);
    await ag.post('/api/roteiro/blocos').send({ blocos: 1 });
    await ag.post('/api/roteiro/aprovar').send({ index: 0, texto: 'Prompt aprovado da aula 1' });

    OpenAI.__setResponse(
      '## BLOCO 1 — TÍTULO\n\n🎙️ VOZ DO AVATAR:\n\n[REPETIR EXATAMENTE O BLOCO DE VOZ ACIMA]\n\n🗣️ FALA: Olá!'
    );
    const res = await collectSSE(ag, '/api/roteiro/gerar');
    const done = parseSSE(res.body).find(e => e.type === 'done');

    expect(done.fullText).not.toMatch(/REPETIR EXATAMENTE/i);
    expect(done.fullText).toContain('Voz masculina, aveludada, quente e amigável');

    const persistido = fs.readFileSync(path.join(pastaProjeto, 'scr', 'roteiro01.txt'), 'utf-8');
    expect(persistido).not.toMatch(/REPETIR EXATAMENTE/i);
    expect(persistido).toContain('Voz masculina, aveludada, quente e amigável');
  });

  test('curso de 3 aulas: proximoIndex avança aula a aula e termina null na última', async () => {
    const ag = agent();
    const pastaProjeto = await configurarCursoComAulas(ag, [
      { titulo: 'Aula 1', modulo: '', objetivos: 'Obj 1' },
      { titulo: 'Aula 2', modulo: '', objetivos: 'Obj 2' },
      { titulo: 'Aula 3', modulo: '', objetivos: 'Obj 3' }
    ]);
    await ag.post('/api/roteiro/blocos').send({ blocos: 3 });

    for (let i = 0; i < 3; i++) {
      await ag.post('/api/roteiro/aprovar').send({ index: i, texto: `Prompt aprovado da aula ${i + 1}` });
      OpenAI.__setResponse(`roteiro gerado da aula ${i + 1}`);
      const res = await collectSSE(ag, '/api/roteiro/gerar');
      const done = parseSSE(res.body).find(e => e.type === 'done');

      expect(done.numero).toBe(String(i + 1).padStart(2, '0'));
      if (i < 2) expect(done.proximoIndex).toBe(i + 1);
      else expect(done.proximoIndex).toBeNull();
    }

    expect(fs.existsSync(path.join(pastaProjeto, 'roteiro01.docx'))).toBe(true);
    expect(fs.existsSync(path.join(pastaProjeto, 'roteiro02.docx'))).toBe(true);
    expect(fs.existsSync(path.join(pastaProjeto, 'roteiro03.docx'))).toBe(true);
    // Cardinalidade: exatamente 1 roteiro por aula, nenhum arquivo extra.
    expect(fs.existsSync(path.join(pastaProjeto, 'roteiro04.docx'))).toBe(false);
  });
});
