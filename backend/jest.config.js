module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/**',
    '!src/middleware/auth.js',
  ],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
};
