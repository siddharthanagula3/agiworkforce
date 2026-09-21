import { describe, expect, it } from 'vitest';

import { PINO_LEVELS, resolveLogLevel } from './logger';

describe('log level resolution', () => {
  it('refuses a level below info outside development', () => {
    for (const level of ['trace', 'debug'] as const) {
      expect(resolveLogLevel(level, false), level).toBe('info');
      expect(resolveLogLevel(level.toUpperCase(), false), level).toBe('info');
      expect(resolveLogLevel(` ${level} `, false), level).toBe('info');
    }
  });

  it('keeps every level at or above info outside development', () => {
    const floor = PINO_LEVELS.indexOf('info');
    for (const level of PINO_LEVELS.slice(floor)) {
      expect(resolveLogLevel(level, false), level).toBe(level);
    }
  });

  it('lets a developer ask for any level the logger knows', () => {
    for (const level of PINO_LEVELS) {
      expect(resolveLogLevel(level, true), level).toBe(level);
    }
  });

  it('falls back per environment when nothing usable is set', () => {
    for (const requested of [undefined, '', '   ', 'verbose', 'DEBUGGING']) {
      expect(resolveLogLevel(requested, false), String(requested)).toBe('info');
      expect(resolveLogLevel(requested, true), String(requested)).toBe('debug');
    }
  });
});
