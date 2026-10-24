'use strict';

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const PASTA = path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-secoes');
const SCR = path.join(PASTA, 'scr');
const CONFIG = {
  nome: 'Curso de Seções',
  publico: 'Desenvolvedores júnior',
  carga: '1', // 1h / 60 min = 1 aula
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender JavaScript',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: PASTA
};

// Meta da aula: 60 min × 30 palavras (intermediário) = 1800; com 2 seções
// planejadas + síntese as metas são [720, 720, 360] e o mínimo é 80% delas.
const palavras = (n, p = 'conteudo') => Array.from({ length: n }, () => p).join(' ');
const ROTEIRO = JSON.stringify({ secoes: [
  { titulo: 'Variáveis em JavaScript', objetivo: 'Declarar variáveis', tipo: 'teorica' },
  { titulo: 'Funções em JavaScript', objetivo: 'Criar funções', tipo: 'pratica' }
] });
const sec = (titulo, n = 800) => `## ${titulo}\n\n${palavras(n)} fim.`;
const SEC1 = sec('Variáveis em JavaScript');
const SEC2 = sec('Funções em JavaScript');
const SEC3 = sec('Síntese', 400);

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.CONTEUDO_MODO = 'secoes';
});

afterAll(() => {
  process.env.CONTEUDO_MODO = 'unico';
  jest.restoreAllMocks();
});

beforeEach(() => {
  OpenAI.__reset();
  fs.rmSync(PASTA, { recursive: true, force: true });
  delete process.env.OPENAI_CONTENT_MODEL;
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

// Cria sessão, config e o plano de aula (1 aula) — o /api/conteudo parte daí.
async function sessaoComPlano() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(CONFIG);
  OpenAI.__setResponses([
    JSON.stringify({ aulas: [{ titulo: 'Fundamentos de JavaScript', modulo: 'Módulo 1', objetivos: 'Declarar variáveis; Criar funções' }] }),
    'Plano detalhado gerado a partir do JSON.'
  ]);
  await sse(ag, '/api/plano-aula');
  OpenAI.__reset();
  return ag;
}

const txtAula = () => path.join(SCR, 'aula01_conteudo.txt');
const partialAula = () => path.join(SCR, 'aula01_conteudo.partial.txt');
const projeto = () => JSON.parse(fs.readFileSync(path.join(SCR, 'projeto.json'), 'utf-8'));
const chamadas = () => OpenAI.__getMock().mock.calls.map(([params]) => params);

describe('geração por seções (duas passadas)', () => {
  test('roteiro em JSON + uma chamada por seção, com teto por seção, resumo das anteriores e síntese ao final', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponses([ROTEIRO, SEC1, SEC2, SEC3]);

    const eventos = await sse(ag, '/api/conteudo');

    const done = eventos.find(e => e.type === 'done');
    expect(done.incompletas).toEqual([]);
    expect(done.estadoAulas['01'].estado).toBe('completa');

    const c = chamadas();
    expect(c).toHaveLength(4); // roteiro + 3 seções (2 planejadas + síntese)
    expect(c[0].response_format).toEqual({ type: 'json_object' });
    expect(c[0].stream).toBeUndefined();
    for (const secao of c.slice(1)) {
      expect(secao.stream).toBe(true);
      expect(secao.max_tokens).toBe(4000); // teto por seção, não por aula
    }
    // a 3ª chamada (2ª seção) recebe o resumo da 1ª seção; a última é a síntese
    expect(c[2].messages[1].content).toContain('Resumo das seções já escritas');
    expect(c[2].messages[1].content).toContain('Variáveis em JavaScript');
    expect(c[3].messages[1].content).toContain('SEÇÃO A REDIGIR AGORA: "Síntese"');
    // as seções saem na ordem planejada, com a síntese por último
    const texto = fs.readFileSync(txtAula(), 'utf-8');
    const ordem = ['## Variáveis em JavaScript', '## Funções em JavaScript', '## Síntese'].map(t => texto.indexOf(t));
    expect(ordem.every(n => n >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(fs.existsSync(path.join(PASTA, 'aula01_conteudo.docx'))).toBe(true);
    expect(fs.existsSync(partialAula())).toBe(false);
  });

  test('registra estado, palavras e finish_reason em projeto.json e geracao_log.json', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponses([ROTEIRO, SEC1, SEC2, SEC3]);
    await sse(ag, '/api/conteudo');

    const estado = projeto().estadoAulas['01'];
    expect(estado).toMatchObject({ estado: 'completa', modo: 'secoes', finishReason: 'stop', continuacoes: 0 });
    expect(estado.palavras).toBeGreaterThan(2000);
    expect(estado.secoes.map(s => s.titulo)).toEqual(['Variáveis em JavaScript', 'Funções em JavaScript', 'Síntese']);

    const log = JSON.parse(fs.readFileSync(path.join(SCR, 'geracao_log.json'), 'utf-8'));
    const linhaAula = log.find(l => l.tipo === 'aula' && l.aula === 1);
    expect(linhaAula).toMatchObject({ estado: 'completa', finishReason: 'stop', modo: 'secoes' });
    expect(linhaAula.palavras).toBeGreaterThan(2000);
    expect(linhaAula.completionTokens).toBeGreaterThan(0);
  });

  test('roteiro inválido nas 2 tentativas cai para a passada única, com aviso', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponses(['isto não é JSON', 'nem isto', 'Conteúdo único e completo da aula.']);

    const eventos = await sse(ag, '/api/conteudo');

    expect(chamadas()).toHaveLength(3); // 2 tentativas de roteiro + passada única
    expect(eventos.some(e => e.type === 'warning' && /roteiro das seções veio inválido/.test(e.text))).toBe(true);
    expect(eventos.find(e => e.type === 'done').estadoAulas['01'].estado).toBe('completa');
    expect(fs.readFileSync(txtAula(), 'utf-8')).toContain('Conteúdo único e completo da aula.');
    expect(projeto().estadoAulas['01'].modo).toBe('unico');
  });

  test('OPENAI_CONTENT_MODEL define o modelo do roteiro e das seções', async () => {
    process.env.OPENAI_CONTENT_MODEL = 'modelo-de-conteudo-x';
    const ag = await sessaoComPlano();
    OpenAI.__setResponses([ROTEIRO, SEC1, SEC2, SEC3]);
    await sse(ag, '/api/conteudo');
    expect(chamadas().map(c => c.model)).toEqual(Array(4).fill('modelo-de-conteudo-x'));
  });
});

describe('truncamento: continuação automática e aula incompleta', () => {
  test('seção cortada (length) dispara continuação e a aula fecha completa', async () => {
    const ag = await sessaoComPlano();
    // roteiro stop | seção 1 length → continuação stop | seção 2 stop | síntese stop
    OpenAI.__setFinishReasons(['stop', 'length', 'stop', 'stop', 'stop']);
    OpenAI.__setResponses([ROTEIRO, sec('Variáveis em JavaScript', 500), ` ${palavras(300)} continuação final.`, SEC2, SEC3]);

    const eventos = await sse(ag, '/api/conteudo');

    const c = chamadas();
    expect(c).toHaveLength(5);
    const cont = c[2].messages;
    expect(cont[2].role).toBe('assistant');
    expect(cont[3].content).toMatch(/CORTADA/);
    expect(eventos.some(e => e.type === 'progress' && /solicitando continuação \(1\/2\)/.test(e.message))).toBe(true);
    const done = eventos.find(e => e.type === 'done');
    expect(done.estadoAulas['01'].estado).toBe('completa');
    expect(fs.readFileSync(txtAula(), 'utf-8')).toContain('continuação final.');
    expect(projeto().estadoAulas['01'].continuacoes).toBe(1);
  });

  test('ainda cortada após 2 continuações: vai para .partial.txt, não para o .txt oficial, e marca incompleta', async () => {
    const ag = await sessaoComPlano();
    // seção 2: length + 2 continuações com length → esgota; síntese stop
    OpenAI.__setFinishReasons(['stop', 'stop', 'length', 'length', 'length', 'stop']);
    OpenAI.__setResponses([ROTEIRO, SEC1, sec('Funções em JavaScript', 300), ` ${palavras(50)}`, ` ${palavras(50)}`, SEC3]);

    const eventos = await sse(ag, '/api/conteudo');

    expect(chamadas()).toHaveLength(6);
    const done = eventos.find(e => e.type === 'done');
    expect(done.incompletas).toEqual([1]);
    expect(done.estadoAulas['01'].estado).toBe('incompleta');
    expect(eventos.some(e => e.type === 'warning' && /INCOMPLETA/.test(e.text))).toBe(true);
    expect(fs.existsSync(txtAula())).toBe(false);
    expect(fs.existsSync(path.join(PASTA, 'aula01_conteudo.docx'))).toBe(false);
    expect(fs.readFileSync(partialAula(), 'utf-8')).toContain('## Funções em JavaScript');
    const estado = projeto().estadoAulas['01'];
    expect(estado.estado).toBe('incompleta');
    expect(estado.finishReason).toBe('length');
    expect(estado.motivos.join(' ')).toMatch(/cortada/);
  });

  test('aula incompleta bloqueia as etapas dependentes até ser regenerada', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setFinishReasons(['stop', 'stop', 'length', 'length', 'length', 'stop']);
    OpenAI.__setResponses([ROTEIRO, SEC1, SEC2, ' a', ' b', SEC3]);
    await sse(ag, '/api/conteudo');
    OpenAI.__reset();

    for (const rota of ['/api/qualidade', '/api/ppc', '/api/revisao-qualidade', '/api/aplicar-melhorias/confirmar']) {
      const erro = (await sse(ag, rota)).find(e => e.type === 'error');
      expect(erro.message).toMatch(/Conteúdo incompleto.*aula\(s\) 01/);
    }
    expect((await ag.post('/api/aplicar-melhorias')).status).toBe(409);
    expect(OpenAI.__getMock()).not.toHaveBeenCalled();

    // regenerar só a aula 1 (?aulas=1) com sucesso libera o fluxo
    OpenAI.__setResponses([ROTEIRO, SEC1, SEC2, SEC3]);
    const eventos = await sse(ag, '/api/conteudo?aulas=1');
    expect(eventos.find(e => e.type === 'done').incompletas).toEqual([]);
    expect(fs.existsSync(partialAula())).toBe(false);
    expect(fs.existsSync(txtAula())).toBe(true);
    OpenAI.__reset();
    const depois = await sse(ag, '/api/qualidade');
    expect(depois.find(e => e.type === 'error')?.message || '').not.toMatch(/Conteúdo incompleto/);
  });

  test('o .txt oficial anterior é preservado quando uma regeneração termina incompleta', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponses([ROTEIRO, SEC1, SEC2, SEC3]);
    await sse(ag, '/api/conteudo');
    const oficial = fs.readFileSync(txtAula(), 'utf-8');

    OpenAI.__reset();
    OpenAI.__setFinishReasons(['stop', 'stop', 'length', 'length', 'length', 'stop']);
    OpenAI.__setResponses([ROTEIRO, SEC1, 'parcial', ' a', ' b', SEC3]);
    await sse(ag, '/api/conteudo?aulas=1');

    expect(fs.readFileSync(txtAula(), 'utf-8')).toBe(oficial);
    expect(fs.existsSync(partialAula())).toBe(true);
    expect(projeto().estadoAulas['01'].estado).toBe('incompleta');
  });

  test('seção ausente (resposta vazia) torna a aula incompleta', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponses([ROTEIRO, SEC1, '', SEC3]);
    const done = (await sse(ag, '/api/conteudo')).find(e => e.type === 'done');
    expect(done.estadoAulas['01'].estado).toBe('incompleta');
    expect(projeto().estadoAulas['01'].motivos.join(' ')).toMatch(/ausentes: Funções em JavaScript/);
  });

  test('modo legado (passada única) também continua em length e bloqueia quando esgota', async () => {
    process.env.CONTEUDO_MODO = 'unico';
    try {
      const ag = await sessaoComPlano();
      OpenAI.__setFinishReasons(['length', 'length', 'length']);
      OpenAI.__setResponses(['Início do texto cortado', ' continua', ' ainda cortado']);
      const done = (await sse(ag, '/api/conteudo')).find(e => e.type === 'done');
      expect(chamadas()).toHaveLength(3); // 1 + 2 continuações
      expect(done.incompletas).toEqual([1]);
      expect(fs.existsSync(txtAula())).toBe(false);
      expect(fs.readFileSync(partialAula(), 'utf-8').replace(/\s+/g, ' ').trim()).toBe('Início do texto cortado continua ainda cortado');
    } finally {
      process.env.CONTEUDO_MODO = 'secoes';
    }
  });
});

describe('seções curtas: passada de expansão', () => {
  test('seção abaixo de 80% da meta é refeita; a aula fecha completa', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponses([ROTEIRO, sec('Variáveis em JavaScript', 40), SEC2, SEC3, sec('Variáveis em JavaScript', 800)]);

    const eventos = await sse(ag, '/api/conteudo');

    const c = chamadas();
    expect(c).toHaveLength(5);
    expect(c[4].stream).toBeUndefined(); // expansão não passa pelo stream da UI
    expect(c[4].messages[1].content).toContain('ficou curta');
    expect(eventos.some(e => e.type === 'progress' && /expandindo a seção curta "Variáveis em JavaScript"/.test(e.message))).toBe(true);
    expect(eventos.find(e => e.type === 'done').estadoAulas['01'].estado).toBe('completa');
    expect(fs.readFileSync(txtAula(), 'utf-8').split(/\s+/).length).toBeGreaterThan(2000);
  });

  test('expansão que não resolve mantém a aula como "curta": gravada como oficial, com aviso', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponses([ROTEIRO, sec('Variáveis em JavaScript', 40), SEC2, SEC3, sec('Variáveis em JavaScript', 60)]);

    const eventos = await sse(ag, '/api/conteudo');

    const done = eventos.find(e => e.type === 'done');
    expect(done.estadoAulas['01'].estado).toBe('curta');
    expect(done.incompletas).toEqual([]); // curta não bloqueia
    expect(fs.existsSync(txtAula())).toBe(true);
    expect(eventos.some(e => e.type === 'warning' && /ficou curta/.test(e.text))).toBe(true);
  });

  test('expansão cortada por limite de tokens é descartada (mantém o texto original)', async () => {
    const ag = await sessaoComPlano();
    // finish: roteiro, s1, s2, s3 stop; expansão (non-stream) length
    OpenAI.__setFinishReasons(['stop', 'stop', 'stop', 'stop', 'length']);
    OpenAI.__setResponses([ROTEIRO, sec('Variáveis em JavaScript', 40), SEC2, SEC3, `${sec('Variáveis em JavaScript', 900)} cortad`]);
    await sse(ag, '/api/conteudo');
    expect(fs.readFileSync(txtAula(), 'utf-8')).not.toContain('cortad');
    expect(projeto().estadoAulas['01'].estado).toBe('curta');
  });
});

describe('extractLessonBlock sem truncamento, por número do cabeçalho', () => {
  async function comPlano(textoPlano) {
    const ag = await sessaoComPlano();
    const r = await ag.post('/api/importar/confirmar').send({ stage: 'plano_de_aula', texto: textoPlano });
    expect(r.status).toBe(200);
    return ag;
  }

  test('plano sem cabeçalhos "# Aula N:" falha com mensagem clara (não usa o início do texto)', async () => {
    process.env.CONTEUDO_MODO = 'unico';
    try {
      const ag = await comPlano('Plano corrido sem nenhum cabeçalho de aula.');
      OpenAI.__setResponse('não deveria ser chamado');
      const eventos = await sse(ag, '/api/conteudo');
      const erro = eventos.find(e => e.type === 'error');
      expect(erro.message).toMatch(/cabeçalhos "# Aula N:"/);
      expect(erro.message).toMatch(/Aula 1/);
      expect(OpenAI.__getMock()).not.toHaveBeenCalled();
    } finally {
      process.env.CONTEUDO_MODO = 'secoes';
    }
  });

  test('o trecho é localizado pelo número do cabeçalho, não pela posição', async () => {
    process.env.CONTEUDO_MODO = 'unico';
    try {
      const ag = await comPlano('# Aula 2: Segunda\n\nTrecho da aula dois.\n\n# Aula 1: Primeira\n\nTrecho da aula UM correto.\n');
      OpenAI.__setResponse('Conteúdo gerado.');
      await sse(ag, '/api/conteudo');
      const prompt = chamadas()[0].messages[1].content;
      expect(prompt).toContain('Trecho da aula UM correto.');
      expect(prompt).not.toContain('Trecho da aula dois.');
    } finally {
      process.env.CONTEUDO_MODO = 'secoes';
    }
  });
});

describe('estado das aulas ao carregar o projeto', () => {
  test('carregar-projeto devolve estadoAulas e mantém o bloqueio de aulas incompletas', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setFinishReasons(['stop', 'stop', 'length', 'length', 'length', 'stop']);
    OpenAI.__setResponses([ROTEIRO, SEC1, SEC2, ' a', ' b', SEC3]);
    await sse(ag, '/api/conteudo');
    OpenAI.__reset();

    const novo = request.agent(app);
    const res = await novo.post('/api/carregar-projeto').send({ pasta: PASTA });
    expect(res.status).toBe(200);
    expect(res.body.estadoAulas['01'].estado).toBe('incompleta');
    const erro = (await sse(novo, '/api/qualidade')).find(e => e.type === 'error');
    expect(erro.message).toMatch(/Conteúdo incompleto/);
  });

  test('projeto antigo sem estadoAulas é tratado como completo (nada bloqueado)', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponses([ROTEIRO, SEC1, SEC2, SEC3]);
    await sse(ag, '/api/conteudo');
    const p = projeto();
    delete p.estadoAulas;
    fs.writeFileSync(path.join(SCR, 'projeto.json'), JSON.stringify(p), 'utf-8');

    const novo = request.agent(app);
    await novo.post('/api/carregar-projeto').send({ pasta: PASTA });
    OpenAI.__reset();
    const depois = await sse(novo, '/api/qualidade');
    expect(depois.find(e => e.type === 'error')?.message || '').not.toMatch(/Conteúdo incompleto/);
  });
});
