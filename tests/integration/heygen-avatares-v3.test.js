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
const falha = (status, texto = 'erro') => ({ ok: false, status, text: async () => texto });

// Mock de fetch: responde só a /v3/avatars/looks; qualquer outra URL (inclusive v2) falha.
function mockLooks(resposta) {
  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    if (u.includes('/v3/avatars/looks')) return resposta(u);
    return falha(404, 'not found');
  });
}

const look = (id, extra = {}) => ({
  id, name: `Look ${id}`, avatar_type: 'studio_avatar', group_id: 'g1',
  preview_image_url: `https://x/${id}.png`, ...extra
});

describe('GET /api/heygen/avatares — API v3 (sunset da v2 em 2026-10-31)', () => {
  test('lista os looks do usuário pela v3, só do dono, sem chamar a v2 e sem campo legado', async () => {
    mockLooks(() => ok({ data: [look('av_1'), look('av_2', { avatar_type: 'photo_avatar' })], has_more: false }));
    const res = await request(app).get('/api/heygen/avatares');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('legado');
    expect(res.body.avatares).toEqual([
      { id: 'av_1', name: 'Look av_1', avatar_type: 'studio_avatar', preview_image_url: 'https://x/av_1.png' },
      { id: 'av_2', name: 'Look av_2', avatar_type: 'photo_avatar', preview_image_url: 'https://x/av_2.png' }
    ]);
    const urls = global.fetch.mock.calls.map(([u]) => String(u));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('ownership=private');
    expect(urls.some(u => u.includes('/v2/'))).toBe(false);
  });

  test('segue a paginação (has_more/next_token) e junta as páginas', async () => {
    mockLooks((u) => u.includes('token=t2')
      ? ok({ data: [look('av_3')], has_more: false })
      : ok({ data: [look('av_1'), look('av_2')], has_more: true, next_token: 't2' }));
    const res = await request(app).get('/api/heygen/avatares');
    expect(res.status).toBe(200);
    expect(res.body.avatares.map(a => a.id)).toEqual(['av_1', 'av_2', 'av_3']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('omite looks que ainda não estão completed e mantém os sem status', async () => {
    mockLooks(() => ok({
      data: [look('av_ok', { status: 'completed' }), look('av_proc', { status: 'processing' }),
        look('av_falhou', { status: 'failed' }), look('av_consent', { status: 'pending_consent' }), look('av_sem_status')],
      has_more: false
    }));
    const res = await request(app).get('/api/heygen/avatares');
    expect(res.body.avatares.map(a => a.id)).toEqual(['av_ok', 'av_sem_status']);
  });

  test('look sem nome usa o id; sem preview devolve texto vazio', async () => {
    mockLooks(() => ok({ data: [{ id: 'av_x', avatar_type: 'digital_twin', preview_image_url: null }], has_more: false }));
    const res = await request(app).get('/api/heygen/avatares');
    expect(res.body.avatares).toEqual([{ id: 'av_x', name: 'av_x', avatar_type: 'digital_twin', preview_image_url: '' }]);
  });

  test('usuário sem avatares: lista vazia, não é erro', async () => {
    mockLooks(() => ok({ data: [], has_more: false }));
    const res = await request(app).get('/api/heygen/avatares');
    expect(res.status).toBe(200);
    expect(res.body.avatares).toEqual([]);
  });

  test('erro HTTP da v3: 500 com mensagem (a UI oferece avatarId manual)', async () => {
    mockLooks(() => falha(401, 'chave inválida'));
    const res = await request(app).get('/api/heygen/avatares');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/401/);
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
