'use strict';

// O mock da OpenAI precisa rejeitar o que a API real rejeita (change
// base-de-testes-realista); estes testes protegem o próprio mock.
jest.mock('openai');

const OpenAI = require('openai');
const app = require('../../server');

const cliente = () => new OpenAI({ apiKey: 'x' });
const msgs = [{ role: 'user', content: 'oi' }];

beforeEach(() => OpenAI.__reset());

describe('classes de erro do SDK', () => {
  test('têm status e headers e herdam de Error', () => {
    const e = new OpenAI.RateLimitError('limite', { 'retry-after': '7' });
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(429);
    expect(e.headers['retry-after']).toBe('7');
    expect(new OpenAI.AuthenticationError().status).toBe(401);
    expect(new OpenAI.BadRequestError().status).toBe(400);
    expect(new OpenAI.NotFoundError().status).toBe(404);
    expect(new OpenAI.InternalServerError().status).toBe(500);
  });

  test('isRetriable: chave inválida e requisição inválida não são repetidas, sem TypeError', () => {
    expect(() => app.isRetriable(new OpenAI.AuthenticationError())).not.toThrow();
    expect(app.isRetriable(new OpenAI.AuthenticationError())).toBe(false);
    expect(app.isRetriable(new OpenAI.BadRequestError())).toBe(false);
    expect(app.isRetriable(new OpenAI.RateLimitError())).toBe(true);
    expect(app.isRetriable(new Error('rede'))).toBe(true);
  });

  test('cabeçalho retry-after do 429 fica acessível ao código sob teste', async () => {
    OpenAI.__setErrors([new OpenAI.RateLimitError('limite', { 'retry-after': '7' })]);
    await expect(cliente().chat.completions.create({ model: 'gpt-4o-mini', messages: msgs }))
      .rejects.toMatchObject({ status: 429, headers: { 'retry-after': '7' } });
  });
});

describe('validação de parâmetros como a API real', () => {
  test('web_search_options com gpt-4o → BadRequestError (regressão do commit dbc35cc)', async () => {
    await expect(cliente().chat.completions.create({ model: 'gpt-4o', messages: msgs, web_search_options: {} }))
      .rejects.toBeInstanceOf(OpenAI.BadRequestError);
    await expect(cliente().chat.completions.create({ model: 'gpt-4o-mini', messages: msgs, web_search_options: { search_context_size: 'medium' } }))
      .rejects.toThrow(/Web search options not supported/);
  });

  test('modelo *-search-preview está descontinuado (404), como verificado na API real', async () => {
    await expect(cliente().chat.completions.create({ model: 'gpt-4o-search-preview', messages: msgs, web_search_options: {} }))
      .rejects.toBeInstanceOf(OpenAI.NotFoundError);
  });

  test('chat sem model ou sem messages → BadRequestError', async () => {
    await expect(cliente().chat.completions.create({ messages: msgs })).rejects.toBeInstanceOf(OpenAI.BadRequestError);
    await expect(cliente().chat.completions.create({ model: 'gpt-4o-mini' })).rejects.toBeInstanceOf(OpenAI.BadRequestError);
  });

  test('chamada válida segue funcionando', async () => {
    const r = await cliente().chat.completions.create({ model: 'gpt-4o-mini', messages: msgs });
    expect(r.choices[0].message.content).toBe('mock response text');
  });

  test('responses exige model e input e recusa parâmetros do chat', async () => {
    const c = cliente();
    await expect(c.responses.create({ input: 'x' })).rejects.toBeInstanceOf(OpenAI.BadRequestError);
    await expect(c.responses.create({ model: 'gpt-4o' })).rejects.toBeInstanceOf(OpenAI.BadRequestError);
    await expect(c.responses.create({ model: 'gpt-4o', input: 'x', messages: msgs })).rejects.toBeInstanceOf(OpenAI.BadRequestError);
    await expect(c.responses.create({ model: 'gpt-4o', input: 'x', tools: [{ type: 'ferramenta_inexistente' }] }))
      .rejects.toBeInstanceOf(OpenAI.BadRequestError);
  });
});

describe('Responses API com web_search', () => {
  test('resposta traz texto, chamada de busca e anotações url_citation', async () => {
    const r = await cliente().responses.create({ model: 'gpt-4o', input: 'x', tools: [{ type: 'web_search' }] });
    expect(r.output.some(o => o.type === 'web_search_call')).toBe(true);
    const msg = r.output.find(o => o.type === 'message');
    expect(msg.content[0].text).toBe('mock response text');
    expect(msg.content[0].annotations.every(a => a.type === 'url_citation' && a.url)).toBe(true);
    expect(msg.content[0].annotations.length).toBeGreaterThan(0);
  });

  test('citações configuráveis', async () => {
    OpenAI.__setCitations([{ url: 'https://a.example/x', title: 'A' }]);
    const r = await cliente().responses.create({ model: 'gpt-4o', input: 'x', tools: [{ type: 'web_search' }] });
    expect(r.output.find(o => o.type === 'message').content[0].annotations).toEqual([{ type: 'url_citation', url: 'https://a.example/x', title: 'A' }]);
  });

  test('em streaming: evento de busca, deltas de texto, anotações e conclusão', async () => {
    const eventos = [];
    for await (const ev of await cliente().responses.create({ model: 'gpt-4o', input: 'x', stream: true, tools: [{ type: 'web_search' }] })) {
      eventos.push(ev);
    }
    const tipos = eventos.map(e => e.type);
    expect(tipos).toContain('response.web_search_call.completed');
    expect(tipos.filter(t => t === 'response.output_text.delta').length).toBeGreaterThan(1);
    expect(tipos).toContain('response.output_text.annotation.added');
    expect(tipos[tipos.length - 1]).toBe('response.completed');
    expect(eventos.filter(e => e.type === 'response.output_text.delta').map(e => e.delta).join('').trim()).toBe('mock response text');
  });

  test('erros enfileirados também valem para a Responses API', async () => {
    OpenAI.__setErrors([new OpenAI.RateLimitError()]);
    await expect(cliente().responses.create({ model: 'gpt-4o', input: 'x' })).rejects.toMatchObject({ status: 429 });
    await expect(cliente().responses.create({ model: 'gpt-4o', input: 'x' })).resolves.toBeDefined();
  });
});

describe('truncamento simulável', () => {
  test('__setFinishReason("length") faz a próxima chamada voltar cortada, e só ela', async () => {
    OpenAI.__setFinishReason('length');
    const c = cliente();
    const primeira = await c.chat.completions.create({ model: 'gpt-4o-mini', messages: msgs });
    expect(primeira.choices[0].finish_reason).toBe('length');
    const segunda = await c.chat.completions.create({ model: 'gpt-4o-mini', messages: msgs });
    expect(segunda.choices[0].finish_reason).toBeUndefined();
  });

  test('em streaming o finish_reason vem no último chunk', async () => {
    OpenAI.__setFinishReason('length');
    const chunks = [];
    for await (const ch of await cliente().chat.completions.create({ model: 'gpt-4o-mini', messages: msgs, stream: true })) chunks.push(ch);
    expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe('length');
  });
});

describe('isolamento de rede', () => {
  test('o mock substitui o SDK: nenhuma chamada real é feita pela suíte', () => {
    expect(OpenAI.__getMock()).toBeDefined();
    expect(typeof OpenAI.__getResponsesMock()).toBe('function');
  });
});
