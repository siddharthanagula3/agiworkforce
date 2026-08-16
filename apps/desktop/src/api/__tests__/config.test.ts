import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Desktop Cloud production origins', () => {
  it('uses one canonical production origin so bearer requests do not cross a redirect', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_WEB_APP_URL', '');
    const { API_BASE_URL, WEB_APP_URL } = await import('../config');

    expect(API_BASE_URL).toBe('https://agiworkforce.com');
    expect(WEB_APP_URL).toBe('https://agiworkforce.com');
  });

  it('keeps .env.example on the canonical apex origin', () => {
    const contents = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');

    expect(contents).toMatch(/^VITE_API_BASE_URL=https:\/\/agiworkforce\.com$/m);
    expect(contents).toMatch(/^VITE_WEB_APP_URL=https:\/\/agiworkforce\.com$/m);
  });
});
