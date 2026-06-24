'use strict';

let _response = 'mock response text';
let _error = null;

async function* makeStream(text) {
  const words = text.split(' ');
  for (const word of words) {
    yield { choices: [{ delta: { content: word + ' ' } }] };
  }
  yield { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
}

const mockCreate = jest.fn(async ({ stream }) => {
  if (_error) throw _error;
  if (stream) {
    return makeStream(_response);
  }
  return {
    choices: [{ message: { content: _response } }],
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
  }
}

OpenAI.__setResponse = (text) => {
  _response = text;
  _error = null;
  mockCreate.mockClear();
};

OpenAI.__setError = (err) => {
  _error = err;
  mockCreate.mockClear();
};

OpenAI.__getMock = () => mockCreate;

OpenAI.__reset = () => {
  _response = 'mock response text';
  _error = null;
  mockCreate.mockClear();
};

module.exports = OpenAI;
