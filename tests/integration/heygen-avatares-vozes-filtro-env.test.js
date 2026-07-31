'use strict';

jest.mock('openai');

// HEYGEN_AVATAR_IDS/HEYGEN_VOICE_IDS são lidas do env na carga do módulo —
// precisam ser definidas ANTES do require('../../server'), mesmo padrão já
// usado em tests/integration/video-avatar.test.js para HEYGEN_POLL_*.
process.env.HEYGEN_AVATAR_IDS = 'av_1, av_3';
process.env.HEYGEN_VOICE_IDS = 'v_2';

const request = require('supertest');

const app = require('../../server');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

afterEach(() => {
  delete global.fetch;
});

function agent() {
  return request.agent(app);
}

// Mesmo mock de fetch usado em video-avatar.test.js para os endpoints de
// listagem do HeyGen, com um workspace maior para exercitar o filtro.
// Avatares: dois grupos próprios do usuário (STUDIO com av_1/av_2, PHOTO com
// av_3) — listarAvataresHeygen busca GET /v2/avatar_group.list e depois
// GET /v2/avatar_group/{id}/avatars por grupo, nunca /v3/avatars/looks.
function installHeygenListFetchMock({
  grupos = [
    { id: 'g_studio', name: 'Grupo Studio', group_type: 'STUDIO' },
    { id: 'g_photo', name: 'Grupo Photo', group_type: 'PHOTO' }
  ],
  looksPorGrupo = {
    g_studio: [
      { id: 'av_1', name: 'Ana', image_url: 'https://x/av1.png' },
      { id: 'av_2', name: 'Bruno', image_url: 'https://x/av2.png' }
    ],
    g_photo: [
      { id: 'av_3', name: 'Carla', image_url: 'https://x/av3.png' }
    ]
  },
  vozes = [
    { voice_id: 'v_1', name: 'Voz Ana', language: 'pt-BR' },
    { voice_id: 'v_2', name: 'Voz Bruno', language: 'pt-BR' },
    { voice_id: 'v_3', name: 'Voz Carla', language: 'pt-BR' }
  ]
} = {}) {
  global.fetch = jest.fn(async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/v2/avatar_group.list')) {
      return { ok: true, status: 200, json: async () => ({ error: null, data: { total_count: grupos.length, avatar_group_list: grupos } }) };
    }
    const matchGrupo = urlStr.match(/\/v2\/avatar_group\/([^/?]+)\/avatars/);
    if (matchGrupo) {
      const avatarList = looksPorGrupo[matchGrupo[1]] || [];
      return { ok: true, status: 200, json: async () => ({ error: null, data: { avatar_list: avatarList } }) };
    }
    if (urlStr.includes('/v3/voices')) {
      // listarVozesHeygen busca type=public e type=private separadamente
      // quando o caller não especifica type — só a busca pública devolve o
      // workspace de teste aqui, a privada fica vazia (sem duplicar dados).
      const dados = urlStr.includes('type=private') ? [] : vozes;
      return { ok: true, status: 200, json: async () => ({ data: dados, has_more: false }) };
    }
    return { ok: false, status: 404, text: async () => 'not found' };
  });
}

describe('Filtro de avatares/vozes por HEYGEN_AVATAR_IDS/HEYGEN_VOICE_IDS', () => {
  test('GET /api/heygen/avatares retorna só os avatares cujo id está em HEYGEN_AVATAR_IDS, preservando nome/tipo/thumbnail', async () => {
    const ag = agent();
    installHeygenListFetchMock();
    const res = await ag.get('/api/heygen/avatares');
    expect(res.status).toBe(200);
    expect(res.body.avatares).toEqual([
      { id: 'av_1', name: 'Ana', avatar_type: 'studio_avatar', preview_image_url: 'https://x/av1.png' },
      { id: 'av_3', name: 'Carla', avatar_type: 'photo_avatar', preview_image_url: 'https://x/av3.png' }
    ]);
  });

  test('GET /api/heygen/vozes retorna só as vozes cujo voice_id está em HEYGEN_VOICE_IDS, preservando nome/idioma', async () => {
    const ag = agent();
    installHeygenListFetchMock();
    const res = await ag.get('/api/heygen/vozes');
    expect(res.status).toBe(200);
    expect(res.body.vozes).toEqual([
      { voice_id: 'v_2', name: 'Voz Bruno', language: 'pt-BR' }
    ]);
  });
});
