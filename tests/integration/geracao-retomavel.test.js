'use strict';

jest.mock('openai');

// Cadência curta do polling do Gamma (lida do env na carga do módulo).
process.env.GAMMA_POLL_INTERVAL_MS = '20';
process.env.GAMMA_POLL_TIMEOUT_MS = '300';
process.env.GAMMA_TEMPLATE_IDS = '';

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const PASTA = path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-retomavel');
const SCR = path.join(PASTA, 'scr');
const CONFIG = {
  nome: 'Curso Retomável',
  publico: 'Desenvolvedores júnior',
  carga: '3', // 3 aulas
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender JavaScript',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: PASTA
};
const AULAS = [
  { titulo: 'Variáveis', modulo: 'Fundamentos', objetivos: 'declarar variáveis' },
  { titulo: 'Funções', modulo: 'Fundamentos', objetivos: 'criar funções' },
  { titulo: 'Objetos', modulo: 'Fundamentos', objetivos: 'trabalhar com objetos' }
];
const ENV_ORIGINAL = { ...process.env };

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  OpenAI.__reset();
  fs.rmSync(PASTA, { recursive: true, force: true });
  process.env.CONTEUDO_MODO = 'unico';
});

afterEach(() => {
  delete global.fetch;
  for (const k of ['CONTEUDO_PARALELISMO', 'RATE_LIMIT_MAX_RETENTATIVAS', 'RATE_LIMIT_BACKOFF_BASE_MS', 'CONTEUDO_MODO']) {
    if (ENV_ORIGINAL[k] === undefined) delete process.env[k]; else process.env[k] = ENV_ORIGINAL[k];
  }
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

const chatCalls = () => OpenAI.__getMock().mock.calls.map(([params]) => params);
const prompt = (c) => c.messages[1].content;
const json = (nome) => JSON.parse(fs.readFileSync(path.join(SCR, nome), 'utf-8'));

async function sessao() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(CONFIG);
  return ag;
}

// Sessão com plano de aula pronto (3 aulas) — o /api/conteudo parte daí.
async function sessaoComPlano() {
  const ag = await sessao();
  OpenAI.__setResponders = undefined;
  OpenAI.__setResponder((params) => params.response_format
    ? JSON.stringify({ aulas: AULAS })
    : `Plano da aula: ${prompt(params).match(/Aula (\d) de 3/)?.[1] || '?'}.`);
  await sse(ag, '/api/plano-aula');
  OpenAI.__reset();
  return ag;
}

describe('plano de aula retomável', () => {
  test('grava plano_aulaNN.txt por aula, consolida no fim e remove o progresso temporário', async () => {
    const ag = request.agent(app);
    await ag.post('/api/config').send(CONFIG);
    OpenAI.__setResponder((params) => params.response_format ? JSON.stringify({ aulas: AULAS }) : `Plano da aula ${prompt(params).match(/Aula (\d) de 3/)[1]}.`);

    const eventos = await sse(ag, '/api/plano-aula');

    expect(eventos.find(e => e.type === 'done')).toBeDefined();
    const consolidado = fs.readFileSync(path.join(SCR, 'plano_de_aula.txt'), 'utf-8');
    expect(consolidado).toContain('# Aula 1: Variáveis');
    expect(consolidado).toContain('# Aula 3: Objetos');
    expect(consolidado).toContain('Plano da aula 2.');
    expect(fs.existsSync(path.join(PASTA, 'plano_de_aula.docx'))).toBe(true);
    // progresso temporário limpo
    expect(fs.readdirSync(SCR).filter(f => /^plano_aula\d+\.txt$|plano_aula_progresso/.test(f))).toEqual([]);
  });

  test('cada aula usa teto de tokens (max_tokens) e a chamada passa pelo timeout de inatividade', async () => {
    const ag = await sessao();
    OpenAI.__setResponder((params) => params.response_format ? JSON.stringify({ aulas: AULAS }) : 'Plano.');
    await sse(ag, '/api/plano-aula');
    const chamadasPlano = chatCalls().filter(c => c.stream);
    expect(chamadasPlano).toHaveLength(3);
    for (const c of chamadasPlano) expect(c.max_tokens).toBe(8000);
  });

  test('queda no meio: 1 de 3 aulas pronta + manifesto → a nova execução gera só as faltantes e consolida as 3', async () => {
    const ag = await sessao();
    fs.mkdirSync(SCR, { recursive: true });
    fs.writeFileSync(path.join(SCR, 'plano_aula_progresso.json'), JSON.stringify({ aulas: AULAS }), 'utf-8');
    fs.writeFileSync(path.join(SCR, 'plano_aula01.txt'), 'PLANO-DA-AULA-1-JA-PRONTO', 'utf-8');
    OpenAI.__setResponder((params) => `Gerado agora: ${prompt(params).match(/Aula (\d) de 3/)[1]}.`);

    const eventos = await sse(ag, '/api/plano-aula');

    const calls = chatCalls();
    expect(calls).toHaveLength(2); // sem nova divisão em aulas e sem refazer a aula 1
    expect(calls.every(c => !c.response_format)).toBe(true);
    expect(prompt(calls[0])).toContain('Aula 2 de 3');
    expect(eventos.some(e => e.type === 'progress' && /Retomando o plano de aula: 1 de 3/.test(e.message))).toBe(true);
    const consolidado = fs.readFileSync(path.join(SCR, 'plano_de_aula.txt'), 'utf-8');
    expect(consolidado).toContain('PLANO-DA-AULA-1-JA-PRONTO');
    expect(consolidado).toContain('Gerado agora: 2.');
    expect(consolidado).toContain('Gerado agora: 3.');
    expect(fs.readdirSync(SCR).filter(f => /^plano_aula\d+\.txt$|plano_aula_progresso/.test(f))).toEqual([]);
  });

  test('?refazer=1 ignora o progresso anterior', async () => {
    const ag = await sessao();
    fs.mkdirSync(SCR, { recursive: true });
    fs.writeFileSync(path.join(SCR, 'plano_aula_progresso.json'), JSON.stringify({ aulas: AULAS }), 'utf-8');
    fs.writeFileSync(path.join(SCR, 'plano_aula01.txt'), 'ANTIGO', 'utf-8');
    OpenAI.__setResponder((params) => params.response_format ? JSON.stringify({ aulas: AULAS }) : 'Novo plano.');

    await sse(ag, '/api/plano-aula?refazer=1');

    expect(chatCalls().filter(c => c.response_format)).toHaveLength(1); // dividiu as aulas de novo
    expect(chatCalls().filter(c => c.stream)).toHaveLength(3);
    expect(fs.readFileSync(path.join(SCR, 'plano_de_aula.txt'), 'utf-8')).not.toContain('ANTIGO');
  });

  test('cliente que desconecta deixa o progresso em disco para a retomada', async () => {
    const ag = await sessao();
    // 1ª aula gera; o servidor "cai" na 2ª (erro) — a aula 1 já está em plano_aula01.txt
    OpenAI.__setResponder((params) => params.response_format ? JSON.stringify({ aulas: AULAS }) : 'Plano ok.');
    OpenAI.__setErrors([]);
    let n = 0;
    OpenAI.__setResponder((params) => {
      if (params.response_format) return JSON.stringify({ aulas: AULAS });
      n += 1;
      if (n === 2) throw new OpenAI.BadRequestError('falha na aula 2');
      return `Plano ${n}.`;
    });
    const eventos = await sse(ag, '/api/plano-aula');
    expect(eventos.find(e => e.type === 'error')).toBeDefined();
    expect(fs.readFileSync(path.join(SCR, 'plano_aula01.txt'), 'utf-8')).toContain('Plano 1.');
    expect(fs.existsSync(path.join(SCR, 'plano_aula_progresso.json'))).toBe(true);
    expect(fs.existsSync(path.join(SCR, 'plano_de_aula.txt'))).toBe(false);
  });
});

describe('conteúdo retomável: pula aulas completas', () => {
  test('nova execução na mesma sessão não refaz aulas completas; ?refazer=1 refaz tudo', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponder(() => 'Texto da aula completo e fechado.');
    await sse(ag, '/api/conteudo');
    expect(chatCalls()).toHaveLength(3);
    OpenAI.__reset();
    OpenAI.__setResponder(() => 'Texto da aula completo e fechado.');

    const eventos = await sse(ag, '/api/conteudo');

    expect(chatCalls()).toHaveLength(0); // nada refeito
    const done = eventos.find(e => e.type === 'done');
    expect(done.puladas).toEqual([1, 2, 3]);
    expect(eventos.filter(e => e.type === 'progress' && /já está completa/.test(e.message))).toHaveLength(3);
    expect(done.fullText).toContain('# Aula 2: Funções');
    expect(done.fullText).toContain('Texto da aula completo e fechado.');

    const refeito = await sse(ag, '/api/conteudo?refazer=1');
    expect(chatCalls()).toHaveLength(3);
    expect(refeito.find(e => e.type === 'done').puladas).toEqual([]);
  });

  test('após uma queda: carregar-projeto + nova execução gera só a aula que faltava', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponder(() => 'Texto da aula completo e fechado.');
    await sse(ag, '/api/conteudo');
    // simula a queda antes da aula 3: remove o arquivo e o estado dela
    fs.rmSync(path.join(SCR, 'aula03_conteudo.txt'), { force: true });
    const p = json('projeto.json');
    delete p.estadoAulas['03'];
    fs.writeFileSync(path.join(SCR, 'projeto.json'), JSON.stringify(p), 'utf-8');
    OpenAI.__reset();

    const novo = request.agent(app);
    await novo.post('/api/carregar-projeto').send({ pasta: PASTA });
    OpenAI.__setResponder(() => 'Texto novo da aula 3.');
    const eventos = await sse(novo, '/api/conteudo');

    expect(chatCalls()).toHaveLength(1);
    expect(prompt(chatCalls()[0])).toContain('Aula 3 de 3');
    expect(eventos.find(e => e.type === 'done').puladas).toEqual([1, 2]);
    expect(fs.readFileSync(path.join(SCR, 'aula03_conteudo.txt'), 'utf-8')).toContain('Texto novo da aula 3.');
  });

  test('aula cuja definição mudou (objetivos) deixa de valer e é refeita', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponder(() => 'Texto da aula completo e fechado.');
    await sse(ag, '/api/conteudo');
    OpenAI.__reset();
    OpenAI.__setResponder(() => 'Texto refeito.');
    // altera os objetivos da aula 2 diretamente no estado da sessão carregada
    const novo = request.agent(app);
    await novo.post('/api/carregar-projeto').send({ pasta: PASTA });
    const p = json('projeto.json');
    p.aulas[1].objetivos = 'OBJETIVOS NOVOS DA AULA 2';
    fs.writeFileSync(path.join(SCR, 'projeto.json'), JSON.stringify(p), 'utf-8');
    await novo.post('/api/carregar-projeto').send({ pasta: PASTA });

    const eventos = await sse(novo, '/api/conteudo');

    expect(chatCalls()).toHaveLength(1);
    expect(prompt(chatCalls()[0])).toContain('Aula 2 de 3');
    expect(eventos.find(e => e.type === 'done').puladas).toEqual([1, 3]);
  });

  test('aula incompleta não é pulada: é regenerada na próxima execução', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setFinishReasons(['length', 'length', 'length', 'stop', 'stop']);
    let n = 0;
    OpenAI.__setResponder(() => (++n <= 3 ? 'Texto cortado no meio de' : 'Texto completo e fechado.'));
    await sse(ag, '/api/conteudo'); // aula 1 incompleta (3 length); aulas 2 e 3 completas
    expect(json('projeto.json').estadoAulas['01'].estado).toBe('incompleta');
    OpenAI.__reset();
    OpenAI.__setResponder(() => 'Agora completa.');

    const eventos = await sse(ag, '/api/conteudo');

    expect(chatCalls()).toHaveLength(1);
    expect(eventos.find(e => e.type === 'done').puladas).toEqual([2, 3]);
    expect(json('projeto.json').estadoAulas['01'].estado).toBe('completa');
  });
});

describe('sem pausa fixa e com paralelismo opcional', () => {
  test('3 aulas seguidas não esperam mais 4 s entre si', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponder(() => 'Texto da aula.');
    const t0 = Date.now();
    await sse(ag, '/api/conteudo');
    expect(Date.now() - t0).toBeLessThan(3000); // com as 2 pausas de 4 s seriam > 8 s
    expect(fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf-8')).not.toMatch(/setTimeout\(r,\s*4000\)|PAUSA_ENTRE_AULAS_MS/);
  });

  test('padrão sequencial: a aula 2 só começa depois de a aula 1 estar gravada', async () => {
    const ag = await sessaoComPlano();
    const aula01Existia = [];
    OpenAI.__setResponder((params) => {
      aula01Existia.push(fs.existsSync(path.join(SCR, 'aula01_conteudo.txt')));
      return 'Texto da aula.';
    });
    await sse(ag, '/api/conteudo');
    expect(aula01Existia).toEqual([false, true, true]);
  });

  test('CONTEUDO_PARALELISMO=2: duas aulas simultâneas (limite 2 mesmo pedindo 5), sem tokens misturados, ordem preservada', async () => {
    process.env.CONTEUDO_PARALELISMO = '5';
    const ag = await sessaoComPlano();
    const aula01Existia = [];
    OpenAI.__setResponder((params) => {
      aula01Existia.push(fs.existsSync(path.join(SCR, 'aula01_conteudo.txt')));
      return `Texto da ${prompt(params).match(/Aula (\d) de 3/)[1]}ª aula.`;
    });

    const eventos = await sse(ag, '/api/conteudo');

    expect(aula01Existia.slice(0, 2)).toEqual([false, false]); // as duas primeiras chamadas começaram antes de qualquer aula gravar
    expect(eventos.some(e => e.type === 'progress' && /até 2 aulas em paralelo/.test(e.message))).toBe(true);
    expect(eventos.filter(e => e.type === 'token')).toEqual([]); // sem texto misturado no stream
    const done = eventos.find(e => e.type === 'done');
    const ordem = ['# Aula 1: Variáveis', '# Aula 2: Funções', '# Aula 3: Objetos'].map(t => done.fullText.indexOf(t));
    expect(ordem.every(n => n >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    for (const n of [1, 2, 3]) expect(fs.readFileSync(path.join(SCR, `aula0${n}_conteudo.txt`), 'utf-8')).toContain(`Texto da ${n}ª aula.`);
    expect(Object.keys(json('projeto.json').estadoAulas).sort()).toEqual(['01', '02', '03']);
  });

  test('valor inválido ou 0 em CONTEUDO_PARALELISMO mantém o modo sequencial', async () => {
    process.env.CONTEUDO_PARALELISMO = '0';
    const ag = await sessaoComPlano();
    OpenAI.__setResponder(() => 'Texto.');
    const eventos = await sse(ag, '/api/conteudo');
    expect(eventos.some(e => /em paralelo/.test(e.message || ''))).toBe(false);
    expect(eventos.some(e => e.type === 'token')).toBe(true);
  });
});

describe('429 nas rotas: espera visível e a etapa continua', () => {
  test('429 com retry-after-ms: avisa no progresso, espera e conclui sem erro (cliente OpenAI com maxRetries 0)', async () => {
    const ag = await sessao();
    OpenAI.__setErrors([new OpenAI.RateLimitError('limite', { 'retry-after-ms': '30' })]);
    OpenAI.__setResponse('plano de ensino gerado');

    const eventos = await sse(ag, '/api/plano-ensino');

    expect(eventos.find(e => e.type === 'error')).toBeUndefined();
    expect(eventos.find(e => e.type === 'done').fullText).toContain('plano de ensino gerado');
    expect(eventos.some(e => e.type === 'progress' && /Limite da API atingido — aguardando \d+s/.test(e.message))).toBe(true);
    expect(OpenAI.__getMock()).toHaveBeenCalledTimes(2); // a tentativa que levou 429 + a repetição bem-sucedida
    expect(fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf-8')).toMatch(/maxRetries: 0/);
  });

  test('429 persistente esgota as tentativas e a etapa termina com erro claro', async () => {
    process.env.RATE_LIMIT_MAX_RETENTATIVAS = '1';
    const ag = await sessao();
    OpenAI.__setErrors([new OpenAI.RateLimitError('limite 1'), new OpenAI.RateLimitError('limite 2'), new OpenAI.RateLimitError('limite 3')]);

    const eventos = await sse(ag, '/api/plano-ensino');

    const erro = eventos.find(e => e.type === 'error');
    expect(erro.message).toMatch(/limite 2/);
    expect(eventos.filter(e => e.type === 'progress' && /Limite da API atingido/.test(e.message))).toHaveLength(1);
  });

  test('erro 400 não é repetido', async () => {
    const ag = await sessao();
    OpenAI.__setErrors([new OpenAI.BadRequestError('inválido')]);
    const eventos = await sse(ag, '/api/plano-ensino');
    expect(eventos.find(e => e.type === 'error').message).toMatch(/inválido/);
    expect(eventos.some(e => /Limite da API/.test(e.message || ''))).toBe(false);
  });
});

describe('Gamma: geração pendente é retomada no mesmo id', () => {
  async function prepararSlides(ag) {
    OpenAI.__setResponder((params) => params.response_format ? JSON.stringify({ aulas: [AULAS[0]] }) : 'Texto da aula.');
    // 1 aula só: carga 1
    await ag.post('/api/config').send({ ...CONFIG, carga: '1' });
    await sse(ag, '/api/conteudo');
    OpenAI.__reset();
    await ag.post('/api/estilos-visuais/selecionar').send({ id: 'pixar', titulo: 'Pixar', housePrompt: 'Pixar style' });
    await ag.post('/api/slides/parametros').send({ index: 0, texto: '', quantidade: 3 });
  }

  function gammaFetch({ poll = 'pending', criacoes }) {
    return jest.fn(async (url, options = {}) => {
      const u = String(url);
      if (u.endsWith('/generations') && options.method === 'POST') {
        criacoes.push(u);
        return { ok: true, status: 200, json: async () => ({ generationId: 'gen-pendente-1' }) };
      }
      if (/\/generations\/[^/]+$/.test(u)) {
        criacoes.push(u);
        if (poll === 'pending') return { ok: true, status: 200, json: async () => ({ status: 'pending' }) };
        if (poll === 'failed') return { ok: true, status: 200, json: async () => ({ status: 'failed', error: { message: 'falhou' } }) };
        return { ok: true, status: 200, json: async () => ({ status: 'completed', exportUrl: 'https://export.test/x.pptx' }) };
      }
      return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('PPTX-BYTES') };
    });
  }

  test('o id é gravado ao criar; após um estouro de tempo, a nova execução NÃO cria outra geração e conclui', async () => {
    const ag = await sessao();
    await prepararSlides(ag);

    const chamadas1 = [];
    global.fetch = gammaFetch({ poll: 'pending', criacoes: chamadas1 });
    const ev1 = await sse(ag, '/api/slides/gerar?index=0');
    expect(ev1.find(e => e.type === 'error').message).toMatch(/Tempo limite/);
    expect(json('projeto.json').geracoesExternas.gamma['01'].id).toBe('gen-pendente-1'); // sobreviveu ao erro
    expect(chamadas1.filter(u => u.endsWith('/generations')).length).toBe(1);

    const chamadas2 = [];
    global.fetch = gammaFetch({ poll: 'completed', criacoes: chamadas2 });
    const ev2 = await sse(ag, '/api/slides/gerar?index=0');

    expect(ev2.find(e => e.type === 'error')).toBeUndefined();
    expect(ev2.find(e => e.type === 'done')).toBeDefined();
    expect(ev2.some(e => e.type === 'progress' && /Retomando a geração pendente/.test(e.message))).toBe(true);
    expect(chamadas2.filter(u => u.endsWith('/generations'))).toEqual([]); // nenhuma nova criação (sem gastar crédito)
    expect(chamadas2.some(u => u.endsWith('/generations/gen-pendente-1'))).toBe(true);
    expect(fs.readFileSync(path.join(PASTA, 'aula01_slides.pptx'), 'utf-8')).toBe('PPTX-BYTES');
    expect(json('projeto.json').geracoesExternas.gamma['01']).toBeUndefined(); // baixado: pendência limpa
  });

  test('retoma mesmo depois de reiniciar o servidor (carregar-projeto restaura o id pendente)', async () => {
    const ag = await sessao();
    await prepararSlides(ag);
    global.fetch = gammaFetch({ poll: 'pending', criacoes: [] });
    await sse(ag, '/api/slides/gerar?index=0');

    const novo = request.agent(app);
    await novo.post('/api/carregar-projeto').send({ pasta: PASTA });
    expect(json('projeto.json').geracoesExternas.gamma['01'].id).toBe('gen-pendente-1');
    await novo.post('/api/estilos-visuais/selecionar').send({ id: 'pixar', titulo: 'Pixar', housePrompt: 'Pixar style' });
    await novo.post('/api/slides/parametros').send({ index: 0, texto: '', quantidade: 3 });
    const chamadas = [];
    global.fetch = gammaFetch({ poll: 'completed', criacoes: chamadas });
    const ev = await sse(novo, '/api/slides/gerar?index=0');

    expect(ev.find(e => e.type === 'done')).toBeDefined();
    expect(chamadas.filter(u => u.endsWith('/generations'))).toEqual([]);
  });

  test('geração que falhou no Gamma limpa a pendência: a próxima execução cria uma nova', async () => {
    const ag = await sessao();
    await prepararSlides(ag);
    global.fetch = gammaFetch({ poll: 'failed', criacoes: [] });
    const ev1 = await sse(ag, '/api/slides/gerar?index=0');
    expect(ev1.find(e => e.type === 'error').message).toMatch(/falhou/);
    expect(json('projeto.json').geracoesExternas?.gamma?.['01']).toBeUndefined();

    const chamadas = [];
    global.fetch = gammaFetch({ poll: 'completed', criacoes: chamadas });
    await sse(ag, '/api/slides/gerar?index=0');
    expect(chamadas.filter(u => u.endsWith('/generations')).length).toBe(1); // criou outra
  });

  test('o mesmo mecanismo existe para o HeyGen (videoId gravado e retomado)', () => {
    const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf-8');
    expect(fonte).toMatch(/geracaoExternaPendente\(sess, 'heygen', numero\)/);
    expect(fonte).toMatch(/registrarGeracaoExterna\(sess, 'heygen', numero, videoId, \{/);
    expect(fonte).toMatch(/persistHeygenVideoStage\(sess, baseName, resultado\.video_url, numero\)/);
  });
});

describe('abort signal chega às chamadas que não o recebiam', () => {
  test('toda chamada ao LLM em rotas passa por signal (estático)', () => {
    const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf-8');
    const sem = [];
    const re = /chamarOpenAI\('(chat|responses)',/g;
    let m;
    while ((m = re.exec(fonte))) {
      let depth = 1; let j = re.lastIndex;
      while (depth && j < fonte.length) { const c = fonte[j++]; if (c === '(') depth++; else if (c === ')') depth--; }
      const corpo = fonte.slice(m.index, j);
      if (!corpo.includes('signal')) sem.push(fonte.slice(0, m.index).split('\n').length);
    }
    expect(sem).toEqual([]);
  });
});
