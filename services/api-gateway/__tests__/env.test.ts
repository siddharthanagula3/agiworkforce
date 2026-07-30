import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateStartupEnv } from '../src/env';

function setRequiredEnvironment() {
  vi.stubEnv('JWT_SECRET', 'test-jwt-secret');
  vi.stubEnv('NEON_DATABASE_URL', 'postgresql://test:test@example.test/database');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('ENABLE_MOBILE_PAIRING', 'false');
}

afterEach(() => vi.unstubAllEnvs());

describe('gateway startup environment', () => {
  it('accepts bounded runtime controls', () => {
    setRequiredEnvironment();
    vi.stubEnv('PORT', '3000');
    vi.stubEnv('SHUTDOWN_GRACE_MS', '25000');
    vi.stubEnv('WS_MAX_MESSAGE_SIZE', '65536');
    vi.stubEnv('WS_AUTH_TIMEOUT_MS', '30000');

    expect(() => validateStartupEnv()).not.toThrow();
  });

  it('rejects an invalid shutdown deadline before binding the listener', () => {
    setRequiredEnvironment();
    vi.stubEnv('SHUTDOWN_GRACE_MS', 'not-a-number');

    expect(() => validateStartupEnv()).toThrow(/SHUTDOWN_GRACE_MS/);
  });

  it('requires the signaling secret whenever pairing is enabled', () => {
    setRequiredEnvironment();
    vi.stubEnv('ENABLE_MOBILE_PAIRING', 'true');
    vi.stubEnv('SIGNALING_INTERNAL_SECRET', '');

    expect(() => validateStartupEnv()).toThrow(/SIGNALING_INTERNAL_SECRET/);
  });
});
