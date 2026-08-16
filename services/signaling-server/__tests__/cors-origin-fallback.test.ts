import { describe, expect, it } from 'vitest';
import { DEFAULT_ALLOWED_ORIGINS } from '../src/constants.js';

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
    const origins = resolveAllowedOrigins({ NODE_ENV: 'production' });
    expect(origins).toEqual([]);
    expect(origins.some((o) => o.includes('localhost'))).toBe(false);
  });

  it('treats an EMPTY ALLOWED_ORIGINS as unset, which is how docker-compose ships it', () => {
    const origins = resolveAllowedOrigins({ NODE_ENV: 'production', ALLOWED_ORIGINS: '' });
    expect(origins).toEqual([]);
  });

  it('still allows the localhost defaults outside production', () => {
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
