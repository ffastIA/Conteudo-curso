'use strict';

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Encolhe a cadência do polling do HeyGen antes de carregar o server (as
// constantes HEYGEN_POLL_* são lidas do env na carga do módulo) — mesmo
// motivo/padrão já usado em tests/integration/slides-gamma.test.js para o Gamma.
process.env.HEYGEN_POLL_INTERVAL_MS = '20';
process.env.HEYGEN_POLL_TIMEOUT_MS = '300';
// Este arquivo testa o baseline "sem filtro" (todos os avatares/vozes do
// workspace) — precisa forçar essas variáveis vazias aqui, senão um
// HEYGEN_AVATAR_IDS/HEYGEN_VOICE_IDS real no .env do desenvolvedor (dotenv
// não sobrescreve process.env já definido, mas preenche o que estiver
// ausente) vazaria para os testes e quebraria o baseline. Ver
// tests/integration/heygen-avatares-vozes-filtro-env.test.js para o caso filtrado.
process.env.HEYGEN_AVATAR_IDS = '';
process.env.HEYGEN_VOICE_IDS = '';

const app = require('../../server');

function baseConfig(pastaProjeto) {
  return {
    nome: 'Curso de Vídeo com Avatar',
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

afterEach(() => {
  delete global.fetch;
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

// Popula sess.conteudoPorAula com N aulas via GET /api/conteudo — mesmo
// helper usado em tests/integration/slides-gamma.test.js.
async function configurarCursoComConteudo(ag, aulas) {
  const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-video-avatar-'));
  await ag.post('/api/config').send(baseConfig(pastaProjeto));
  OpenAI.__setResponses([JSON.stringify({ aulas })]);
  await collectSSE(ag, '/api/conteudo');
  return pastaProjeto;
}

function configHeygenPayload(overrides = {}) {
  return {
    avatarId: 'av_123',
    avatarName: 'Ana',
    avatarType: 'studio_avatar',
    voiceId: 'voice_123',
    voiceName: 'Voz Ana',
    expressiveness: null,
    motionPrompt: '',
    ...overrides
  };
}

async function configurarHeygen(ag, overrides = {}) {
  await ag.post('/api/heygen/config').send(configHeygenPayload(overrides));
}

// Mock de fetch global para os endpoints do HeyGen usados por
// GET /api/heygen/avatares e GET /api/heygen/vozes (listagem, sem geração).
// Avatares: GET /v2/avatar_group.list devolve os grupos próprios do usuário;
// GET /v2/avatar_group/{id}/avatars devolve os looks de cada grupo (roteado
// por id extraído da URL) — sem paginação, mesmo contrato usado por
// listarAvataresHeygen(). Vozes: cada lista é dada como array de "páginas"
// (arrays de itens), simulando has_more/next_token — mais de uma página =
// o sistema deve seguir a paginação até a última. Roteadas por
// type=public/type=private na própria URL, já que listarVozesHeygen faz
// duas chamadas distintas quando o caller não especifica `type`.
function installHeygenListFetchMock({
  grupos = [{ id: 'grupo_1', name: 'Ana', group_type: 'STUDIO' }],
  looksPorGrupo = { grupo_1: [{ id: 'av_1', name: 'Ana', image_url: 'https://x/av1.png' }] },
  vozesPublicasPaginas = [[{ voice_id: 'v_1', name: 'Voz Ana', language: 'pt-BR' }]],
  vozesPrivadasPaginas = [[]],
  failListagem = false
} = {}) {
  const calls = [];
  const paginaAtual = { publicas: 0, privadas: 0 };

  function proximaPagina(chave, paginas) {
    const idx = paginaAtual[chave];
    paginaAtual[chave] += 1;
    const itens = paginas[idx] || [];
    const hasMore = idx < paginas.length - 1;
    return { data: itens, has_more: hasMore, next_token: hasMore ? `token_${chave}_${idx + 1}` : undefined };
  }

  global.fetch = jest.fn(async (url) => {
    const urlStr = String(url);
    calls.push({ url: urlStr });
    if (failListagem) return { ok: false, status: 401, text: async () => 'chave inválida' };
    if (urlStr.includes('/v2/avatar_group.list')) {
      return { ok: true, status: 200, json: async () => ({ error: null, data: { total_count: grupos.length, avatar_group_list: grupos } }) };
    }
    const matchGrupo = urlStr.match(/\/v2\/avatar_group\/([^/?]+)\/avatars/);
    if (matchGrupo) {
      const avatarList = looksPorGrupo[matchGrupo[1]] || [];
      return { ok: true, status: 200, json: async () => ({ error: null, data: { avatar_list: avatarList } }) };
    }
    if (urlStr.includes('/v3/voices')) {
      const isPrivada = urlStr.includes('type=private');
      return {
        ok: true,
        status: 200,
        json: async () => isPrivada
          ? proximaPagina('privadas', vozesPrivadasPaginas)
          : proximaPagina('publicas', vozesPublicasPaginas)
      };
    }
    return { ok: false, status: 404, text: async () => 'not found' };
  });
  return calls;
}

// Mock de fetch global simulando o fluxo de geração de vídeo do HeyGen:
// POST /v3/videos -> GET /v3/videos/{id} (poll) -> GET <video_url> (download).
function installHeygenVideoFetchMock({
  outcome = 'completed',
  pendingRounds = 0,
  failMessage = 'Falha simulada no HeyGen',
  httpFailStage = null,
  httpFailStatus = 500
} = {}) {
  const calls = [];
  let pollCount = 0;
  const respostaNaoOk = { ok: false, status: httpFailStatus, text: async () => 'detalhe do erro' };

  global.fetch = jest.fn(async (url, options = {}) => {
    const urlStr = String(url);
    calls.push({ url: urlStr, options });

    if (urlStr.endsWith('/v3/videos') && options.method === 'POST') {
      if (httpFailStage === 'criacao') return respostaNaoOk;
      return { ok: true, status: 200, json: async () => ({ data: { video_id: 'vid-abc123', status: 'waiting' } }) };
    }

    if (/\/v3\/videos\/[^/]+$/.test(urlStr)) {
      pollCount += 1;
      if (httpFailStage === 'poll') return respostaNaoOk;
      if (pollCount <= pendingRounds) {
        return { ok: true, status: 200, json: async () => ({ data: { status: 'processing' } }) };
      }
      if (outcome === 'failed') {
        return { ok: true, status: 200, json: async () => ({ data: { status: 'failed', error: { message: failMessage } } }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { status: 'completed', video_url: 'https://heygen-video.example.com/fake.mp4' } })
      };
    }

    // Download do video_url
    if (httpFailStage === 'download') return respostaNaoOk;
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('MP4-FAKE-BYTES') };
  });
  return calls;
}

function contarPollsVideo(calls) {
  return calls.filter(c => /\/v3\/videos\/[^/]+$/.test(c.url)).length;
}

describe('GET /api/heygen/avatares e /api/heygen/vozes', () => {
  test('lista avatares do workspace', async () => {
    const ag = agent();
    installHeygenListFetchMock();
    const res = await ag.get('/api/heygen/avatares');
    expect(res.status).toBe(200);
    expect(res.body.avatares).toEqual([
      { id: 'av_1', name: 'Ana', avatar_type: 'studio_avatar', preview_image_url: 'https://x/av1.png' }
    ]);
  });

  test('não chama GET /v3/avatars/looks (catálogo público) para listar avatares', async () => {
    const ag = agent();
    const calls = installHeygenListFetchMock();
    await ag.get('/api/heygen/avatares');
    expect(calls.some(c => c.url.includes('/v3/avatars/looks'))).toBe(false);
    expect(calls.some(c => c.url.includes('/v2/avatar_group.list'))).toBe(true);
  });

  test('lista vozes do workspace, repassando filtros de query', async () => {
    const ag = agent();
    const calls = installHeygenListFetchMock();
    const res = await ag.get('/api/heygen/vozes?type=public&language=Portuguese');
    expect(res.status).toBe(200);
    expect(res.body.vozes).toEqual([{ voice_id: 'v_1', name: 'Voz Ana', language: 'pt-BR' }]);
    const chamada = calls.find(c => c.url.includes('/v3/voices'));
    expect(chamada.url).toContain('type=public');
    expect(chamada.url).toContain('language=Portuguese');
  });

  test('sem query, filtra vozes por português por padrão', async () => {
    const ag = agent();
    const calls = installHeygenListFetchMock();
    const res = await ag.get('/api/heygen/vozes');
    expect(res.status).toBe(200);
    const chamada = calls.find(c => c.url.includes('/v3/voices'));
    expect(chamada.url).toContain('language=Portuguese');
  });

  test('language explícito na query sobrepõe o padrão de português', async () => {
    const ag = agent();
    const calls = installHeygenListFetchMock();
    const res = await ag.get('/api/heygen/vozes?language=English');
    expect(res.status).toBe(200);
    const chamada = calls.find(c => c.url.includes('/v3/voices'));
    expect(chamada.url).toContain('language=English');
    expect(chamada.url).not.toContain('language=Portuguese');
  });

  test('erro do HeyGen ao listar retorna 500', async () => {
    const ag = agent();
    installHeygenListFetchMock({ failListagem: true });
    const res = await ag.get('/api/heygen/avatares');
    expect(res.status).toBe(500);
  });

  test('combina os looks de múltiplos grupos de avatar do usuário', async () => {
    const ag = agent();
    installHeygenListFetchMock({
      grupos: [
        { id: 'grupo_1', name: 'Ana', group_type: 'STUDIO' },
        { id: 'grupo_2', name: 'Bruno', group_type: 'PHOTO' }
      ],
      looksPorGrupo: {
        grupo_1: [{ id: 'av_1', name: 'Ana', image_url: 'https://x/av1.png' }],
        grupo_2: [{ id: 'av_2', name: 'Bruno', image_url: 'https://x/av2.png' }]
      }
    });
    const res = await ag.get('/api/heygen/avatares');
    expect(res.status).toBe(200);
    expect(res.body.avatares).toEqual([
      { id: 'av_1', name: 'Ana', avatar_type: 'studio_avatar', preview_image_url: 'https://x/av1.png' },
      { id: 'av_2', name: 'Bruno', avatar_type: 'photo_avatar', preview_image_url: 'https://x/av2.png' }
    ]);
  });

  test('sem type, combina vozes públicas e privadas do workspace', async () => {
    const ag = agent();
    installHeygenListFetchMock({
      vozesPublicasPaginas: [[{ voice_id: 'v_pub', name: 'Voz Pública', language: 'pt-BR' }]],
      vozesPrivadasPaginas: [[{ voice_id: 'v_priv', name: 'Voz Clonada', language: 'unknown' }]]
    });
    const res = await ag.get('/api/heygen/vozes');
    expect(res.status).toBe(200);
    expect(res.body.vozes).toEqual([
      { voice_id: 'v_priv', name: 'Voz Clonada', language: 'unknown' },
      { voice_id: 'v_pub', name: 'Voz Pública', language: 'pt-BR' }
    ]);
  });

  test('busca de vozes privadas não envia filtro de idioma, públicas envia', async () => {
    const ag = agent();
    const calls = installHeygenListFetchMock();
    await ag.get('/api/heygen/vozes');
    const chamadaPublica = calls.find(c => c.url.includes('/v3/voices') && c.url.includes('type=public'));
    const chamadaPrivada = calls.find(c => c.url.includes('/v3/voices') && c.url.includes('type=private'));
    expect(chamadaPublica).toBeDefined();
    expect(chamadaPrivada).toBeDefined();
    expect(chamadaPublica.url).toContain('language=Portuguese');
    expect(chamadaPrivada.url).not.toContain('language=');
  });

  test('type explícito na query não dispara a busca do outro tipo', async () => {
    const ag = agent();
    const calls = installHeygenListFetchMock();
    const res = await ag.get('/api/heygen/vozes?type=public');
    expect(res.status).toBe(200);
    expect(calls.some(c => c.url.includes('type=private'))).toBe(false);
  });
});

describe('POST /api/heygen/config', () => {
  test('sem avatarId ou voiceId retorna 400', async () => {
    const ag = agent();
    const res = await ag.post('/api/heygen/config').send({ avatarName: 'Ana' });
    expect(res.status).toBe(400);
  });

  test('config válida retorna 200', async () => {
    const ag = agent();
    const res = await ag.post('/api/heygen/config').send(configHeygenPayload());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

describe('GET /api/video-avatar/parametros', () => {
  test('sem Etapa 5 concluída retorna 400', async () => {
    const ag = agent();
    const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-video-avatar-'));
    await ag.post('/api/config').send(baseConfig(pastaProjeto));

    const res = await ag.get('/api/video-avatar/parametros?index=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Etapa 5/);
  });

  test('sem configuração do HeyGen retorna 400', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);

    const res = await ag.get('/api/video-avatar/parametros?index=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/avatar|voz/i);
  });

  test('índice fora do intervalo retorna 400', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    await configurarHeygen(ag);

    const res = await ag.get('/api/video-avatar/parametros?index=5');
    expect(res.status).toBe(400);
  });

  test('devolve metadados e duracaoPadrao inicial 30', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [
      { titulo: 'Memórias RAM e ROM', modulo: '', objetivos: 'Definir RAM e ROM' }
    ]);
    await configurarHeygen(ag);

    const res = await ag.get('/api/video-avatar/parametros?index=0');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      index: 0, numero: '01', total: 1, titulo: 'Memórias RAM e ROM', duracaoPadrao: 30
    });
  });
});

describe('POST /api/video-avatar/parametros', () => {
  test.each([0, 1000, 4.5, 'x', null, undefined])('segundos inválido (%p) retorna 400', async (segundos) => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    const res = await ag.post('/api/video-avatar/parametros').send({ index: 0, segundos });
    expect(res.status).toBe(400);
  });

  test('segundos válido retorna 200', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    const res = await ag.post('/api/video-avatar/parametros').send({ index: 0, segundos: 45 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

describe('GET /api/video-avatar/roteiro/gerar', () => {
  test('sem duração aprovada emite evento SSE error', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    const res = await collectSSE(ag, '/api/video-avatar/roteiro/gerar');
    const events = parseSSE(res.body);
    expect(events.some(e => e.type === 'error')).toBe(true);
  });

  test('gera e persiste roteiroAvatar01.txt/.docx, atualiza duracaoAvatarDefault', async () => {
    const ag = agent();
    const pastaProjeto = await configurarCursoComConteudo(ag, [
      { titulo: 'Memórias RAM e ROM', modulo: '', objetivos: 'Definir RAM e ROM' }
    ]);
    await configurarHeygen(ag);
    await ag.post('/api/video-avatar/parametros').send({ index: 0, segundos: 40 });

    OpenAI.__setResponse('Texto de fala gerado para a aula.');
    const res = await collectSSE(ag, '/api/video-avatar/roteiro/gerar');
    const events = parseSSE(res.body);
    const done = events.find(e => e.type === 'done');

    expect(done).toBeDefined();
    expect(done.baseName).toBe('roteiroAvatar01');
    expect(fs.existsSync(path.join(pastaProjeto, 'scr', 'roteiroAvatar01.txt'))).toBe(true);
    expect(fs.existsSync(path.join(pastaProjeto, 'roteiroAvatar01.docx'))).toBe(true);

    // Sticky: a próxima chamada de parâmetros já vem com a duração usada.
    const parametros = await ag.get('/api/video-avatar/parametros?index=0');
    expect(parametros.body.duracaoPadrao).toBe(40);
  });
});

describe('GET /api/video-avatar/gerar', () => {
  test('sem configuração do HeyGen emite evento SSE error', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    const res = await collectSSE(ag, '/api/video-avatar/gerar?index=0');
    const events = parseSSE(res.body);
    expect(events.some(e => e.type === 'error')).toBe(true);
  });

  test('sem roteiro de avatar confirmado emite evento SSE error', async () => {
    const ag = agent();
    await configurarCursoComConteudo(ag, [{ titulo: 'Aula única', modulo: '', objetivos: 'Obj' }]);
    await configurarHeygen(ag);
    const res = await collectSSE(ag, '/api/video-avatar/gerar?index=0');
    const events = parseSSE(res.body);
    const erro = events.find(e => e.type === 'error');
    expect(erro).toBeDefined();
    expect(erro.message).toMatch(/roteiro/i);
  });

  async function prepararAulaComRoteiroAvatarConfirmado(ag, { avatarType = 'studio_avatar', expressiveness = null, motionPrompt = '' } = {}) {
    const pastaProjeto = await configurarCursoComConteudo(ag, [
      { titulo: 'Aula única', modulo: '', objetivos: 'Objetivo único' }
    ]);
    await configurarHeygen(ag, { avatarType, expressiveness, motionPrompt });
    await ag.post('/api/video-avatar/parametros').send({ index: 0, segundos: 30 });
    OpenAI.__setResponse('Texto de fala gerado para a aula.');
    await collectSSE(ag, '/api/video-avatar/roteiro/gerar');
    return pastaProjeto;
  }

  test('gera o vídeo, baixa o .mp4 em videos/ (criada sob demanda) e registra o evento done', async () => {
    const ag = agent();
    const pastaProjeto = await prepararAulaComRoteiroAvatarConfirmado(ag);

    expect(fs.existsSync(path.join(pastaProjeto, 'videos'))).toBe(false);

    const calls = installHeygenVideoFetchMock({ outcome: 'completed' });
    const res = await collectSSE(ag, '/api/video-avatar/gerar?index=0');
    const events = parseSSE(res.body);
    const done = events.find(e => e.type === 'done');

    expect(done).toBeDefined();
    expect(done.numero).toBe('01');
    expect(fs.existsSync(path.join(pastaProjeto, 'videos', 'aula01_video.mp4'))).toBe(true);

    const criacao = calls.find(c => c.url.endsWith('/v3/videos') && c.options.method === 'POST');
    const payload = JSON.parse(criacao.options.body);
    expect(payload.type).toBe('avatar');
    expect(payload.avatar_id).toBe('av_123');
    expect(payload.voice_id).toBe('voice_123');
    // O mock de streaming do OpenAI (tests/__mocks__/openai.js) acrescenta um
    // espaço após cada palavra — mesmo comportamento observado nos demais
    // testes de streaming do projeto.
    expect(payload.script.trim()).toBe('Texto de fala gerado para a aula.');
    expect(payload.aspect_ratio).toBe('16:9');
    // avatarType = studio_avatar (padrão do helper) — expressiveness não deve ir, mesmo se setado.
    expect(payload).not.toHaveProperty('expressiveness');
    expect(payload).not.toHaveProperty('motion_prompt');
  });

  test('inclui expressiveness só quando avatarType é photo_avatar', async () => {
    const ag = agent();
    await prepararAulaComRoteiroAvatarConfirmado(ag, { avatarType: 'photo_avatar', expressiveness: 'high' });

    const calls = installHeygenVideoFetchMock({ outcome: 'completed' });
    await collectSSE(ag, '/api/video-avatar/gerar?index=0');

    const criacao = calls.find(c => c.url.endsWith('/v3/videos') && c.options.method === 'POST');
    const payload = JSON.parse(criacao.options.body);
    expect(payload.expressiveness).toBe('high');
  });

  test('inclui motion_prompt quando configurado', async () => {
    const ag = agent();
    await prepararAulaComRoteiroAvatarConfirmado(ag, { motionPrompt: 'gestos calmos' });

    const calls = installHeygenVideoFetchMock({ outcome: 'completed' });
    await collectSSE(ag, '/api/video-avatar/gerar?index=0');

    const criacao = calls.find(c => c.url.endsWith('/v3/videos') && c.options.method === 'POST');
    const payload = JSON.parse(criacao.options.body);
    expect(payload.motion_prompt).toBe('gestos calmos');
  });

  test('status pending: continua o polling até completed e só então persiste', async () => {
    const ag = agent();
    const pastaProjeto = await prepararAulaComRoteiroAvatarConfirmado(ag);

    const calls = installHeygenVideoFetchMock({ outcome: 'completed', pendingRounds: 2 });
    const res = await collectSSE(ag, '/api/video-avatar/gerar?index=0');
    const events = parseSSE(res.body);

    expect(events.find(e => e.type === 'done')).toBeDefined();
    expect(contarPollsVideo(calls)).toBe(3);
    expect(fs.existsSync(path.join(pastaProjeto, 'videos', 'aula01_video.mp4'))).toBe(true);
  });

  test('falha do HeyGen emite evento error e não persiste arquivo nem registra o vídeo', async () => {
    const ag = agent();
    const pastaProjeto = await prepararAulaComRoteiroAvatarConfirmado(ag);

    installHeygenVideoFetchMock({ outcome: 'failed' });
    const res = await collectSSE(ag, '/api/video-avatar/gerar?index=0');
    const events = parseSSE(res.body);

    expect(events.some(e => e.type === 'error')).toBe(true);
    expect(events.some(e => e.type === 'done')).toBe(false);
    expect(fs.existsSync(path.join(pastaProjeto, 'videos'))).toBe(false);
  });

  test('geração que nunca conclui estoura o tempo limite e não persiste arquivo', async () => {
    const ag = agent();
    const pastaProjeto = await prepararAulaComRoteiroAvatarConfirmado(ag);

    const calls = installHeygenVideoFetchMock({ pendingRounds: Infinity });
    const res = await collectSSE(ag, '/api/video-avatar/gerar?index=0');
    const events = parseSSE(res.body);
    const erro = events.find(e => e.type === 'error');

    expect(erro).toBeDefined();
    expect(erro.message).toMatch(/[Tt]empo limite/);
    expect(contarPollsVideo(calls)).toBeGreaterThan(1);
    expect(fs.existsSync(path.join(pastaProjeto, 'videos'))).toBe(false);
  });

  test('status não-ok ao criar o vídeo emite error e não persiste arquivo', async () => {
    const ag = agent();
    const pastaProjeto = await prepararAulaComRoteiroAvatarConfirmado(ag);

    installHeygenVideoFetchMock({ httpFailStage: 'criacao', httpFailStatus: 401 });
    const res = await collectSSE(ag, '/api/video-avatar/gerar?index=0');
    const erro = parseSSE(res.body).find(e => e.type === 'error');

    expect(erro).toBeDefined();
    expect(erro.message).toMatch(/401/);
    expect(fs.existsSync(path.join(pastaProjeto, 'videos'))).toBe(false);
  });
});
