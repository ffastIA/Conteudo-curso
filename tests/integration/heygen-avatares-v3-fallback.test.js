'use strict';

jest.mock('openai');

// Lidas do env na carga do módulo: isola o teste do .env real do usuário.
process.env.HEYGEN_AVATAR_IDS = '';
process.env.HEYGEN_VOICE_IDS = '';
process.env.HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || 'test-key';

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

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const naoEncontrado = { ok: false, status: 404, text: async () => 'not found' };

// Mock de fetch para a listagem de avatares: v3 (/v3/avatar_groups) e v2
// (/v2/avatar_group.list) configuráveis de forma independente.
function mockFetch({ v3, v2 }) {
  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    if (u.includes('/v3/avatar_groups')) return v3(u);
    if (u.includes('/v2/')) return v2(u);
    return naoEncontrado;
  });
}

describe('GET /api/heygen/avatares — migração v2 → v3 (sunset 2026-10-31)', () => {
  test('v3 disponível: usa a v3, não chama a v2 e não sinaliza legado', async () => {
    mockFetch({
      v3: (u) => u.match(/avatar_groups\/g1\/avatars/)
        ? ok({ data: [{ id: 'av_v3', name: 'Ana v3', image_url: 'https://x/a.png' }] })
        : ok({ data: [{ id: 'g1', name: 'Grupo', group_type: 'STUDIO' }] }),
      v2: () => { throw new Error('v2 não deveria ser chamada'); }
    });
    const res = await request(app).get('/api/heygen/avatares');
    expect(res.status).toBe(200);
    expect(res.body.legado).toBe(false);
    expect(res.body.avatares).toEqual([
      { id: 'av_v3', name: 'Ana v3', avatar_type: 'studio_avatar', preview_image_url: 'https://x/a.png' }
    ]);
    expect(global.fetch.mock.calls.some(([u]) => String(u).includes('/v2/'))).toBe(false);
  });

  test('v3 responde 404 e v2 ativo: usa a v2 e sinaliza legado', async () => {
    mockFetch({
      v3: () => naoEncontrado,
      v2: (u) => u.includes('avatar_group.list')
        ? ok({ data: { avatar_group_list: [{ id: 'g2', name: 'Grupo 2', group_type: 'PHOTO' }] } })
        : ok({ data: { avatar_list: [{ id: 'av_v2', name: 'Bia', image_url: 'https://x/b.png' }] } })
    });
    const res = await request(app).get('/api/heygen/avatares');
    expect(res.status).toBe(200);
    expect(res.body.legado).toBe(true);
    expect(res.body.avatares.map(a => a.id)).toEqual(['av_v2']);
  });

  test('v3 com formato não reconhecido cai para a v2', async () => {
    mockFetch({
      v3: () => ok({ inesperado: true }),
      v2: (u) => u.includes('avatar_group.list')
        ? ok({ data: { avatar_group_list: [{ id: 'g2', name: 'G', group_type: 'STUDIO' }] } })
        : ok({ data: { avatar_list: [{ id: 'av_v2', name: 'Bia' }] } })
    });
    const res = await request(app).get('/api/heygen/avatares');
    expect(res.status).toBe(200);
    expect(res.body.legado).toBe(true);
    expect(res.body.avatares.map(a => a.id)).toEqual(['av_v2']);
  });

  test('v3 e v2 falham: 500 com mensagem (a UI oferece avatarId manual)', async () => {
    mockFetch({
      v3: () => naoEncontrado,
      v2: () => ({ ok: false, status: 410, text: async () => 'gone' })
    });
    const res = await request(app).get('/api/heygen/avatares');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/410/);
  });
});

describe('POST /api/heygen/config — avatarId informado manualmente', () => {
  test('aceita avatarId digitado, sem nome nem tipo, quando a listagem falhou', async () => {
    const res = await request(app)
      .post('/api/heygen/config')
      .send({ avatarId: 'id_manual_123', avatarName: 'id_manual_123', avatarType: '', voiceId: 'v_1', voiceName: 'Voz' });
    expect(res.status).toBe(200);
  });
});
