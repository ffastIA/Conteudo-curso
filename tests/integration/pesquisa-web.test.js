'use strict';

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');
const skills = require('../../skills');

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

const PESQUISA_TXT = path.join(VALID_CONFIG.pastaProjeto, 'scr', 'pesquisa.txt');
const PESQUISA_JSON = path.join(VALID_CONFIG.pastaProjeto, 'scr', 'pesquisa.json');

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
  fs.rmSync(PESQUISA_TXT, { force: true });
  fs.rmSync(PESQUISA_JSON, { force: true });
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

async function sessaoConfigurada() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(VALID_CONFIG);
  return ag;
}

describe('GET /api/search — pesquisa web em múltiplas consultas (Responses API)', () => {
  test('usa responses.create com web_search em 4 consultas (sem BNCC), nunca chat.completions + web_search_options', async () => {
    OpenAI.__setResponse('Relatório de pesquisa sobre Node.js');
    const ag = await sessaoConfigurada();

    const events = await pesquisar(ag);

    const chamadas = OpenAI.__getResponsesMock().mock.calls;
    expect(chamadas).toHaveLength(4);
    for (const [params] of chamadas) {
      expect(params.tools).toEqual([expect.objectContaining({ type: 'web_search' })]);
      expect(params.input).toEqual(expect.stringContaining('Curso de Pesquisa Web'));
      // o ano vem do relógio; o texto fixo "2024-2025" saiu do prompt
      expect(params.input).not.toContain('2024-2025');
      expect(params.input).toContain(String(new Date().getFullYear()));
      expect(params.instructions).toMatch(/fontes primárias/i);
      expect(params.max_output_tokens).toBeGreaterThan(2000);
    }
    expect(OpenAI.__getMock()).not.toHaveBeenCalledWith(
      expect.objectContaining({ web_search_options: expect.anything() }),
      expect.anything()
    );
    const progresso = events.filter(e => e.type === 'progress').map(e => e.message);
    expect(progresso.filter(m => /^Consulta \d\/4/.test(m))).toHaveLength(4);
    expect(events.map(e => e.type)).toContain('done');
  });

  test('emite um evento site por fonte única (deduplicada entre consultas) e devolve o relatório com fontes', async () => {
    OpenAI.__setResponse('Relatório de pesquisa sobre Node.js');
    const ag = await sessaoConfigurada();

    const events = await pesquisar(ag);

    const sites = events.filter(e => e.type === 'site');
    // parâmetros utm_* (ex.: ?utm_source=openai) são removidos das URLs
    expect(sites.map(s => s.url)).toEqual([
      'https://nodejs.org/docs',
      'https://developer.mozilla.org/js',
      'https://www.w3schools.com/nodejs'
    ]);
    const done = events.find(e => e.type === 'done');
    expect(done.status).toBe('web');
    expect(done.fullText).toContain('## Mercado e tendências');
    expect(done.fullText).toContain('## Fontes consultadas');
    expect(done.fullText).toContain('[f1] Node.js Docs — https://nodejs.org/docs');
  });

  test('grava scr/pesquisa.json com consultas, fontes (id/url/título/domínio/consulta) e achados', async () => {
    OpenAI.__setResponse('Texto da consulta');
    const ag = await sessaoConfigurada();

    await pesquisar(ag);

    const json = JSON.parse(fs.readFileSync(PESQUISA_JSON, 'utf-8'));
    expect(json.status).toBe('web');
    expect(json.fonte).toBe('ia');
    expect(json.modelo).toBe('gpt-4o');
    expect(new Date(json.geradoEm).getTime()).not.toBeNaN();
    expect(json.consultas.map(c => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(json.fontes[0]).toEqual({
      id: 'f1', url: 'https://nodejs.org/docs', titulo: 'Node.js Docs', dominio: 'nodejs.org', consultaId: 'c1'
    });
    expect(json.achados).toHaveLength(4);
    expect(json.achados[0]).toEqual({ tema: 'Mercado e tendências', resumo: 'Texto da consulta', fonteIds: ['f1', 'f2', 'f3'] });
    // persistência dupla preservada (.txt + .docx), com a lista de fontes e URLs
    expect(fs.existsSync(path.join(VALID_CONFIG.pastaProjeto, 'pesquisa.docx'))).toBe(true);
    expect(fs.readFileSync(PESQUISA_TXT, 'utf-8')).toContain('https://nodejs.org/docs');
  });

  test('com BNCC ativa planeja 5 consultas (inclui referências educacionais)', async () => {
    const ag = await sessaoConfigurada();
    await ag.post('/api/bncc/selecionar').send({ publico: 'adulto', nivel: 'competencias', itens: [{ codigo: '', descricao: 'Leitura' }] });

    await pesquisar(ag);

    expect(OpenAI.__getResponsesMock()).toHaveBeenCalledTimes(5);
    const json = JSON.parse(fs.readFileSync(PESQUISA_JSON, 'utf-8'));
    expect(json.consultas.map(c => c.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });

  test('uma consulta que falha não derruba a pesquisa quando as demais trazem fontes suficientes', async () => {
    const mock = OpenAI.__getResponsesMock();
    // c1: 1ª tentativa + 2 retentativas falham; c2..c4 usam o mock padrão
    mock.mockRejectedValueOnce(new Error('falha de rede'));
    mock.mockRejectedValueOnce(new Error('falha de rede'));
    mock.mockRejectedValueOnce(new Error('falha de rede'));
    const ag = await sessaoConfigurada();

    const events = await pesquisar(ag);

    expect(events.map(e => e.type)).toContain('done');
    const json = JSON.parse(fs.readFileSync(PESQUISA_JSON, 'utf-8'));
    expect(json.achados.map(a => a.tema)).not.toContain('Mercado e tendências');
    expect(json.achados).toHaveLength(3);
    expect(mock).toHaveBeenCalledTimes(6); // c1 ×3 + c2, c3, c4
  });

  test('erro 400 (parâmetro/modelo de busca rejeitado) vira configuração inválida: mensagem clara, sem retentativa e sem fallback', async () => {
    OpenAI.__setError(new OpenAI.BadRequestError('Web search options not supported with this model.'));
    const ag = await sessaoConfigurada();

    const events = await pesquisar(ag);

    const erro = events.find(e => e.type === 'error');
    expect(erro.message).toMatch(/Configuração de pesquisa inválida/);
    expect(erro.message).toMatch(/OPENAI_RESEARCH_MODEL/);
    expect(erro.status).toBe('falhou');
    expect(OpenAI.__getResponsesMock()).toHaveBeenCalledTimes(1); // sem retentativa nem demais consultas
    expect(OpenAI.__getMock()).not.toHaveBeenCalled(); // fallback gpt-4o-mini não acionado
    expect(fs.existsSync(PESQUISA_TXT)).toBe(false);
  });

  test('sem nenhuma citação: emite error (status falhou, semPesquisaDisponivel) e NÃO grava pesquisa.txt', async () => {
    OpenAI.__setResponse('Texto de memória do modelo, sem fontes');
    OpenAI.__setCitations([]);
    const ag = await sessaoConfigurada();

    const events = await pesquisar(ag);

    const erro = events.find(e => e.type === 'error');
    expect(erro).toBeDefined();
    expect(erro.semPesquisaDisponivel).toBe(true);
    expect(erro.status).toBe('falhou');
    expect(erro.message).toMatch(/nenhuma fonte/i);
    expect(events.map(e => e.type)).not.toContain('done');
    expect(fs.existsSync(PESQUISA_TXT)).toBe(false);
    expect(fs.existsSync(PESQUISA_JSON)).toBe(false);
    expect(OpenAI.__getMock()).not.toHaveBeenCalled(); // sem fallback automático
  });

  test('fontes insuficientes (2 fontes) é tratado como falha e nada é gravado', async () => {
    OpenAI.__setCitations([
      { url: 'https://nodejs.org/docs', title: 'Node.js Docs' },
      { url: 'https://developer.mozilla.org/js', title: 'MDN' }
    ]);
    const ag = await sessaoConfigurada();

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
    const ag = await sessaoConfigurada();

    const events = await pesquisar(ag);

    expect(events.find(e => e.type === 'error')).toBeDefined();
    expect(fs.existsSync(PESQUISA_TXT)).toBe(false);
  });

  test('semBusca=1: usa o modelo sem busca, grava com selo, fonte modelo_sem_busca e pesquisa.json sem_web', async () => {
    OpenAI.__setResponse('Texto gerado do conhecimento do modelo');
    const ag = await sessaoConfigurada();

    const events = await pesquisar(ag, '?semBusca=1');

    expect(OpenAI.__getResponsesMock()).not.toHaveBeenCalled();
    expect(OpenAI.__getMock()).toHaveBeenCalledTimes(1);
    expect(events.map(e => e.type)).not.toContain('site');
    const done = events.find(e => e.type === 'done');
    expect(done.status).toBe('sem_web');
    expect(done.fullText).toMatch(/^> ⚠️ SEM PESQUISA WEB/);
    expect(done.fullText).toContain('Texto gerado do conhecimento do modelo');
    expect(fs.readFileSync(PESQUISA_TXT, 'utf-8')).toMatch(/^> ⚠️ SEM PESQUISA WEB/);
    const projeto = JSON.parse(fs.readFileSync(path.join(VALID_CONFIG.pastaProjeto, 'scr', 'projeto.json'), 'utf-8'));
    expect(projeto.stages.pesquisa.fonte).toBe('modelo_sem_busca');
    const json = JSON.parse(fs.readFileSync(PESQUISA_JSON, 'utf-8'));
    expect(json).toMatchObject({ status: 'sem_web', fonte: 'modelo_sem_busca', consultas: [], fontes: [], achados: [] });
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

describe('planejarConsultasPesquisa e validarModeloPesquisa', () => {
  test('4 consultas sem BNCC e 5 com BNCC, ids sequenciais, sem "2024-2025"', () => {
    const base = { nome: 'Node.js', nivel: 'basico', publico: 'adultos', topicos: 'Express' };
    const sem = skills.planejarConsultasPesquisa({ ...base, bnccAtivo: false, ano: 2031 });
    const com = skills.planejarConsultasPesquisa({ ...base, bnccAtivo: true, ano: 2031 });
    expect(sem.map(c => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(com.map(c => c.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(JSON.stringify(com)).toContain('2031');
    expect(JSON.stringify(com)).not.toContain('2024-2025');
    expect(sem[0].foco).toContain('Express');
  });

  test('modelo vem de OPENAI_RESEARCH_MODEL com padrão gpt-4o', () => {
    const original = process.env.OPENAI_RESEARCH_MODEL;
    try {
      delete process.env.OPENAI_RESEARCH_MODEL;
      expect(skills.modeloPesquisa()).toBe('gpt-4o');
      process.env.OPENAI_RESEARCH_MODEL = 'gpt-4.1';
      expect(skills.modeloPesquisa()).toBe('gpt-4.1');
    } finally {
      if (original === undefined) delete process.env.OPENAI_RESEARCH_MODEL; else process.env.OPENAI_RESEARCH_MODEL = original;
    }
  });

  test('validarModeloPesquisa avisa para modelo descontinuado ou desconhecido e aceita gpt-4o', () => {
    expect(app.validarModeloPesquisa('gpt-4o')).toBeNull();
    expect(app.validarModeloPesquisa('gpt-4.1')).toBeNull();
    expect(app.validarModeloPesquisa('gpt-4o-search-preview')).toMatch(/descontinuado/);
    expect(app.validarModeloPesquisa('llama-3')).toMatch(/pode não suportar/);
  });
});

describe('pesquisa.json em carregar-projeto e importar/confirmar', () => {
  async function pesquisarESalvar() {
    OpenAI.__setResponse('Texto da consulta');
    const ag = await sessaoConfigurada();
    await pesquisar(ag);
    return ag;
  }

  test('carregar-projeto recarrega o pesquisa.json estruturado', async () => {
    await pesquisarESalvar();
    const res = await request.agent(app).post('/api/carregar-projeto').send({ pasta: VALID_CONFIG.pastaProjeto });
    expect(res.status).toBe(200);
    expect(res.body.pesquisaMeta.status).toBe('web');
    expect(res.body.pesquisaMeta.fontes).toHaveLength(3);
  });

  test('projeto antigo sem pesquisa.json é lido como legado e continua carregando', async () => {
    await pesquisarESalvar();
    fs.rmSync(PESQUISA_JSON, { force: true });
    const res = await request.agent(app).post('/api/carregar-projeto').send({ pasta: VALID_CONFIG.pastaProjeto });
    expect(res.status).toBe(200);
    expect(res.body.pesquisaMeta).toMatchObject({ status: 'legado', fonte: 'legado' });
    expect(res.body.etapasCarregadas).toContain('pesquisa');
  });

  test('pesquisa reimportada (editada) vira fonte "usuario" mantendo as fontes originais', async () => {
    const ag = await pesquisarESalvar();
    const res = await ag.post('/api/importar/confirmar').send({ stage: 'pesquisa', texto: 'Pesquisa revisada pelo usuário' });
    expect(res.status).toBe(200);
    const json = JSON.parse(fs.readFileSync(PESQUISA_JSON, 'utf-8'));
    expect(json.fonte).toBe('usuario');
    expect(json.status).toBe('web');
    expect(json.fontes).toHaveLength(3);
    expect(json.achados).toHaveLength(4);
    expect(fs.readFileSync(PESQUISA_TXT, 'utf-8')).toBe('Pesquisa revisada pelo usuário');
  });
});
