import { afterEach, describe, expect, it, vi } from 'vitest';

import { areDurableInitialTurnsEnabled, DURABLE_INITIAL_TURNS_ENV } from './durable-initial-turns';

describe('durable initial turn kill-switch', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps the Workflow transport on when the deployment sets nothing', () => {
    vi.stubEnv(DURABLE_INITIAL_TURNS_ENV, '');
    expect(areDurableInitialTurnsEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'off', ' OFF '])('reverts to request-scoped turns for: %s', (value) => {
    vi.stubEnv(DURABLE_INITIAL_TURNS_ENV, value);
    expect(areDurableInitialTurnsEnabled()).toBe(false);
  });

  it.each(['1', 'true', 'on', 'unexpected'])('stays durable for any other value: %s', (value) => {
    vi.stubEnv(DURABLE_INITIAL_TURNS_ENV, value);
    expect(areDurableInitialTurnsEnabled()).toBe(true);
  });
});
