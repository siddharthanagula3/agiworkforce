/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Jest config used by Detox's test runner.
 * Scoped to scripts/screenshots/specs/ so the regular Jest run
 * (apps/mobile/__tests__/) is never touched by Detox.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/specs/**/*.spec.ts'],
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testTimeout: 120000,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.json' }],
  },
};
