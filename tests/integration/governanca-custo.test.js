'use strict';

// Governança de custo no servidor (change governanca-de-custo): orçamento baixo simulado
// (alerta, degradação de perfil, pausa e retomada), rotas /api/orcamento, perfis, papéis de
// modelo, juiz final em cascata e gatilhos do disjuntor, tudo com o mock da OpenAI.
jest.mock('openai');
jest.mock('mammoth');

const request = require('supertest');
const OpenAI = require('openai');
const mammoth = require('mammoth');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const PASTA = path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-governanca');
const SCR = path.join(PASTA, 'scr');
const DIARIO = path.join(os.tmpdir(), 'gerador-conteudo-tests', 'uso-diario-governanca.json');
const CONFIG = {
  nome: 'Curso Governanca',
  publico: 'Desenvolvedores júnior',
  carga: '3', // 3 aulas de 60 min
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
  { titulo: 'Objetos', modulo: 'Avançado', objetivos: 'trabalhar com objetos' }
];
const VARS = [
  'ORCAMENTO_MAX_USD', 'ORCAMENTO_USD', 'ORCAMENTO_DIA_MAX_USD', 'ORCAMENTO_ETAPA_MAX_USD', 'CUSTO_PERFIL',
  'CUSTO_DEGRADACAO_AUTOMATICA', 'OPENAI_SUMMARY_MODEL', 'OPENAI_EVAL_MODEL', 'OPENAI_JUDGE_MODEL', 'OPENAI_CONTENT_MODEL',
  'DISJUNTOR_ERROS_SEGUIDOS', 'DISJUNTOR_FATOR_CUSTO', 'CONTEUDO_MODO', 'USO_DIARIO_FILE'
];
const ENV_ORIGINAL = Object.fromEntries(VARS.map(k => [k, process.env[k]]));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  OpenAI.__reset();
  fs.rmSync(PASTA, { recursive: true, force: true });
  fs.rmSync(DIARIO, { force: true });
  process.env.CONTEUDO_MODO = 'unico';
  process.env.USO_DIARIO_FILE = DIARIO;
});
afterEach(() => {
  for (const k of VARS) {
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
const prompt = (c) => c.messages[1].content;
const tipos = (eventos) => eventos.map(e => e.type);
const chamadas = () => OpenAI.__getMock().mock.calls.map(([p]) => p);
const orcamento = (ag, corpo) => ag.post('/api/orcamento').send(corpo);

async function sessao() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(CONFIG);
  return ag;
}
async function sessaoComPlano() {
  const ag = await sessao();
  OpenAI.__setResponder((params) => params.response_format
    ? JSON.stringify({ aulas: AULAS })
    : `Plano da aula ${prompt(params).match(/Aula (\d) de/)?.[1] || '?'}.`);
  await sse(ag, '/api/plano-aula');
  OpenAI.__reset();
  return ag;
}

describe('rotas /api/orcamento', () => {
  test('GET devolve tetos, gasto, perfil e avisos, sem dados sensíveis', async () => {
    process.env.ORCAMENTO_MAX_USD = '5';
    const ag = await sessao();
    const res = await ag.get('/api/orcamento');
    expect(res.status).toBe(200);
    expect(res.body.projeto).toMatchObject({ tetoUsd: 5, gastoUsd: 0, restanteUsd: 5 });
    expect(res.body.perfil.id).toBe('padrao');
    expect(res.body.perfis.map(p => p.id)).toEqual(['economico', 'padrao', 'premium']);
    expect(res.body.tarifaBuscaWebConfigurada).toBe(false);
    expect(res.body.modelos).toMatchObject({ pesquisa: expect.any(String), juiz: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toMatch(/sk-|api[_-]?key|gerador-conteudo-tests/i);
  });

  test('POST ajusta teto e perfil; valores inválidos voltam 400 e nada muda', async () => {
    const ag = await sessao();
    const ok = await orcamento(ag, { tetos: { projeto: 10 }, perfil: 'economico' });
    expect(ok.status).toBe(200);
    expect(ok.body.projeto.tetoUsd).toBe(10);
    expect(ok.body.perfil.id).toBe('economico');
    expect(JSON.parse(fs.readFileSync(path.join(SCR, 'uso.json'), 'utf-8'))).toMatchObject({ perfil: 'economico', tetos: { projeto: 10 } });

    for (const ruim of [{ tetos: { projeto: -2 } }, { perfil: 'ultra' }, { decisao: 'pular' }, { tetos: { semana: 3 } }]) {
      const r = await orcamento(ag, ruim);
      expect(r.status).toBe(400);
      expect(r.body.error).toBeTruthy();
    }
    expect((await ag.get('/api/orcamento')).body.projeto.tetoUsd).toBe(10);
  });

  test('o orçamento persiste em uso.json e é restaurado ao carregar o projeto', async () => {
    const ag = await sessaoComPlano();
    await orcamento(ag, { tetos: { projeto: 7 }, perfil: 'premium' });
    const novo = request.agent(app);
    await novo.post('/api/carregar-projeto').send({ pasta: PASTA });
    const e = (await novo.get('/api/orcamento')).body;
    expect(e.projeto.tetoUsd).toBe(7);
    expect(e.perfil.id).toBe('premium');
  });
});

describe('orçamento baixo simulado: alerta, degradação, pausa e retomada', () => {
  test('alerta em 80%, perfil desce entre aulas, pausa no teto sem apagar o que está pronto e retoma depois de aumentar', async () => {
    const ag = await sessaoComPlano();
    expect((await orcamento(ag, { tetos: { projeto: 0.02 } })).status).toBe(200);
    OpenAI.__setUsage(10, 16000); // ≈ US$ 0,0096 por chamada (gpt-4o-mini)
    OpenAI.__setResponder(() => 'Texto da aula, completo e fechado.');

    const eventos = await sse(ag, '/api/conteudo');

    expect(tipos(eventos)).toEqual(expect.arrayContaining(['alerta_orcamento', 'perfil_alterado', 'pausado_orcamento', 'error']));
    expect(tipos(eventos)).not.toContain('done');
    expect(eventos.find(e => e.type === 'alerta_orcamento')).toMatchObject({ escopo: 'projeto', tetoUsd: 0.02 });
    expect(eventos.find(e => e.type === 'perfil_alterado')).toMatchObject({ de: 'padrao', para: 'economico' });
    const pausa = eventos.find(e => e.type === 'pausado_orcamento');
    expect(pausa).toMatchObject({ escopo: 'projeto', opcoes: ['aumentar-teto', 'trocar-perfil', 'cancelar'] });
    // a ordem importa: alerta e perfil antes da pausa
    expect(tipos(eventos).indexOf('alerta_orcamento')).toBeLessThan(tipos(eventos).indexOf('pausado_orcamento'));

    // o que estava pronto fica salvo; a aula da pausa não vira arquivo oficial
    expect(fs.existsSync(path.join(SCR, 'aula01_conteudo.txt'))).toBe(true);
    expect(fs.existsSync(path.join(SCR, 'aula02_conteudo.txt'))).toBe(true);
    expect(fs.existsSync(path.join(SCR, 'aula03_conteudo.txt'))).toBe(false);
    // o gasto real nunca passou do teto além de uma chamada
    const estado = (await ag.get('/api/orcamento')).body;
    expect(estado.projeto.gastoUsd).toBeLessThanOrEqual(0.02 + 0.0096);
    expect(estado.pausa).toMatchObject({ escopo: 'projeto' });
    expect(estado.perfil.id).toBe('economico');
    const chamadasAntes = chamadas().length;
    expect(chamadasAntes).toBe(2);

    // reexecutar sem aumentar o teto pausa de imediato, sem nenhuma chamada à OpenAI
    const denovo = await sse(ag, '/api/conteudo');
    expect(tipos(denovo)).toContain('pausado_orcamento');
    expect(chamadas().length).toBe(chamadasAntes);

    // aumentar o teto limpa a pausa e a etapa retoma sem regenerar as aulas prontas
    OpenAI.__setUsage(10, 20);
    expect((await orcamento(ag, { tetos: { projeto: 5 } })).status).toBe(200);
    expect((await ag.get('/api/orcamento')).body.pausa).toBeNull();
    const retomada = await sse(ag, '/api/conteudo');
    const done = retomada.find(e => e.type === 'done');
    expect(done).toBeDefined();
    expect(done.puladas).toEqual([1, 2]);
    expect(chamadas().length).toBe(chamadasAntes + 1);
    expect(fs.existsSync(path.join(SCR, 'aula03_conteudo.txt'))).toBe(true);
  });

  test('sem nenhum teto, o gasto não bloqueia nem degrada nada', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setUsage(10, 16000);
    OpenAI.__setResponder(() => 'Texto da aula, completo e fechado.');
    const eventos = await sse(ag, '/api/conteudo');
    expect(tipos(eventos)).toContain('done');
    for (const t of ['alerta_orcamento', 'perfil_alterado', 'pausado_orcamento', 'disjuntor']) expect(tipos(eventos)).not.toContain(t);
    expect((await ag.get('/api/orcamento')).body.perfil.id).toBe('padrao');
  });

  test('o teto por etapa pausa só aquela etapa', async () => {
    const ag = await sessaoComPlano();
    await orcamento(ag, { tetos: { etapa: 0.015 } });
    OpenAI.__setUsage(10, 16000);
    OpenAI.__setResponder(() => 'Texto da aula, completo e fechado.');
    const eventos = await sse(ag, '/api/conteudo');
    expect(eventos.find(e => e.type === 'pausado_orcamento')).toMatchObject({ escopo: 'etapa' });
  });

  test('o teto diário vale entre projetos (arquivo global)', async () => {
    const ag = await sessaoComPlano();
    fs.mkdirSync(path.dirname(DIARIO), { recursive: true });
    const hoje = new Date();
    const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    fs.writeFileSync(DIARIO, JSON.stringify({ data, totalUsd: 4.999 }), 'utf-8'); // outro projeto já gastou o dia quase todo
    process.env.ORCAMENTO_DIA_MAX_USD = '5';
    OpenAI.__setResponder(() => 'Texto da aula.');
    const eventos = await sse(ag, '/api/conteudo');
    expect(eventos.find(e => e.type === 'pausado_orcamento')).toMatchObject({ escopo: 'dia' });
    expect(chamadas().length).toBe(0);
  });

  test('o erro de orçamento não é engolido pelos laços que toleram falhas (pesquisa)', async () => {
    const ag = await sessao();
    process.env.ORCAMENTO_MAX_USD = '0.0000001';
    const eventos = await sse(ag, '/api/search?topicos=teste');
    expect(tipos(eventos)).toContain('pausado_orcamento');
    expect(eventos.find(e => e.type === 'error').message).toMatch(/Orçamento/);
    expect(tipos(eventos)).not.toContain('done');
    expect(OpenAI.__getResponsesMock()).not.toHaveBeenCalled();
  });
});

describe('perfis e papéis de modelo', () => {
  test('o perfil define o número de consultas da pesquisa e o contexto da busca', async () => {
    const consultas = async (perfil) => {
      OpenAI.__reset();
      fs.rmSync(PASTA, { recursive: true, force: true }); // uso.json (perfil) persiste na pasta do projeto
      const ag = await sessao();
      if (perfil) await orcamento(ag, { perfil });
      await sse(ag, '/api/search?topicos=teste');
      const chamadasResp = OpenAI.__getResponsesMock().mock.calls.map(([p]) => p);
      return { n: chamadasResp.length, contextos: [...new Set(chamadasResp.map(p => p.tools[0].search_context_size))] };
    };
    expect(await consultas('economico')).toEqual({ n: 2, contextos: ['low'] });
    expect(await consultas(null)).toEqual({ n: 4, contextos: ['medium'] });
    expect(await consultas('premium')).toEqual({ n: 4, contextos: ['high'] }); // o planejamento só tem 4 consultas
  });

  test('o modelo da chamada vem do papel: resumos, avaliação e a redação conforme o perfil', async () => {
    process.env.OPENAI_SUMMARY_MODEL = 'gpt-4.1-mini';
    process.env.OPENAI_CONTENT_MODEL = 'gpt-4o';
    process.env.OPENAI_JUDGE_MODEL = 'gpt-4.1';
    const ag = await sessao();
    OpenAI.__setResponder(() => JSON.stringify({ aulas: AULAS }));
    await sse(ag, '/api/plano-aula');
    expect(chamadas().length).toBeGreaterThan(0);
    for (const p of chamadas()) expect(p.model).toBe('gpt-4.1-mini'); // papel resumos

    const modelosDoConteudo = async (perfil) => {
      OpenAI.__reset();
      fs.rmSync(PASTA, { recursive: true, force: true });
      const s = await sessaoComPlano();
      await orcamento(s, { perfil });
      OpenAI.__setResponder(() => 'Texto da aula.');
      await sse(s, '/api/conteudo');
      return [...new Set(chamadas().map(p => p.model))];
    };
    expect(await modelosDoConteudo('padrao')).toEqual(['gpt-4o']); // modelo de redação configurado
    expect(await modelosDoConteudo('economico')).toEqual(['gpt-4o-mini']); // economia
    expect(await modelosDoConteudo('premium')).toEqual(['gpt-4.1']); // modelo forte (juiz)
  });

  test('estimativa usa o perfil e o saldo restante e avisa quando passa do saldo', async () => {
    const ag = await sessaoComPlano();
    const sem = (await ag.get('/api/estimativa?etapa=conteudo')).body;
    expect(sem.saldo.restanteUsd).toBeNull();
    expect(sem.excedeSaldo).toBe(false);
    expect(sem.perfil).toBe('padrao');
    await orcamento(ag, { tetos: { projeto: 0.0001 } });
    const com = (await ag.get('/api/estimativa?etapa=conteudo')).body;
    expect(com.saldo.restanteUsd).toBeLessThanOrEqual(0.0001);
    expect(com.excedeSaldo).toBe(true);
    const eco = (await (async () => { await orcamento(ag, { perfil: 'economico' }); return ag.get('/api/estimativa?etapa=conteudo'); })()).body;
    expect(eco.modelo).toBe('gpt-4o-mini');
  });
});

describe('juiz final em cascata (aplicar melhorias)', () => {
  const NOTAS_ALTAS = { planoAula: 10, planoEnsinoEmenta: 10, nivelPublicoModalidade: 10, qualidadeDidatica: 10, clarezaEstrutura: 10 };

  async function prepararMelhorias() {
    const ag = await sessaoComPlano();
    OpenAI.__setResponder(() => 'Conteúdo original da aula, com parágrafos regulares para teste.');
    await sse(ag, '/api/conteudo');
    OpenAI.__reset();
    mammoth.extractRawText.mockResolvedValue({ value: 'Melhorias a serem Aplicadas\n\nAula 01\nAdicionar um exemplo prático\n\n' });
    const up = await ag.post('/api/aplicar-melhorias').attach('arquivo', Buffer.from('fake'), 'revisao.docx');
    expect(up.status).toBe(200);
    OpenAI.__reset();
    // as chamadas de julgamento pedem JSON; as demais devolvem o texto revisado
    OpenAI.__setResponder((params) => (params.response_format
      ? JSON.stringify({ original: NOTAS_ALTAS, candidato: NOTAS_ALTAS })
      : 'Conteúdo revisado da aula com exemplo prático.\n\n### Melhorias Aplicadas\n- Exemplo prático adicionado (item 1).'));
    return ag;
  }
  const modelosDeJulgamento = () => chamadas().filter(p => p.response_format).map(p => p.model);

  test('caso duvidoso (rubrica e determinístico divergem) chama o juiz forte; o Econômico não', async () => {
    process.env.OPENAI_JUDGE_MODEL = 'gpt-4.1';
    const ag = await prepararMelhorias();
    const eventos = await sse(ag, '/api/aplicar-melhorias/confirmar');
    expect(eventos.some(e => e.type === 'progress' && /consultando o juiz final/.test(e.message))).toBe(true);
    expect(modelosDeJulgamento()).toEqual(['gpt-4o-mini', 'gpt-4.1']);

    OpenAI.__reset();
    await orcamento(ag, { perfil: 'economico' });
    OpenAI.__setResponder((params) => (params.response_format
      ? JSON.stringify({ original: NOTAS_ALTAS, candidato: NOTAS_ALTAS })
      : 'Conteúdo revisado da aula com exemplo prático.\n\n### Melhorias Aplicadas\n- Exemplo prático adicionado (item 1).'));
    await ag.post('/api/orcamento').send({ decisao: 'pular' }); // não há disparo pendente: 400, só para provar que não derruba nada
    const semForte = await sse(ag, '/api/aplicar-melhorias/confirmar');
    expect(semForte.some(e => e.type === 'progress' && /consultando o juiz final/.test(e.message))).toBe(false);
    expect(modelosDeJulgamento().every(m => m === 'gpt-4o-mini')).toBe(true);
  });

  test('sem um modelo forte distinto do da primeira passada a cascata não refaz o julgamento', async () => {
    const ag = await prepararMelhorias();
    const eventos = await sse(ag, '/api/aplicar-melhorias/confirmar');
    expect(eventos.some(e => /consultando o juiz final/.test(e.message || ''))).toBe(false);
    expect(modelosDeJulgamento()).toEqual(['gpt-4o-mini']);
  });

  test('Premium aciona o juiz forte sempre', async () => {
    process.env.OPENAI_JUDGE_MODEL = 'gpt-4.1';
    const ag = await prepararMelhorias();
    await orcamento(ag, { perfil: 'premium' });
    const eventos = await sse(ag, '/api/aplicar-melhorias/confirmar');
    expect(eventos.some(e => /consultando o juiz final/.test(e.message || ''))).toBe(true);
    expect(modelosDeJulgamento()).toContain('gpt-4.1');
  });
});

describe('disjuntor', () => {
  test('erro repetido: o mesmo erro três vezes seguidas dispara; reexecutar sem decidir não chama a API', async () => {
    const ag = await sessao();
    const erro = Object.assign(new Error('requisição inválida'), { status: 400 });
    OpenAI.__setError(erro);
    for (let i = 0; i < 2; i++) {
      const r = await ag.get('/api/metodologia');
      expect(r.status).toBe(500);
      expect(r.body.error).toMatch(/requisição inválida/);
    }
    const terceira = await ag.get('/api/metodologia');
    expect(terceira.status).toBe(500);
    expect(terceira.body.error).toMatch(/Disjuntor.*400.*3 vezes/);
    const estado = (await ag.get('/api/orcamento')).body;
    expect(estado.disjuntor).toMatchObject({ motivo: 'erro_repetido' });

    const chamadasAntes = OpenAI.__getMock().mock.calls.length;
    OpenAI.__reset();
    const bloqueada = await ag.get('/api/metodologia');
    expect(bloqueada.body.error).toMatch(/Disjuntor/);
    expect(OpenAI.__getMock()).not.toHaveBeenCalled();
    expect(chamadasAntes).toBe(3);

    // decidir libera
    expect((await orcamento(ag, { decisao: 'aumentar-limite' })).status).toBe(200);
    expect((await ag.get('/api/orcamento')).body.disjuntor).toBeNull();
    const livre = await ag.get('/api/metodologia');
    expect(livre.status).toBe(200);
  });

  test('custo: a aula que passa de 2× a estimativa interrompe e fica incompleta com o parcial salvo', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setUsage(10, 40000); // ≈ US$ 0,024 por chamada; estimativa da aula ≈ US$ 0,019
    OpenAI.__setFinishReasons(['length', 'length', 'stop']);
    OpenAI.__setResponder(() => 'Texto da aula que foi cortado no meio ');
    const eventos = await sse(ag, '/api/conteudo');
    expect(eventos.find(e => e.type === 'disjuntor')).toMatchObject({ motivo: 'custo', unidade: 'aula 1' });
    expect(tipos(eventos)).not.toContain('done');
    expect(chamadas().length).toBe(2); // a terceira chamada foi barrada antes de gastar
    expect(fs.existsSync(path.join(SCR, 'aula01_conteudo.txt'))).toBe(false);
    expect(fs.existsSync(path.join(SCR, 'aula01_conteudo.partial.txt'))).toBe(false); // só há parcial quando o gatilho vem de uma continuação
    const projeto = JSON.parse(fs.readFileSync(path.join(SCR, 'projeto.json'), 'utf-8'));
    expect(projeto.estadoAulas['01']).toMatchObject({ estado: 'incompleta' });
    expect(projeto.estadoAulas['01'].motivos.join(' ')).toMatch(/disjuntor: custo/);
    const registro = JSON.parse(fs.readFileSync(path.join(SCR, 'uso.json'), 'utf-8')).disparos[0];
    expect(registro).toMatchObject({ motivo: 'custo', unidade: 'aula 1' });
    expect(registro.valores.custoUsd).toBeGreaterThan(registro.valores.estimativaUsd * 2);
  });

  test('pular: a aula pulada continua incompleta, não é regenerada e a etapa segue para as demais', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setFinishReasons(['length', 'length', 'length']);
    OpenAI.__setResponder(() => 'Texto cortado no meio de');
    const primeira = await sse(ag, '/api/conteudo');
    expect(primeira.find(e => e.type === 'disjuntor')).toMatchObject({ motivo: 'continuacoes', unidade: 'aula 1' });

    OpenAI.__reset();
    OpenAI.__setResponder(() => 'Aula completa e fechada.');
    expect((await orcamento(ag, { decisao: 'pular' })).status).toBe(200);
    const eventos = await sse(ag, '/api/conteudo');
    expect(eventos.some(e => e.type === 'warning' && /Aula 1 pulada/.test(e.text))).toBe(true);
    expect(chamadas().length).toBe(2); // só as aulas 2 e 3
    expect(JSON.parse(fs.readFileSync(path.join(SCR, 'projeto.json'), 'utf-8')).estadoAulas['01'].estado).toBe('incompleta');
    expect(fs.existsSync(path.join(SCR, 'aula01_conteudo.txt'))).toBe(false);
    expect(fs.existsSync(path.join(SCR, 'aula02_conteudo.txt'))).toBe(true);
  });

  test('trocar-perfil como decisão limpa o disparo e aplica o perfil', async () => {
    const ag = await sessaoComPlano();
    OpenAI.__setFinishReasons(['length', 'length', 'length']);
    OpenAI.__setResponder(() => 'Texto cortado no meio de');
    await sse(ag, '/api/conteudo');
    expect((await orcamento(ag, { decisao: 'trocar-perfil' })).status).toBe(400); // falta o perfil
    expect((await orcamento(ag, { decisao: 'trocar-perfil', perfil: 'economico' })).status).toBe(200);
    const e = (await ag.get('/api/orcamento')).body;
    expect(e.perfil.id).toBe('economico');
    expect(e.disjuntor).toBeNull();
  });

  test('ciclo de melhoria sem ganho interrompe no perfil Padrão e só avisa no Premium', async () => {
    const preparar = async () => {
      fs.rmSync(PASTA, { recursive: true, force: true }); // um disparo pendente persiste em uso.json
      const ag = await sessaoComPlano();
      OpenAI.__setResponder(() => 'Conteúdo original da aula, com parágrafos regulares para teste.');
      await sse(ag, '/api/conteudo');
      fs.writeFileSync(path.join(SCR, 'score_historico.json'), JSON.stringify({
        ciclos: [{ ciclo: 1, formulaVersao: '2', dataHora: new Date().toISOString(), porAula: [], ganhoMedio: 0.001 }]
      }), 'utf-8');
      OpenAI.__reset();
      OpenAI.__setResponder(() => 'Conteúdo revisado.\n\n### Melhorias Aplicadas\n- ok (item 1).');
      return ag;
    };
    const padrao = await preparar();
    const barrado = await sse(padrao, '/api/aplicar-melhorias/confirmar');
    expect(barrado.find(e => e.type === 'disjuntor')).toMatchObject({ motivo: 'sem_ganho', unidade: 'ciclo de melhoria' });
    expect(tipos(barrado)).not.toContain('done');
    expect(OpenAI.__getMock()).not.toHaveBeenCalled();
    expect(fs.readdirSync(SCR).filter(n => /^ciclo_\d{3}$/.test(n))).toEqual([]); // nem o snapshot do ciclo foi criado

    const premium = await preparar();
    await orcamento(premium, { perfil: 'premium' });
    const aviso = await sse(premium, '/api/aplicar-melhorias/confirmar');
    expect(aviso.some(e => e.type === 'warning' && /elevou a nota/.test(e.text))).toBe(true);
    expect(tipos(aviso)).not.toContain('disjuntor');
  });

  test('o limite de ciclos do perfil só vale com teto ou perfil escolhido, e "aumentar-limite" libera mais um', async () => {
    const preparar = async () => {
      const ag = await sessaoComPlano();
      OpenAI.__setResponder(() => 'Conteúdo original da aula, com parágrafos regulares para teste.');
      await sse(ag, '/api/conteudo');
      const ciclos = [1, 2].map(n => ({ ciclo: n, formulaVersao: '2', dataHora: new Date().toISOString(), porAula: [], ganhoMedio: 0.5 }));
      fs.writeFileSync(path.join(SCR, 'score_historico.json'), JSON.stringify({ ciclos }), 'utf-8');
      OpenAI.__reset();
      OpenAI.__setResponder(() => 'Conteúdo revisado.\n\n### Melhorias Aplicadas\n- ok (item 1).');
      return ag;
    };
    // sem teto nem perfil escolhido: ciclos ilimitados, como antes
    const livre = await preparar();
    expect(tipos(await sse(livre, '/api/aplicar-melhorias/confirmar'))).not.toContain('disjuntor');

    // com o Econômico (máx. 1 ciclo) e 2 ciclos no histórico: o disjuntor barra
    const ag = await preparar();
    await orcamento(ag, { perfil: 'economico' });
    const eventos = await sse(ag, '/api/aplicar-melhorias/confirmar');
    expect(eventos.find(e => e.type === 'disjuntor')).toMatchObject({ motivo: 'limite_ciclos', valores: { ciclos: 2, max: 1 } });
    expect(OpenAI.__getMock()).not.toHaveBeenCalled();
    await orcamento(ag, { decisao: 'aumentar-limite' });
    expect(tipos(await sse(ag, '/api/aplicar-melhorias/confirmar'))).not.toContain('disjuntor');
  });
});

describe('reserva em todas as chamadas', () => {
  test('o wrapper único reserva antes de chamar e acerta depois (teste estático)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf-8');
    const corpo = src.slice(src.indexOf('async function chamarOpenAI('), src.indexOf('const UPLOAD_MAX_BYTES'));
    expect(corpo).toMatch(/governanca\.antes\(/);
    expect(corpo).toMatch(/governanca\.depois\(/);
    expect(corpo.indexOf('governanca.antes(')).toBeLessThan(corpo.indexOf('openai.chat.completions.create('));
    // nenhuma chamada ao SDK fora do wrapper
    const fora = src.replace(corpo, '');
    expect(fora).not.toMatch(/openai\.(chat\.completions|responses)\.create\(/);
  });
});
