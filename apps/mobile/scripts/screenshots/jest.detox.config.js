/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'detox/runners/jest/testEnvironment',
  testMatch: ['<rootDir>/specs/**/*.spec.ts'],
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testTimeout: 120000,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.json' }],
  },
};
