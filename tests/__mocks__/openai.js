'use strict';

let _response = 'mock response text';
let _error = null;
let _queue = [];
let _imageError = null;
// Fila de finish_reason por chamada de chat (FIFO; vazia = sem finish_reason no
// stream e 'stop' nas respostas simples). Permite simular corte por 'length'.
let _finishQueue = [];
// Função (params) => texto que decide a resposta de cada chamada de chat (tem
// prioridade sobre a fila/_response). Permite responder por tipo de prompt.
let _responder = null;
// Fila de erros por chamada de chat/responses (FIFO): cada chamada lança o próximo
// erro da fila; esvaziada, as chamadas voltam a responder normalmente.
let _errorQueue = [];

// PNG 1x1 transparente, usado como resposta padrão de images.generate.
const FAKE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const mockImagesGenerate = jest.fn(async () => {
  if (_imageError) throw _imageError;
  return { data: [{ b64_json: FAKE_PNG_B64 }] };
});

async function* makeStream(text, finishReason) {
  const words = text.split(' ');
  for (const word of words) {
    yield { choices: [{ delta: { content: word + ' ' } }] };
  }
  yield { choices: [{ delta: {}, ...(finishReason ? { finish_reason: finishReason } : {}) }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
}

const mockCreate = jest.fn(async (params, options) => {
  const { stream } = params;
  OpenAI.__lastOptions = options;
  if (_errorQueue.length) throw _errorQueue.shift();
  if (_error) throw _error;
  const text = _responder ? _responder(params) : (_queue.length ? _queue.shift() : _response);
  const finishReason = _finishQueue.length ? _finishQueue.shift() : undefined;
  if (stream) {
    return makeStream(text, finishReason);
  }
  return {
    choices: [{ message: { content: text }, ...(finishReason ? { finish_reason: finishReason } : {}) }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
  };
});

// Responses API (ferramenta web_search) — usada pela pesquisa web da Etapa 2.
// Devolve `output` com uma mensagem de texto e anotações url_citation
// configuráveis por OpenAI.__setCitations (padrão: 2 fontes em 2 domínios).
let _citations = [
  { url: 'https://nodejs.org/docs?utm_source=openai', title: 'Node.js Docs' },
  { url: 'https://developer.mozilla.org/js?utm_source=openai', title: 'MDN' },
  { url: 'https://www.w3schools.com/nodejs', title: 'W3Schools' }
];

const mockResponsesCreate = jest.fn(async (params, options) => {
  OpenAI.__lastOptions = options;
  if (_errorQueue.length) throw _errorQueue.shift();
  if (_error) throw _error;
  const text = _queue.length ? _queue.shift() : _response;
  return {
    status: 'completed',
    output: [
      { type: 'web_search_call', status: 'completed' },
      {
        type: 'message',
        content: [{
          type: 'output_text',
          text,
          annotations: _citations.map(c => ({ type: 'url_citation', url: c.url, title: c.title }))
        }]
      }
    ],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }
  };
});

class OpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: mockCreate
      }
    };
    this.responses = {
      create: mockResponsesCreate
    };
    this.images = {
      generate: mockImagesGenerate
    };
  }
}

OpenAI.__setResponse = (text) => {
  _response = text;
  _error = null;
  _queue = [];
  mockCreate.mockClear();
};

// Fila de respostas consumida uma por chamada (FIFO); quando esvazia, volta a
// devolver _response fixa. Necessário para rotas que fazem N chamadas com
// contratos distintos na mesma requisição (ex.: JSON de aulas + prosa por aula).
OpenAI.__setResponses = (texts) => {
  _queue = [...texts];
  _error = null;
  mockCreate.mockClear();
};

OpenAI.__setError = (err) => {
  _error = err;
  mockCreate.mockClear();
};

OpenAI.__setImageError = (err) => {
  _imageError = err;
  mockImagesGenerate.mockClear();
};

OpenAI.__getMock = () => mockCreate;
OpenAI.__setErrors = (errs) => { _errorQueue = [...errs]; };
OpenAI.__setResponder = (fn) => { _responder = fn; };
OpenAI.__setFinishReasons = (reasons) => { _finishQueue = [...reasons]; };
OpenAI.__getResponsesMock = () => mockResponsesCreate;
OpenAI.__setCitations = (citations) => { _citations = citations; };

OpenAI.__reset = () => {
  _errorQueue = [];
  _responder = null;
  _finishQueue = [];
  mockResponsesCreate.mockClear();
  _citations = [
    { url: 'https://nodejs.org/docs?utm_source=openai', title: 'Node.js Docs' },
    { url: 'https://developer.mozilla.org/js?utm_source=openai', title: 'MDN' },
    { url: 'https://www.w3schools.com/nodejs', title: 'W3Schools' }
  ];
  _response = 'mock response text';
  _error = null;
  _queue = [];
  _imageError = null;
  OpenAI.__lastOptions = undefined;
  mockCreate.mockClear();
  mockImagesGenerate.mockClear();
};

OpenAI.APIUserAbortError = class APIUserAbortError extends Error {
  constructor(message = 'Request was aborted.') {
    super(message);
    this.name = 'APIUserAbortError';
  }
};

// Classes de erro do SDK usadas por isRetriable (instanceof) no server.js —
// sem elas, `err instanceof undefined` lançaria TypeError.
class APIStatusError extends Error {
  constructor(message, status, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}
OpenAI.AuthenticationError = class AuthenticationError extends APIStatusError {
  constructor(message = 'Incorrect API key provided.') { super(message, 401); this.name = 'AuthenticationError'; }
};
OpenAI.BadRequestError = class BadRequestError extends APIStatusError {
  constructor(message = 'Bad request.') { super(message, 400); this.name = 'BadRequestError'; }
};
OpenAI.RateLimitError = class RateLimitError extends APIStatusError {
  constructor(message = 'Rate limit reached.', headers = {}) { super(message, 429, headers); this.name = 'RateLimitError'; }
};
OpenAI.InternalServerError = class InternalServerError extends APIStatusError {
  constructor(message = 'Server error.', status = 500) { super(message, status); this.name = 'InternalServerError'; }
};
OpenAI.APIConnectionError = class APIConnectionError extends Error {
  constructor(message = 'Connection error.') { super(message); this.name = 'APIConnectionError'; }
};

module.exports = OpenAI;
