import { afterEach, describe, expect, it, vi } from 'vitest';

import { areDurableInitialTurnsEnabled, DURABLE_INITIAL_TURNS_ENV } from './durable-initial-turns';

describe('durable initial turn release gate', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps the external Workflow transport off when the release flag is unset', () => {
    vi.stubEnv(DURABLE_INITIAL_TURNS_ENV, '');
    expect(areDurableInitialTurnsEnabled()).toBe(false);
  });

  it.each(['1', 'true', 'on', ' TRUE '])('enables only an explicit release value: %s', (value) => {
    vi.stubEnv(DURABLE_INITIAL_TURNS_ENV, value);
    expect(areDurableInitialTurnsEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'off', 'unexpected'])('fails closed for other values: %s', (value) => {
    vi.stubEnv(DURABLE_INITIAL_TURNS_ENV, value);
    expect(areDurableInitialTurnsEnabled()).toBe(false);
  });
});
