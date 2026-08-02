import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The isolation pattern generates a fresh `isolation-<uuid>:` scheme for the
 * relay iframe on every build, and Tauri appends that scheme to `default-src`
 * ONLY. Pinning an explicit `frame-src` therefore shadows it, WebKit blocks the
 * relay, `__TAURI_ISOLATION_READY__` never arrives, and every invoke() queues
 * forever with no resolve and no reject — the app hangs on its loading screen
 * with no error. No static frame-src value can fix it, because the scheme's
 * uuid is not knowable ahead of the build.
 *
 * Regressed once already in aa4fbcb5a "feat(desktop): isolate renderer ipc".
 */
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
    // Stripe checkout and the artifact sandbox are rendered in frames; with no
    // frame-src they must be reachable via the default-src fallback.
    for (const source of ['https://js.stripe.com', 'artifact:', 'http://artifact.localhost']) {
      expect(defaultSrc).toContain(source);
    }
  });
});
