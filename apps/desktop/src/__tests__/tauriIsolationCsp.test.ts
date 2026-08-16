import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const conf = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
) as { app: { security: { csp: string; pattern?: { use?: string } } } };

const security = conf.app.security;

describe('tauri isolation pattern vs CSP', () => {
  it('does not pin frame-src while the isolation pattern is enabled', () => {
    if (security.pattern?.use !== 'isolation') return;
    expect(security.csp).not.toMatch(/(^|;)\s*frame-src\s/);
  });

  it('keeps the framed origins reachable through default-src', () => {
    const defaultSrc = security.csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('default-src '));

    expect(defaultSrc).toBeDefined();
    for (const source of ['https://js.stripe.com', 'artifact:', 'http://artifact.localhost']) {
      expect(defaultSrc).toContain(source);
    }
  });
});
