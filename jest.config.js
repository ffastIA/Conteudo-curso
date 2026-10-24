'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  coverageThreshold: {
    global: { lines: 60 }
  },
  collectCoverageFrom: [
    'server.js',
    'skills.js',
    'conteudo-secoes.js',
    'observabilidade.js'
  ],
  moduleNameMapper: {
    '^openai$': '<rootDir>/tests/__mocks__/openai.js'
  }
};
