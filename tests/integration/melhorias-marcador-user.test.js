'use strict';

// Cobre o ciclo completo de upload -> confirmação para o marcador [user] e a
// restrição de processar só aulas listadas na seção "Melhorias a serem
// Aplicadas" (ver openspec/changes/marcador-user-forca-aplicacao-e-filtro-
// aulas-listadas). `mammoth` é mockado para devolver texto controlado sem
// depender de um .docx real — o mesmo padrão de simplicidade já adotado por
// tests/integration/sse.test.js para o upload multipart.
jest.mock('openai');
jest.mock('mammoth');

const request = require('supertest');
const OpenAI = require('openai');
const mammoth = require('mammoth');
const os = require('os');
const path = require('path');
const app = require('../../server');

const VALID_CONFIG = {
  nome: 'Curso de Node.js',
  publico: 'Desenvolvedores júnior',
  carga: '2',
  duracao: '60',
  nivel: 'intermediario',
  objetivos: 'Aprender Node.js',
  modalidade: 'online',
  proporcaoTeoricoPratico: '40% teórico / 60% prático',
  preRequisitos: '',
  pastaProjeto: path.join(os.tmpdir(), 'gerador-conteudo-tests', 'curso-marcador-user')
};

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
});

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

function agent() { return request.agent(app); }

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

// 2 aulas (carga=2h/duracao=60min) — populadas via /api/conteudo, com a
// segunda gerada por uma segunda chamada ao mock da OpenAI.
async function setupCursoComDuasAulas(ag) {
  await ag.post('/api/config').send(VALID_CONFIG);
  OpenAI.__setResponses([
    JSON.stringify({ aulas: [
      { titulo: 'Aula Introdução', modulo: 'Módulo 1', objetivos: 'Introduzir o tema' },
      { titulo: 'Aula Avançada', modulo: 'Módulo 1', objetivos: 'Aprofundar o tema' }
    ] }),
    'Plano detalhado gerado a partir do JSON.'
  ]);
  await collectSSE(ag, '/api/plano-aula');

  OpenAI.__setResponses([
    'Conteúdo original da Aula 1, com parágrafos regulares para teste.',
    'Conteúdo original da Aula 2, com parágrafos regulares para teste.'
  ]);
  await collectSSE(ag, '/api/conteudo');
}

async function upload(ag, textoExtraido) {
  mammoth.extractRawText.mockResolvedValue({ value: textoExtraido });
  return ag
    .post('/api/aplicar-melhorias')
    .attach('arquivo', Buffer.from('conteudo fake'), 'revisao.docx');
}

describe('Marcador [user] e restrição a aulas listadas — ciclo de melhorias', () => {
  test('aula ausente da seção estruturada é pulada sem chamada de julgamento de score', async () => {
    const ag = agent();
    await setupCursoComDuasAulas(ag);

    // Só a Aula 1 consta na seção; Aula 2 não é mencionada.
    const textoExtraido =
      'Melhorias a serem Aplicadas\n\nAula 01\nAdicionar um exemplo prático\n[user]\n\n';
    const uploadRes = await upload(ag, textoExtraido);
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.modoLegado).toBe(false);

    // 1ª chamada: patch da Aula 1. 2ª chamada: julgamento de score da Aula 1.
    // Se a Aula 2 fosse processada, o mock seria consumido nessa ordem e uma
    // 3ª resposta seria necessária — sua ausência faria a chamada da Aula 2
    // reusar a última resposta configurada (o julgamento), o que quebraria o
    // parse de `### Melhorias Aplicadas` e emitiria `warning` de truncamento.
    OpenAI.__setResponses([
      'Conteúdo revisado da Aula 1 com exemplo prático incluído.\n\n### Melhorias Aplicadas\n- Exemplo prático adicionado (item 1).',
      JSON.stringify({ original: { nota: 0.7 }, candidato: { nota: 0.9 } })
    ]);

    const res = await collectSSE(ag, '/api/aplicar-melhorias/confirmar');
    const events = parseSSE(res.body);
    const types = events.map(e => e.type);

    expect(types).not.toContain('error');
    expect(types).toContain('done');

    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent.fullText).toContain('Conteúdo original da Aula 2');

    const progressoAula2 = events.find(e =>
      e.type === 'progress' && /Aula 2.*sem melhorias na seção/i.test(e.message || '')
    );
    expect(progressoAula2).toBeDefined();

    // 3 chamadas da Aula 1 (patch + julgamento de score + realinhamento do
    // plano, disparado porque o conteúdo mudou o suficiente); nenhuma chamada
    // adicional para a Aula 2, que foi pulada integralmente.
    expect(OpenAI.__getMock().mock.calls.length).toBe(3);
  }, 15000);

  test('item após [user] força aceitação sem chamar o julgamento pareado de score', async () => {
    const ag = agent();
    await setupCursoComDuasAulas(ag);

    // Aula 1 tem um item forçado por [user]; Aula 2 não consta na seção.
    const textoExtraido =
      'Melhorias a serem Aplicadas\n\n' +
      'Aula 01\n[user]\nAplicar mudança específica pedida pelo revisor\n\n';
    const uploadRes = await upload(ag, textoExtraido);
    expect(uploadRes.status).toBe(200);

    // Única resposta na fila: o patch da Aula 1. Se o gate de score chamasse
    // o julgamento pareado, a chamada reusaria essa mesma resposta (texto
    // livre, não-JSON) — o parse de score falharia e `aceita` cairia para
    // `false` no catch, rejeitando o candidato. Como a aula é forçada, a
    // rejeição não deve acontecer: o teste falha se o comportamento antigo
    // (chamar o julgamento) for reintroduzido.
    OpenAI.__setResponses([
      'Conteúdo revisado da Aula 1 com a mudança pedida pelo revisor.\n\n### Melhorias Aplicadas\n- Mudança aplicada (item 1).'
    ]);

    const res = await collectSSE(ag, '/api/aplicar-melhorias/confirmar');
    const events = parseSSE(res.body);
    const types = events.map(e => e.type);

    expect(types).not.toContain('error');
    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent.fullText).toContain('mudança pedida pelo revisor');
    expect(doneEvent.fullText).not.toContain('score não melhorou');
    expect(doneEvent.fullText).not.toContain('melhorias descartadas');

    // 2 chamadas da Aula 1 (patch + realinhamento do plano); nenhuma chamada
    // de julgamento de score (bypass) e nenhuma chamada para a Aula 2 (fora
    // da seção).
    expect(OpenAI.__getMock().mock.calls.length).toBe(2);
  }, 15000);
});
