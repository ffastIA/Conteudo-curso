'use strict';

module.exports = {
  testEnvironment: 'node',
  // Testes de integração fazem várias requisições SSE; 5 s (padrão) estoura sob carga.
  testTimeout: 30000,
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  coverageThreshold: {
    global: { lines: 70 }
  },
  collectCoverageFrom: [
    'server.js',
    'skills.js',
    'conteudo-secoes.js',
    'fundamentacao.js',
    'avaliacao.js',
    'observabilidade.js',
    'custo.js',
    'orcamento.js',
    'logger.js',
    'docx-markdown.js',
    'config/modelos.js',
    'public/markdown.js'
  ],
  moduleNameMapper: {
    '^openai$': '<rootDir>/tests/__mocks__/openai.js'
  }
};
