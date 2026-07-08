'use strict';

let _response = 'mock response text';
let _error = null;
let _queue = [];
let _imageError = null;

// PNG 1x1 transparente, usado como resposta padrão de images.generate.
const FAKE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const mockImagesGenerate = jest.fn(async () => {
  if (_imageError) throw _imageError;
  return { data: [{ b64_json: FAKE_PNG_B64 }] };
});

async function* makeStream(text) {
  const words = text.split(' ');
  for (const word of words) {
    yield { choices: [{ delta: { content: word + ' ' } }] };
  }
  yield { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
}

const mockCreate = jest.fn(async ({ stream }, options) => {
  OpenAI.__lastOptions = options;
  if (_error) throw _error;
  const text = _queue.length ? _queue.shift() : _response;
  if (stream) {
    return makeStream(text);
  }
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
  };
});

class OpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: mockCreate
      }
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

OpenAI.__reset = () => {
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

module.exports = OpenAI;
