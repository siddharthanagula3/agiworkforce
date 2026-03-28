import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('auth/settings module initialization', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('imports settingsStore without a temporal dead zone crash', async () => {
    await expect(import('../settingsStore')).resolves.toHaveProperty('useSettingsStore');
  });
});
