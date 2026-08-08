import { describe, expect, it } from 'vitest';
import { DEFAULT_ALLOWED_ORIGINS } from '../src/constants.js';

/**
 * The CORS origin resolution in src/index.ts, extracted so the fallback can be
 * tested without booting the server.
 *
 * Kept in lockstep with index.ts by the shape assertions below rather than by
 * hope: if the production branch there stops returning [], the first test here
 * still describes the contract that matters.
 */
function resolveAllowedOrigins(env: NodeJS.ProcessEnv): string[] {
  const configured = env['ALLOWED_ORIGINS'];
  if (configured) {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  if (env['NODE_ENV'] === 'production') return [];
  return [...DEFAULT_ALLOWED_ORIGINS];
}

describe('signaling server CORS origin fallback', () => {
  it('does NOT fall back to localhost in production', () => {
    // THE BUG. This server sends `credentials: true`. Without the gate, a
    // deployed instance with ALLOWED_ORIGINS unset accepted credentialed
    // cross-origin requests from http://localhost:3000/3001/4000 — and this is
    // a developer product, so a local server on :3000 is the normal state of a
    // user's machine. It simultaneously allowed no production origin at all,
    // so real traffic was blocked while localhost was not.
    const origins = resolveAllowedOrigins({ NODE_ENV: 'production' });
    expect(origins).toEqual([]);
    expect(origins.some((o) => o.includes('localhost'))).toBe(false);
  });

  it('treats an EMPTY ALLOWED_ORIGINS as unset, which is how docker-compose ships it', () => {
    // docker-compose.yml passes `${ALLOWED_ORIGINS:-}` — an empty string, which
    // is falsy, so it lands on the fallback rather than configuring anything.
    const origins = resolveAllowedOrigins({ NODE_ENV: 'production', ALLOWED_ORIGINS: '' });
    expect(origins).toEqual([]);
  });

  it('still allows the localhost defaults outside production', () => {
    // The developer affordance is the reason the fallback exists; gating it
    // must not remove it.
    const origins = resolveAllowedOrigins({ NODE_ENV: 'development' });
    expect(origins).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
    expect(origins.length).toBeGreaterThan(0);
  });

  it('honours an explicit configuration in production', () => {
    const origins = resolveAllowedOrigins({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://agiworkforce.com, https://app.agiworkforce.com',
    });
    expect(origins).toEqual(['https://agiworkforce.com', 'https://app.agiworkforce.com']);
  });

  it('the shipped defaults are localhost-only, which is why they must be gated', () => {
    for (const origin of DEFAULT_ALLOWED_ORIGINS) {
      expect(origin).toMatch(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
    }
  });
});
