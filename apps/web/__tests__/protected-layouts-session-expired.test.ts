import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = path.resolve(import.meta.dirname, '../app');
const PROTECTED_LAYOUTS = ['chat', 'code', 'settings', 'tasks', 'billing', 'workspace', 'admin'];

describe('protected layouts and an expired session', () => {
  for (const segment of PROTECTED_LAYOUTS) {
    it(`${segment} sends a signed-in visitor whose session lapsed to the recovery page, not a bare sign-in`, () => {
      const source = fs.readFileSync(path.join(APP_ROOT, segment, 'layout.tsx'), 'utf8');
      expect(source).toContain('getRequestIdentity');
      expect(source).toContain('sessionExpiredRedirect(');
      expect(source).not.toMatch(/redirect\(\s*[`']\/login/);
    });
  }
});
