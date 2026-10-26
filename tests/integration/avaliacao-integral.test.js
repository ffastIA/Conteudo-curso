'use strict';

jest.mock('openai');
jest.mock('mammoth');

const request = require('supertest');
const OpenAI = require('openai');
const mammoth = require('mammoth');
const os = require('os');
const path = require('path');
const fs = require('fs');
const app = require('../../server');

const PASTA = path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-avaliacao-integral');
const SCR = path.join(PASTA, 'scr');
const CONFIG = {
  nome: 'Curso de Avaliação Integral',
  publico: 'Desenvolvedores júnior',
  carga: '2', // 2 aulas, 2 módulos
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender JavaScript',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: PASTA
};
const PLANO_AULAS = JSON.stringify({ aulas: [
  { titulo: 'Variáveis', modulo: 'Fundamentos', objetivos: 'declarar variáveis e tipos primitivos' },
  { titulo: 'Requisições HTTP', modulo: 'Web', objetivos: 'consumir APIs REST com fetch' }
] });

const palavras = (n, p = 'conteudo') => Array.from({ length: n }, () => p).join(' ');
// Aula de ~14 mil caracteres (muito mais que os antigos 2.000/3.000/4.000 do truncate)
// com uma SENTINELA no fim da última seção: se o texto for cortado, ela some do prompt.
const aulaTexto = (id) =>
  `## Variáveis ${id}\n\n${palavras(400)}.\n\n## Funções ${id}\n\n${palavras(400)}.\n\n## Síntese\n\nFechamento. SENTINELA-FINAL-${id}\n`;
const AULA1 = aulaTexto('A');
const AULA2 = aulaTexto('B');

const RUBRICA =
  'Aderência ao Plano de Aula: 8/10\nAderência ao Plano de Ensino e Ementa: 7/10\n' +
  'Adequação a Nível/Público/Modalidade: 9/10\nQualidade Didática: 6/10\nClareza e Estrutura: 8/10';
const REVISAO_TEXTO = (n) =>
  `### Compatibilidade com o Plano de Aula\nOk (${n}).\n\n### Nota de Qualidade\n${RUBRICA}\n\n### Resumo de Melhorias Propostas\n- [Qualidade Didática] Adicionar exemplo prático\n`;

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  delete process.env.AVALIACAO_MAX_TOKENS_ENTRADA;
  process.env.PESQUISA_MODULOS_OBRIGATORIA = 'false';
  jest.restoreAllMocks();
});

beforeEach(() => {
  OpenAI.__reset();
  fs.rmSync(PASTA, { recursive: true, force: true });
  delete process.env.AVALIACAO_MAX_TOKENS_ENTRADA;
  process.env.PESQUISA_MODULOS_OBRIGATORIA = 'false';
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

// Sessão com plano de aula (2 aulas em 2 módulos) e conteúdo gerado (AULA1/AULA2).
async function sessaoComConteudo() {
  const ag = request.agent(app);
  await ag.post('/api/config').send(CONFIG);
  OpenAI.__setResponses([PLANO_AULAS, 'Plano detalhado gerado a partir do JSON.']);
  await sse(ag, '/api/plano-aula');
  OpenAI.__reset();
  OpenAI.__setResponses([AULA1, AULA2]);
  await sse(ag, '/api/conteudo');
  OpenAI.__reset();
  return ag;
}

const json = (nome) => JSON.parse(fs.readFileSync(path.join(SCR, nome), 'utf-8'));
const chatCalls = () => OpenAI.__getMock().mock.calls.map(([params]) => params);
const promptDe = (c) => c.messages[1].content;
const ehJson = (c) => !!c.response_format;

describe('regra geral: sem truncamento em avaliação (teste estático)', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf-8');

  function handler(assinatura) {
    const ini = fonte.indexOf(assinatura);
    if (ini < 0) throw new Error(`rota não encontrada: ${assinatura}`);
    const fim = fonte.indexOf('\n});\n', ini);
    return fonte.slice(ini, fim + 5);
  }

  test.each([
    "app.get('/api/revisao-qualidade'",
    "app.get('/api/qualidade'",
    "app.get('/api/ppc'",
    "app.post('/api/aplicar-melhorias'",
    "app.get('/api/aplicar-melhorias/confirmar'"
  ])('a rota %s não corta texto por caracteres', (assinatura) => {
    const codigo = handler(assinatura);
    expect(codigo).not.toMatch(/truncate\s*\(/);
    expect(codigo).not.toMatch(/\.slice\(0,\s*\d{3,}\)/);
  });

  test('as funções de avaliação (revisão, juiz de score, qualidade, infraestrutura) também não cortam', () => {
    for (const nome of ['async function revisarAula(', 'async function julgarVersoes(', 'async function montarContextoQualidade(', 'async function conteudoParaInfraestrutura(']) {
      const ini = fonte.indexOf(nome);
      expect(ini).toBeGreaterThan(0);
      const corpo = fonte.slice(ini, fonte.indexOf('\n}\n', ini));
      expect(corpo).not.toMatch(/truncate\s*\(/);
      expect(corpo).not.toMatch(/\.slice\(0,\s*\d{3,}\)/);
    }
  });

  test('a função de corte por caracteres não existe mais no servidor', () => {
    expect(fonte).not.toMatch(/function truncate\s*\(/);
  });
});

describe('revisão de qualidade lê a aula inteira', () => {
  test('chamada única: o prompt traz TODAS as seções (a sentinela do fim está presente) e o log registra 100% lidas', async () => {
    const ag = await sessaoComConteudo();
    OpenAI.__setResponder(() => REVISAO_TEXTO('x'));

    const eventos = await sse(ag, '/api/revisao-qualidade');

    expect(eventos.find(e => e.type === 'done')).toBeDefined();
    const calls = chatCalls();
    expect(calls).toHaveLength(2); // uma revisão por aula, sem map-reduce
    expect(promptDe(calls[0])).toContain('SENTINELA-FINAL-A');
    expect(promptDe(calls[0])).toContain('## Funções A');
    expect(promptDe(calls[1])).toContain('SENTINELA-FINAL-B');

    const log = json('revisao_log.json');
    expect(log.formulaVersao).toBe('2');
    expect(log.aulas).toHaveLength(2);
    for (const aula of log.aulas) {
      expect(aula.modo).toBe('unica');
      expect(aula.secoesLidas).toBe(aula.totalSecoes);
      expect(aula.secoes.map(s => s.titulo)).toEqual([expect.stringMatching(/^Variáveis/), expect.stringMatching(/^Funções/), 'Síntese']);
      expect(aula.secoes.every(s => s.lida)).toBe(true);
    }
    const notas = json('notas_aulas.json');
    expect(notas[0]).toMatchObject({ numero: 1, criterios: { planoAula: 8, qualidadeDidatica: 6 } });
  });

  test('plano de ensino e ementa entram completos na revisão (sem os antigos 1.500 caracteres)', async () => {
    const ag = await sessaoComConteudo();
    const planoLongo = `${palavras(600)}\n\nFIM-DO-PLANO-DE-ENSINO`;
    await ag.post('/api/importar/confirmar').send({ stage: 'plano_de_ensino', texto: planoLongo });
    OpenAI.__setResponder(() => REVISAO_TEXTO('x'));

    await sse(ag, '/api/revisao-qualidade');

    expect(promptDe(chatCalls()[0])).toContain('FIM-DO-PLANO-DE-ENSINO');
  });

  test('map-reduce: aula que não cabe é dividida em partes — nenhum trecho fica de fora — e consolidada pela fórmula existente', async () => {
    process.env.AVALIACAO_MAX_TOKENS_ENTRADA = '1500';
    const ag = await sessaoComConteudo();
    OpenAI.__setResponder((params) => params.response_format
      ? JSON.stringify({
        criterios: { planoAula: 8, planoEnsinoEmenta: 6, nivelPublicoModalidade: 7, qualidadeDidatica: 9, clarezaEstrutura: 5 },
        observacoes: 'Seção boa.', melhorias: ['[Clareza e Estrutura] Reorganizar a seção'], citacoesFracas: []
      })
      : REVISAO_TEXTO('reduce'));

    const eventos = await sse(ag, '/api/revisao-qualidade');

    expect(eventos.find(e => e.type === 'done')).toBeDefined();
    const calls = chatCalls();
    const mapas = calls.filter(ehJson);
    const reduces = calls.filter(c => !ehJson(c));
    expect(reduces).toHaveLength(2); // um reduce por aula
    expect(mapas.length).toBeGreaterThan(4);

    // cobertura: as partes avaliadas (map) da aula 1, juntas, reproduzem a aula inteira
    // a seção avaliada vem por último no prompt (o prefixo estável fica antes dela, para o cache de prompt)
    const trecho = (c) => promptDe(c).split(/## Seção a avaliar \(seção \d+ de \d+: "[^\n]*"\)\n/)[1].replace(/\n$/, '');
    const mapasAula1 = mapas.filter(c => promptDe(c).includes('da aula "Variáveis"'));
    const junto = mapasAula1.map(trecho).join('').replace(/\s+/g, ' ').trim();
    expect(junto).toBe(AULA1.replace(/\s+/g, ' ').trim());
    expect(junto).toContain('SENTINELA-FINAL-A');

    // reduce: recebe as avaliações de TODAS as partes e as notas consolidadas fixas
    const reduceAula1 = reduces[0];
    expect(promptDe(reduceAula1)).toContain('## Avaliação por seção');
    expect(promptDe(reduceAula1)).toContain('Use EXATAMENTE estas notas consolidadas');
    expect(promptDe(reduceAula1)).toContain('Aderência ao Plano de Aula: 8/10');
    expect(promptDe(reduceAula1)).not.toContain('SENTINELA-FINAL-A'); // o reduce vê notas curtas, não o texto
    const avaliadas = (promptDe(reduceAula1).match(/### Seção \d+ de \d+:/g) || []).length;
    expect(avaliadas).toBe(mapasAula1.length);

    // nota consolidada = fórmula existente (0,7 × rubrica + 0,3 × determinístico), a partir das notas das seções
    const aula = { titulo: 'Variáveis', objetivos: 'declarar variáveis e tipos primitivos' };
    // as duas aulas de teste são quase idênticas: o determinístico considera a sobreposição entre elas
    const sim = app.textSimilarity(AULA1, AULA2);
    const sobreposicao = sim >= 0.55 ? Math.round(sim * 100) / 100 : 0;
    const { determ } = app.computeScoreDeterministico(AULA1, aula, sobreposicao, null);
    const esperado = app.computeScoreComposto({ planoAula: 8, planoEnsinoEmenta: 6, nivelPublicoModalidade: 7, qualidadeDidatica: 9, clarezaEstrutura: 5 }, determ).score;
    const fullText = eventos.find(e => e.type === 'done').fullText;
    expect(fullText).toContain(`Aula 1: Variáveis — Nota: ${esperado.toFixed(2)}`);

    const log = json('revisao_log.json');
    expect(log.aulas[0]).toMatchObject({ modo: 'map-reduce', partesAvaliadas: mapasAula1.length });
    expect(log.aulas[0].secoesLidas).toBe(log.aulas[0].totalSecoes);
  });

  test('aula curta que cabe segue em chamada única mesmo com o orçamento ajustado (escolha pelo tamanho estimado)', async () => {
    process.env.AVALIACAO_MAX_TOKENS_ENTRADA = '100000';
    const ag = await sessaoComConteudo();
    OpenAI.__setResponder(() => REVISAO_TEXTO('x'));
    await sse(ag, '/api/revisao-qualidade');
    expect(chatCalls().filter(ehJson)).toHaveLength(0);
    expect(json('revisao_log.json').aulas.every(a => a.modo === 'unica')).toBe(true);
  });
});

describe('gate de score vê a aula inteira (inclusive melhoria no fim)', () => {
  async function prepararMelhoria(ag) {
    mammoth.extractRawText.mockResolvedValue({ value: 'Melhorias a serem Aplicadas\n\nAula 01\nAdicionar um exemplo prático na síntese\n\n' });
    const up = await ag.post('/api/aplicar-melhorias').attach('arquivo', Buffer.from('fake'), 'revisao.docx');
    expect(up.status).toBe(200);
  }

  const responderGate = (params) => {
    const prompt = params.messages[1].content;
    if (/PATCH POR SEÇÃO/.test(prompt)) {
      return '<<<SECAO: Síntese>>>\n## Síntese\n\nFechamento com EXEMPLO-NOVO-NO-FIM da aula.\n<<<FIM_SECAO>>>\n\n### Melhorias Aplicadas\n1. Exemplo adicionado na síntese';
    }
    if (/coerência global/.test(prompt)) return JSON.stringify({ original: 6, candidato: 8 });
    if (params.response_format) {
      return JSON.stringify({
        original: { planoAula: 6, planoEnsinoEmenta: 6, nivelPublicoModalidade: 6, qualidadeDidatica: 6, clarezaEstrutura: 6 },
        candidato: { planoAula: 8, planoEnsinoEmenta: 8, nivelPublicoModalidade: 8, qualidadeDidatica: 8, clarezaEstrutura: 8 }
      });
    }
    return 'Plano realinhado.';
  };

  test('chamada única: o juiz recebe as DUAS versões completas e a seção alterada é a última', async () => {
    const ag = await sessaoComConteudo();
    await prepararMelhoria(ag);
    OpenAI.__reset();
    OpenAI.__setResponder(responderGate);

    const eventos = await sse(ag, '/api/aplicar-melhorias/confirmar');

    expect(eventos.find(e => e.type === 'error')).toBeUndefined();
    const juiz = chatCalls().filter(c => /Avalie as duas versões/.test(promptDe(c)));
    expect(juiz).toHaveLength(1);
    const p = promptDe(juiz[0]);
    expect(p).toContain('SENTINELA-FINAL-A'); // versão original inteira, inclusive o fim
    expect(p).toContain('EXEMPLO-NOVO-NO-FIM'); // versão candidata inteira, inclusive a melhoria do fim
    expect(p).toContain('## Funções A'); // seções do meio presentes (nada de 4.000 caracteres)
    expect(p).toContain('Seções alteradas nesta versão (foco da comparação; o restante é idêntico): Síntese');

    const ciclo = json('score_historico.json').ciclos[0];
    expect(ciclo.formulaVersao).toBe('2');
    expect(ciclo.porAula[0]).toMatchObject({ modoJulgamento: 'unica', aceita: true });
    expect(ciclo.porAula[0].secoesVistas).toEqual(expect.arrayContaining(['Síntese']));
    expect(ciclo.porAula[0].secoesVistas.length).toBeGreaterThanOrEqual(3);
    expect(fs.readFileSync(path.join(SCR, 'aula01_conteudo.txt'), 'utf-8')).toContain('EXEMPLO-NOVO-NO-FIM');
  });

  test('não cabe: juiz por seção alterada (a do fim) + coerência global; mesmo modelo de nota e mesmo EPSILON', async () => {
    const ag = await sessaoComConteudo();
    await prepararMelhoria(ag);
    OpenAI.__reset();
    process.env.AVALIACAO_MAX_TOKENS_ENTRADA = '1800';
    OpenAI.__setResponder(responderGate);

    const eventos = await sse(ag, '/api/aplicar-melhorias/confirmar');

    expect(eventos.find(e => e.type === 'error')).toBeUndefined();
    const calls = chatCalls();
    const porSecao = calls.filter(c => /Avalie as duas versões/.test(promptDe(c)));
    expect(porSecao.length).toBeGreaterThanOrEqual(1);
    for (const c of porSecao) {
      expect(promptDe(c)).toContain('Seções alteradas nesta versão (foco da comparação; o restante é idêntico): Síntese');
      expect(promptDe(c)).not.toContain('## Variáveis A'); // seções idênticas ficam de fora do par
    }
    expect(porSecao.map(promptDe).join('\n')).toContain('EXEMPLO-NOVO-NO-FIM'); // a melhoria do fim foi vista
    const coerencia = calls.filter(c => /coerência global/.test(promptDe(c)));
    expect(coerencia).toHaveLength(1);
    expect(promptDe(coerencia[0])).toContain('- Variáveis A'); // resumo de TODAS as seções
    expect(promptDe(coerencia[0])).toContain('- Síntese');

    const ciclo = json('score_historico.json').ciclos[0];
    expect(ciclo.porAula[0].modoJulgamento).toBe('por-secao');
    expect(ciclo.porAula[0].secoesVistas).toEqual(['Síntese', 'coerência global (resumo de todas as seções)']);
    // 6 → 8 em todos os critérios: ganho acima do EPSILON (0,02) → aceita
    expect(ciclo.porAula[0].aceita).toBe(true);
    expect(ciclo.porAula[0].scoreCandidato).toBeGreaterThan(ciclo.porAula[0].scoreOriginal + app.EPSILON_ACEITE);
  });

  test('o aviso de convergência só compara ciclos da mesma versão da fórmula', async () => {
    const ag = await sessaoComConteudo();
    // ciclo antigo (sem formulaVersao) com ganho ~0: com a regra antiga dispararia o aviso
    fs.writeFileSync(path.join(SCR, 'score_historico.json'), JSON.stringify({ ciclos: [{ ciclo: 1, ganhoMedio: 0, porAula: [] }] }), 'utf-8');
    mammoth.extractRawText.mockResolvedValue({ value: 'Melhorias a serem Aplicadas\n\nAula 01\nAlgo\n\n' });
    const up = await ag.post('/api/aplicar-melhorias').attach('arquivo', Buffer.from('fake'), 'revisao.docx');
    expect(up.body.avisoConvergencia).toBeFalsy();

    // ciclo da fórmula atual com ganho ~0: o aviso aparece
    fs.writeFileSync(path.join(SCR, 'score_historico.json'), JSON.stringify({ ciclos: [{ ciclo: 2, formulaVersao: '2', ganhoMedio: 0, porAula: [] }] }), 'utf-8');
    const up2 = await ag.post('/api/aplicar-melhorias').attach('arquivo', Buffer.from('fake'), 'revisao.docx');
    expect(up2.body.avisoConvergencia).toMatchObject({ ciclo: 2 });
  });
});

describe('relatório técnico-pedagógico com o conteúdo integral', () => {
  test('chamada única: aulas inteiras (sentinela do fim), notas por aula e documentos de referência completos', async () => {
    const ag = await sessaoComConteudo();
    OpenAI.__setResponder(() => REVISAO_TEXTO('x'));
    await sse(ag, '/api/revisao-qualidade'); // gera notas_aulas.json
    OpenAI.__reset();
    OpenAI.__setResponse('Relatório técnico-pedagógico.');

    const eventos = await sse(ag, '/api/qualidade');

    expect(eventos.find(e => e.type === 'done')).toBeDefined();
    const calls = chatCalls();
    expect(calls).toHaveLength(1);
    const p = promptDe(calls[0]);
    expect(p).toContain('## Conteúdo Integral das Aulas');
    expect(p).toContain('SENTINELA-FINAL-A');
    expect(p).toContain('SENTINELA-FINAL-B');
    expect(p).toContain('## Notas de Qualidade por Aula');
    expect(p).toMatch(/- Aula 1: Variáveis — Nota: \d\.\d{2} \| Aderência ao Plano de Aula: 8\/10/);
  });

  test('não cabe: análise por módulo (etapa 1) com o conteúdo integral do módulo e síntese final (etapa 2)', async () => {
    const ag = await sessaoComConteudo();
    OpenAI.__setResponder(() => REVISAO_TEXTO('x'));
    await sse(ag, '/api/revisao-qualidade');
    OpenAI.__reset();
    process.env.AVALIACAO_MAX_TOKENS_ENTRADA = '3600';
    OpenAI.__setResponder((params) => /Analise o módulo/.test(params.messages[1].content)
      ? `Análise do módulo: ${params.messages[1].content.includes('SENTINELA-FINAL-A') ? 'FUNDAMENTOS' : 'WEB'}`
      : 'Relatório final.');

    const eventos = await sse(ag, '/api/qualidade');

    expect(eventos.find(e => e.type === 'done')).toBeDefined();
    const calls = chatCalls();
    const modulos = calls.filter(c => /Analise o módulo/.test(promptDe(c)));
    expect(modulos).toHaveLength(2);
    expect(promptDe(modulos[0])).toContain('módulo "Fundamentos"');
    expect(promptDe(modulos[0])).toContain('SENTINELA-FINAL-A'); // conteúdo integral do módulo
    expect(promptDe(modulos[0])).not.toContain('SENTINELA-FINAL-B');
    expect(promptDe(modulos[1])).toContain('SENTINELA-FINAL-B');
    const final = calls[calls.length - 1];
    expect(promptDe(final)).toContain('## Análise por Módulo');
    expect(promptDe(final)).toContain('Análise do módulo: FUNDAMENTOS');
    expect(promptDe(final)).toContain('Análise do módulo: WEB');
    expect(promptDe(final)).toContain('## Notas de Qualidade por Aula');
    expect(eventos.some(e => e.type === 'progress' && /Analisando o módulo 1 de 2/.test(e.message))).toBe(true);
  });

  test('módulo grande demais entra como resumo de TODAS as seções (nunca o início do texto)', async () => {
    const ag = await sessaoComConteudo();
    process.env.AVALIACAO_MAX_TOKENS_ENTRADA = '2500';
    OpenAI.__setResponder((params) => /Analise o módulo/.test(params.messages[1].content) ? 'Análise.' : 'Relatório final.');

    await sse(ag, '/api/qualidade');

    const modulo = chatCalls().find(c => /Analise o módulo/.test(promptDe(c)));
    const p = promptDe(modulo);
    expect(p).toContain('- Variáveis A');
    expect(p).toContain('- Funções A');
    expect(p).toContain('- Síntese');
    expect(p).toContain('Fechamento. SENTINELA-FINAL-A'); // a última seção está no resumo
  });
});

describe('PPC com o conteúdo integral', () => {
  async function comPlanos(ag) {
    await ag.post('/api/importar/confirmar').send({ stage: 'plano_de_ensino', texto: `${palavras(500)}\n\nFIM-PLANO-ENSINO` });
    await ag.post('/api/importar/confirmar').send({ stage: 'plano_de_aula', texto: `# Aula 1: Variáveis\n\n${palavras(400)}\n\n# Aula 2: Requisições HTTP\n\n${palavras(300)}\n\nFIM-PLANO-AULA` });
  }

  test('infraestrutura recebe o conteúdo inteiro e a montagem recebe o plano de ensino completo', async () => {
    const ag = await sessaoComConteudo();
    await comPlanos(ag);
    OpenAI.__setResponse('Texto do PPC.');

    const eventos = await sse(ag, '/api/ppc');

    expect(eventos.find(e => e.type === 'done')).toBeDefined();
    const calls = chatCalls();
    const infra = calls.find(c => /Liste os recursos e a infraestrutura/.test(promptDe(c)));
    expect(promptDe(infra)).toContain('SENTINELA-FINAL-A');
    expect(promptDe(infra)).toContain('SENTINELA-FINAL-B');
    const montagem = calls.find(c => /Monte o Projeto Pedagógico de Curso/.test(promptDe(c)));
    expect(promptDe(montagem)).toContain('FIM-PLANO-ENSINO'); // plano de ensino inteiro (antes: 2.000 caracteres)
  });

  test('conteúdo que não cabe: infraestrutura recebe o resumo por aula + recursos de todas as seções (map por aula)', async () => {
    const ag = await sessaoComConteudo();
    process.env.AVALIACAO_MAX_TOKENS_ENTRADA = '3500';
    OpenAI.__setResponder((params) => params.response_format
      ? JSON.stringify({ resumo: 'Resumo da aula.', recursos: ['Node.js', 'VS Code', 'Node.js'] })
      : 'Texto do PPC.');

    const eventos = await sse(ag, '/api/ppc');

    expect(eventos.find(e => e.type === 'done')).toBeDefined();
    const calls = chatCalls();
    const extracoes = calls.filter(ehJson);
    expect(extracoes).toHaveLength(2); // uma por aula
    expect(promptDe(extracoes[0])).toContain('SENTINELA-FINAL-A'); // a aula inteira é lida
    const infra = calls.find(c => /Liste os recursos e a infraestrutura/.test(promptDe(c)));
    expect(promptDe(infra)).toContain('Resumo por aula:');
    expect(promptDe(infra)).toContain('Aula 2 — Requisições HTTP: Resumo da aula.');
    expect(promptDe(infra)).toContain('Recursos mencionados em todas as seções de todas as aulas');
    expect((promptDe(infra).match(/- Node\.js/g) || [])).toHaveLength(1); // deduplicado
    expect(promptDe(infra)).toContain('- VS Code');
  });
});

describe('componente determinístico de fundamentação', () => {
  const aula = { titulo: 'Aula', objetivos: 'declarar variáveis' };
  const texto = '## Fundamentação técnica\n\n## Exemplos práticos\n\n## Erros comuns\n\n## Síntese\n\ndeclarar variáveis';

  test('sem pesquisa web (null) o determinístico é exatamente o de antes — média de 3 componentes', () => {
    const r = app.computeScoreDeterministico(texto, aula, 0, null);
    const { cobertura, penalidadeSobreposicao, completudeEstrutural } = r.componentes;
    expect(r.componentes.fundamentacao).toBeUndefined();
    expect(r.determ).toBeCloseTo((cobertura + penalidadeSobreposicao + completudeEstrutural) / 3, 10);
    expect(app.computeScoreDeterministico(texto, aula, 0).determ).toBe(r.determ);
  });

  test('com pesquisa web entra como 4º componente da média, sem mexer na fórmula-base (peso 30% do determinístico)', () => {
    const sem = app.computeScoreDeterministico(texto, aula, 0, null);
    const bom = app.computeScoreDeterministico(texto, aula, 0, 1);
    const ruim = app.computeScoreDeterministico(texto, aula, 0, 0);
    expect(bom.componentes.fundamentacao).toBe(1);
    const { cobertura, penalidadeSobreposicao, completudeEstrutural } = bom.componentes;
    expect(bom.determ).toBeCloseTo((cobertura + penalidadeSobreposicao + completudeEstrutural + 1) / 4, 10);
    expect(ruim.determ).toBeLessThan(sem.determ);
    expect(bom.determ).toBeGreaterThanOrEqual(sem.determ);
    // a nota composta continua 0,7 × rubrica + 0,3 × determinístico
    const rubrica = { planoAula: 10, planoEnsinoEmenta: 10, nivelPublicoModalidade: 10, qualidadeDidatica: 10, clarezaEstrutura: 10 };
    expect(app.computeScoreComposto(rubrica, 0.5).score).toBeCloseTo(0.7 * 1 + 0.3 * 0.5, 10);
  });

  test('revisão com pesquisa em web inclui o pedido de conferir se as fontes sustentam o texto', async () => {
    const ag = await sessaoComConteudo();
    fs.writeFileSync(path.join(SCR, 'pesquisa_modulos.json'), JSON.stringify({
      status: 'web', fonte: 'ia', completo: true, pulada: false,
      modulos: [{ id: 'm1', titulo: 'Fundamentos', aulas: [0], status: 'ok' }, { id: 'm2', titulo: 'Web', aulas: [1], status: 'ok' }],
      consultas: [], fontes: [
        { id: 'f1', url: 'https://a.com/1', titulo: 'Fonte A', dominio: 'a.com', moduloId: 'm1' },
        { id: 'f2', url: 'https://b.com/2', titulo: 'Fonte B', dominio: 'b.com', moduloId: 'm2' }
      ],
      achados: [{ moduloId: 'm1', tema: 'Fundamentos', resumo: 'variáveis', fonteIds: ['f1', 'f2'] }, { moduloId: 'm2', tema: 'Web', resumo: 'fetch', fonteIds: ['f2'] }]
    }), 'utf-8');
    OpenAI.__setResponder(() => REVISAO_TEXTO('x'));

    await sse(ag, '/api/revisao-qualidade');

    const p = promptDe(chatCalls()[0]);
    expect(p).toContain('## Fontes e achados da pesquisa');
    expect(p).toContain('### Alertas de Citação');
    expect(p).toContain('realmente sustentam o texto de cada seção');
  });
});
