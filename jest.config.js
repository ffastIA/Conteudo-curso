'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coverageThreshold: {
    global: { lines: 60 }
  },
  collectCoverageFrom: [
    'server.js',
    'skills.js'
  ],
  moduleNameMapper: {
    '^openai$': '<rootDir>/tests/__mocks__/openai.js'
  }
};
