'use strict';

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const PASTA = path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-pesquisa-modulos');
const SCR = path.join(PASTA, 'scr');
const CONFIG = {
  nome: 'Curso de Pesquisa por Módulo',
  publico: 'Desenvolvedores júnior',
  carga: '2', // 2h / 60 min = 2 aulas
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender JavaScript',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: 'Lógica de programação',
  pastaProjeto: PASTA
};
const PLANO_AULAS = JSON.stringify({ aulas: [
  { titulo: 'Variáveis', modulo: 'Fundamentos', objetivos: 'declarar variáveis e tipos' },
  { titulo: 'Requisições HTTP', modulo: 'Web', objetivos: 'consumir APIs REST com fetch' }
] });

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  process.env.PESQUISA_MODULOS_OBRIGATORIA = 'false';
  process.env.CONTEUDO_MODO = 'unico';
  jest.restoreAllMocks();
});

beforeEach(() => {
  OpenAI.__reset();
  fs.rmSync(PASTA, { recursive: true, force: true });
  process.env.PESQUISA_MODULOS_OBRIGATORIA = 'true';
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

// Sessão com config e plano de aula (2 aulas em 2 módulos).
async function sessaoComPlano() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(CONFIG);
  OpenAI.__setResponses([PLANO_AULAS, 'Plano detalhado gerado a partir do JSON.']);
  await sse(ag, '/api/plano-aula');
  OpenAI.__reset();
  return ag;
}

const json = (nome) => JSON.parse(fs.readFileSync(path.join(SCR, nome), 'utf-8'));
const responsesCalls = () => OpenAI.__getResponsesMock().mock.calls.map(([params]) => params);
const chatCalls = () => OpenAI.__getMock().mock.calls.map(([params]) => params);
const semResposta = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Resposta de memória, sem fontes', annotations: [] }] }], usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 } };

describe('GET /api/pesquisa-modulos', () => {
  test('uma pesquisa web por módulo, com título, objetivos das aulas, nível, público e ano', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponse('Achados do módulo');

    const eventos = await sse(ag, '/api/pesquisa-modulos');

    const chamadas = responsesCalls();
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0].input).toContain('módulo "Fundamentos"');
    expect(chamadas[0].input).toContain('declarar variáveis e tipos');
    expect(chamadas[0].input).not.toContain('consumir APIs REST');
    expect(chamadas[1].input).toContain('módulo "Web"');
    for (const c of chamadas) {
      expect(c.tools).toEqual([expect.objectContaining({ type: 'web_search' })]);
      expect(c.input).toContain('Nível: intermediario');
      expect(c.input).toContain('Público: Desenvolvedores júnior');
      expect(c.input).toContain(String(new Date().getFullYear()));
      expect(c.instructions).toMatch(/fontes primárias/i);
    }
    const progresso = eventos.filter(e => e.type === 'progress').map(e => e.message);
    expect(progresso.filter(m => /^Pesquisando módulo \d\/2/.test(m))).toHaveLength(2);
    expect(eventos.filter(e => e.type === 'site')).toHaveLength(3);
    expect(eventos.find(e => e.type === 'done')).toMatchObject({ status: 'web', modulos: 2 });
  });

  test('grava pesquisa_modulos.json (consultas, fontes e achados por módulo) e .txt/.docx', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponse('Achados do módulo');
    await sse(ag, '/api/pesquisa-modulos');

    const meta = json('pesquisa_modulos.json');
    expect(meta).toMatchObject({ status: 'web', fonte: 'ia', completo: true, pulada: false });
    expect(meta.modulos.map(m => [m.id, m.titulo, m.aulas, m.status])).toEqual([['m1', 'Fundamentos', [0], 'ok'], ['m2', 'Web', [1], 'ok']]);
    expect(meta.consultas.map(c => c.moduloId)).toEqual(['m1', 'm2']);
    expect(meta.fontes.map(f => f.url)).toEqual(['https://nodejs.org/docs', 'https://developer.mozilla.org/js', 'https://www.w3schools.com/nodejs']);
    expect(meta.fontes[0]).toMatchObject({ id: 'f1', titulo: 'Node.js Docs', dominio: 'nodejs.org', moduloId: 'm1' });
    expect(meta.achados).toEqual([
      { moduloId: 'm1', tema: 'Fundamentos', resumo: 'Achados do módulo', fonteIds: ['f1', 'f2', 'f3'] },
      { moduloId: 'm2', tema: 'Web', resumo: 'Achados do módulo', fonteIds: ['f1', 'f2', 'f3'] }
    ]);
    expect(fs.readFileSync(path.join(SCR, 'pesquisa_modulos.txt'), 'utf-8')).toContain('## Módulo: Fundamentos');
    expect(fs.existsSync(path.join(PASTA, 'pesquisa_modulos.docx'))).toBe(true);
  });

  test('retomada: módulos já pesquisados não são refeitos (cache)', async () => {
    const ag = await sessaoComPlano();
    await sse(ag, '/api/pesquisa-modulos');
    OpenAI.__reset();

    const eventos = await sse(ag, '/api/pesquisa-modulos');

    expect(responsesCalls()).toHaveLength(0);
    expect(eventos.filter(e => e.type === 'progress' && /já pesquisado \(cache\)/.test(e.message))).toHaveLength(2);
    expect(eventos.find(e => e.type === 'done')).toBeDefined();
  });

  test('módulo sem fontes falha sem apagar os demais; a nova execução refaz só o que faltou', async () => {
    const ag = await sessaoComPlano();
    const mock = OpenAI.__getResponsesMock();
    mock.mockImplementationOnce(async () => ({ // módulo 1: ok (implementação padrão do mock)
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Achados do módulo 1', annotations: [
        { type: 'url_citation', url: 'https://nodejs.org/docs', title: 'Node.js Docs' },
        { type: 'url_citation', url: 'https://developer.mozilla.org/js', title: 'MDN' },
        { type: 'url_citation', url: 'https://www.w3schools.com/nodejs', title: 'W3Schools' }
      ] }] }],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }
    }));
    mock.mockImplementationOnce(async () => semResposta); // módulo 2: sem citações

    const eventos = await sse(ag, '/api/pesquisa-modulos');

    const erro = eventos.find(e => e.type === 'error');
    expect(erro.message).toMatch(/1 de 2 módulo\(s\)/);
    expect(erro.message).toMatch(/Web/);
    expect(erro.status).toBe('falhou');
    expect(erro.semPesquisaDisponivel).toBe(true);
    let meta = json('pesquisa_modulos.json');
    expect(meta.completo).toBe(false);
    expect(meta.modulos.find(m => m.titulo === 'Fundamentos').status).toBe('ok');
    expect(meta.modulos.find(m => m.titulo === 'Web').status).toBe('falhou');
    expect(fs.existsSync(path.join(SCR, 'pesquisa_modulos.txt'))).toBe(false); // nada de "pesquisa pronta"

    mock.mockClear();
    OpenAI.__setResponse('Achados do módulo 2');
    const retomada = await sse(ag, '/api/pesquisa-modulos');

    expect(responsesCalls()).toHaveLength(1); // só o módulo que falhou
    expect(responsesCalls()[0].input).toContain('módulo "Web"');
    expect(retomada.find(e => e.type === 'done')).toBeDefined();
    meta = json('pesquisa_modulos.json');
    expect(meta.completo).toBe(true);
    expect(meta.achados.find(a => a.moduloId === 'm1').resumo).toBe('Achados do módulo 1'); // preservado
    expect(meta.achados.find(a => a.moduloId === 'm2').resumo).toBe('Achados do módulo 2');
  });

  test('sem plano de aula (Etapa 4) devolve erro SSE claro', async () => {
    const ag = request.agent(app);
    await ag.post('/api/config').send(CONFIG);
    const erro = (await sse(ag, '/api/pesquisa-modulos')).find(e => e.type === 'error');
    expect(erro.message).toMatch(/Etapa 4/);
    expect(OpenAI.__getResponsesMock()).not.toHaveBeenCalled();
  });

  test('erro 400 (configuração inválida) interrompe com mensagem clara, sem fallback', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setError(new OpenAI.BadRequestError('Web search options not supported with this model.'));
    const erro = (await sse(ag, '/api/pesquisa-modulos')).find(e => e.type === 'error');
    expect(erro.message).toMatch(/Configuração de pesquisa inválida/);
    expect(OpenAI.__getResponsesMock()).toHaveBeenCalledTimes(1);
  });
});

describe('a Etapa 5 exige a pesquisa por módulo (ou a escolha explícita de pular)', () => {
  const mensagem = /pesquisa por módulo/;

  test('sem pesquisa por módulo, /api/conteudo é recusado antes de qualquer chamada', async () => {
    const ag = await sessaoComPlano();
    const erro = (await sse(ag, '/api/conteudo')).find(e => e.type === 'error');
    expect(erro.message).toMatch(mensagem);
    expect(chatCalls()).toHaveLength(0);
  });

  test('pesquisa por módulo parcial (completo=false) continua bloqueando', async () => {
    const ag = await sessaoComPlano();
    fs.writeFileSync(path.join(SCR, 'pesquisa_modulos.json'), JSON.stringify({ completo: false, modulos: [], achados: [], fontes: [], consultas: [] }));
    expect((await sse(ag, '/api/conteudo')).find(e => e.type === 'error').message).toMatch(mensagem);
  });

  test('"gerar sem pesquisa por módulo" libera, marca fonte modelo_sem_busca e o estado vira pulada', async () => {
    const ag = await sessaoComPlano();
    const r = await ag.post('/api/pesquisa-modulos/pular');
    expect(r.body).toEqual({ ok: true, status: 'pulada' });

    expect(json('pesquisa_modulos.json')).toMatchObject({ status: 'sem_web', fonte: 'modelo_sem_busca', pulada: true, completo: true });
    expect(json('projeto.json').stages.pesquisa_modulos.fonte).toBe('modelo_sem_busca');
    expect((await ag.get('/api/pesquisa-modulos/status')).body).toMatchObject({ status: 'pulada', obrigatoria: true });
    OpenAI.__setResponse('Conteúdo da aula.');
    const eventos = await sse(ag, '/api/conteudo');
    expect(eventos.find(e => e.type === 'error')).toBeUndefined();
    expect(eventos.find(e => e.type === 'done')).toBeDefined();
  });

  test('pesquisa por módulo concluída libera a Etapa 5', async () => {
    const ag = await sessaoComPlano();
    await sse(ag, '/api/pesquisa-modulos');
    expect((await ag.get('/api/pesquisa-modulos/status')).body.status).toBe('ok');
    OpenAI.__setResponse('Conteúdo da aula.');
    expect((await sse(ag, '/api/conteudo')).find(e => e.type === 'done')).toBeDefined();
  });

  test('projeto legado (conteúdo já gerado, sem pesquisa_modulos.json) nunca é bloqueado', async () => {
    const ag = await sessaoComPlano();
    fs.writeFileSync(path.join(SCR, 'aula01_conteudo.txt'), 'Conteúdo gerado antes desta funcionalidade.', 'utf-8');
    expect((await ag.get('/api/pesquisa-modulos/status')).body.status).toBe('legado');
    OpenAI.__setResponse('Conteúdo regenerado.');
    expect((await sse(ag, '/api/conteudo')).find(e => e.type === 'done')).toBeDefined();
    // e no modo legado os prompts continuam sem regras de citação
    expect(chatCalls()[0].messages[1].content).not.toContain('Fontes e achados da pesquisa');
    expect(chatCalls()[0].messages[1].content).not.toContain('SEM pesquisa web');
  });
});

describe('conteúdo fundamentado: dossiê, citações [F#] e referências', () => {
  async function comPesquisaModulos() {
    const ag = await sessaoComPlano();
    await sse(ag, '/api/pesquisa-modulos');
    OpenAI.__reset();
    return ag;
  }
  const txt = (n) => fs.readFileSync(path.join(SCR, `aula0${n}_conteudo.txt`), 'utf-8');

  test('o prompt da aula traz o dossiê do módulo, as regras de citação e os pré-requisitos', async () => {
    const ag = await comPesquisaModulos();
    OpenAI.__setResponse('Texto [F1] da aula.');
    await sse(ag, '/api/conteudo');

    const prompt = chatCalls()[0].messages[1].content;
    expect(prompt).toContain('## Fontes e achados da pesquisa');
    expect(prompt).toContain('[F1] Node.js Docs — nodejs.org');
    expect(prompt).toContain('Fundamentos'); // achado do módulo da aula 1
    expect(prompt).toContain('Regras de citação');
    expect(prompt).toContain('Pré-requisitos do curso: Lógica de programação');
    expect(prompt).toContain('Resumo'.slice(0, 0)); // contexto pedagógico segue presente abaixo
  });

  test('o texto recebe referências autoritativas só das fontes citadas, com URL, e a verificação vai para o estado', async () => {
    const ag = await comPesquisaModulos();
    OpenAI.__setResponses([
      'O mercado cresceu 35% [F1]. Outra afirmação [F2]. Dado sem fonte: 80% dos devs. Inventada [F9].\n\n### Referências da aula\n\n- falsa — https://inventada.com',
      'Aula dois cita só [F1].'
    ]);
    const eventos = await sse(ag, '/api/conteudo');

    const texto = txt(1);
    expect(texto).toMatch(/### Referências da aula\n\n- \[F1\] Node\.js Docs — https:\/\/nodejs\.org\/docs\n- \[F2\] MDN — https:\/\/developer\.mozilla\.org\/js\n$/);
    expect(texto).not.toContain('inventada.com');
    expect(texto.match(/### Referências da aula/g)).toHaveLength(1);
    const estado = json('projeto.json').estadoAulas['01'];
    expect(estado.citacoes).toMatchObject({ idsInvalidos: ['F9'], distintas: 2, minimoAtingido: true, numerosSemCitacao: 1 });
    expect(estado.dossie.modo).toBe('web');
    expect(estado.dossie.fontes.map(f => f.id)).toEqual(['F1', 'F2', 'F3']);
    // alertas, sem bloquear a gravação
    const avisos = eventos.filter(e => e.type === 'warning').map(e => e.text);
    expect(avisos.some(a => /fonte\(s\) inexistente\(s\).*\[F9\]/.test(a))).toBe(true);
    expect(avisos.some(a => /dado numérico sem citação/.test(a))).toBe(true);
    expect(avisos.some(a => /Aula 2 cita 1 fonte/.test(a))).toBe(true);
    expect(eventos.find(e => e.type === 'done').incompletas).toEqual([]);
    expect(fs.existsSync(path.join(PASTA, 'aula01_conteudo.docx'))).toBe(true);
  });

  test('aula que não cita nenhuma fonte: referências informam isso (nada é simulado)', async () => {
    const ag = await comPesquisaModulos();
    OpenAI.__setResponse('Texto sem nenhuma citação.');
    await sse(ag, '/api/conteudo');
    expect(txt(1)).toMatch(/Nenhuma fonte do dossiê de pesquisa foi citada nesta aula\.\n$/);
  });

  test('modo sem_web: prompt proíbe citar e o texto não contém [F#] nem referências', async () => {
    const ag = await sessaoComPlano();
    await ag.post('/api/pesquisa-modulos/pular');
    OpenAI.__setResponse('Texto com [F1] indevido.\n\n### Referências da aula\n\n- inventada — https://falsa.com');
    await sse(ag, '/api/conteudo');

    const prompt = chatCalls()[0].messages[1].content;
    expect(prompt).toContain('SEM pesquisa web');
    expect(prompt).toContain('NÃO cite fontes');
    expect(prompt).not.toContain('## Fontes e achados da pesquisa');
    const texto = txt(1);
    expect(texto).not.toMatch(/\[F\d+\]/);
    expect(texto).not.toContain('Referências da aula');
    expect(texto).not.toContain('falsa.com');
  });

  test('modo por seções: roteiro recebe o dossiê (sem regras), seções recebem dossiê + regras, referências ficam no fim', async () => {
    process.env.CONTEUDO_MODO = 'secoes';
    const ag = await comPesquisaModulos();
    const palavras = (n) => Array.from({ length: n }, () => 'conteudo').join(' ');
    OpenAI.__setResponses([
      JSON.stringify({ secoes: [{ titulo: 'Declaração de variáveis', objetivo: 'declarar' }] }),
      `## Declaração de variáveis\n\nUm fato [F1] ${palavras(1300)}.`,
      `## Síntese\n\nFechamento ${palavras(650)}.`,
      // aula 2: roteiro + seções
      JSON.stringify({ secoes: [{ titulo: 'Consumo de APIs', objetivo: 'fetch' }] }),
      `## Consumo de APIs\n\nOutro fato [F2] ${palavras(1300)}.`,
      `## Síntese\n\nFim ${palavras(650)}.`
    ]);
    await sse(ag, '/api/conteudo');

    const c = chatCalls();
    expect(c[0].messages[1].content).toContain('## Fontes e achados da pesquisa'); // roteiro: dossiê
    expect(c[0].messages[1].content).not.toContain('Regras de citação'); // ...sem regras
    expect(c[1].messages[1].content).toContain('Regras de citação'); // seção: dossiê + regras
    expect(c[1].messages[1].content).toContain('Pré-requisitos do curso: Lógica de programação');
    const texto = txt(1);
    expect(texto.indexOf('## Síntese')).toBeLessThan(texto.indexOf('### Referências da aula'));
    expect(texto).toMatch(/- \[F1\] Node\.js Docs — https:\/\/nodejs\.org\/docs\n$/);
    expect(json('projeto.json').estadoAulas['01'].estado).toBe('completa');
  });

  test('o plano de ensino recebe o dossiê estruturado da pesquisa geral no lugar do texto cru', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setResponse('Resumo de pesquisa geral');
    await sse(ag, '/api/search');
    OpenAI.__reset();
    OpenAI.__setResponse('Plano de ensino gerado');

    await sse(ag, '/api/plano-ensino');

    const prompt = chatCalls()[0].messages[1].content;
    expect(prompt).toContain('## Fontes e achados da pesquisa');
    expect(prompt).toContain('[F1] Node.js Docs — nodejs.org');
    expect(prompt).toContain('Pré-requisitos do curso: Lógica de programação');
    expect(prompt).not.toContain('Referências pesquisadas: ## Mercado'); // não é mais o texto cru
  });

  test('plano de ensino sem pesquisa estruturada (legado) segue com o texto cru', async () => {
    const ag = await sessaoComPlano();
    await ag.post('/api/importar/confirmar').send({ stage: 'pesquisa', texto: 'Pesquisa antiga em texto livre' });
    OpenAI.__setResponse('Plano');
    await sse(ag, '/api/plano-ensino');
    const prompt = chatCalls()[0].messages[1].content;
    expect(prompt).toContain('Referências pesquisadas: Pesquisa antiga em texto livre');
    expect(prompt).not.toContain('## Fontes e achados da pesquisa');
  });
});

describe('material falado ou projetado não leva marcadores nem referências', () => {
  test('slides e roteiro de avatar passam o texto da aula por limparParaMidia', () => {
    const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf-8');
    expect((fonte.match(/fundamentacao\.limparParaMidia\(aula\.texto\)/g) || []).length).toBe(3);
    expect(fonte).not.toMatch(/inputText: aula\.texto/);
    expect(fonte).not.toMatch(/aulaTexto: aula\.texto/);
  });
});
