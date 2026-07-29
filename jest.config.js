/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",

  globalSetup: "<rootDir>/src/tests/setup/globalSetup.js",
  globalTeardown: "<rootDir>/src/tests/setup/globalTeardown.js",
  setupFiles: ["<rootDir>/src/tests/setup/env.js"],
  setupFilesAfterEnv: ["<rootDir>/src/tests/setup/setupAfterFramework.js"],

  testMatch: ["<rootDir>/src/tests/**/*.test.js"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/src/tests/setup/",
    "<rootDir>/src/tests/helpers/",
    "<rootDir>/src/tests/factories/",
    "<rootDir>/src/tests/fixtures/",
  ],

  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/templates/**",
    "!src/config/db.js",
    "!src/tests/**",
  ],
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  coverageReporters: ["text", "lcov", "html"],

  testTimeout: 30000,
  verbose: true,
  maxWorkers: 1,
  clearMocks: true,
  restoreMocks: true,
};
