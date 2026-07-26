import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { API_BASE_URL, WEB_APP_URL } from '../config';

describe('Desktop Cloud production origins', () => {
  it('uses one canonical origin so bearer requests do not cross a redirect', () => {
    expect(API_BASE_URL).toBe('https://agiworkforce.com');
    expect(WEB_APP_URL).toBe('https://agiworkforce.com');
  });

  it('keeps .env.example on the canonical apex origin', () => {
    const contents = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');

    expect(contents).toMatch(/^VITE_API_BASE_URL=https:\/\/agiworkforce\.com$/m);
    expect(contents).toMatch(/^VITE_WEB_APP_URL=https:\/\/agiworkforce\.com$/m);
  });
});
