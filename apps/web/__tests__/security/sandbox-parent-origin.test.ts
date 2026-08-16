import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The artifact sandbox renders whatever its parent tells it to render, so the
 * parent check is the whole boundary. It used to accept any host that both
 * started with `agiworkforce-` and ended with `.vercel.app`, which anyone can
 * satisfy by registering a project of that name.
 */

const SANDBOX_HTML = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'infrastructure', 'sandbox', 'index.html'),
  'utf8',
);

function previewHostPattern(): RegExp {
  const match = SANDBOX_HTML.match(/const VERCEL_PREVIEW_HOST\s*=\s*\n?\s*(\/[\s\S]*?\/);/);
  if (!match) throw new Error('VERCEL_PREVIEW_HOST is no longer declared in the sandbox');
  const body = match[1]!.slice(1, -1);
  return new RegExp(body);
}

describe('artifact sandbox parent-origin allowlist', () => {
  it('accepts a real Vercel preview host for this project', () => {
    const pattern = previewHostPattern();
    expect(pattern.test('agiworkforce-k3n8x2p9q-siddharthas-projects.vercel.app')).toBe(true);
  });

  it.each([
    ['agiworkforce-pwn.vercel.app', 'a project anyone can register'],
    ['agiworkforce-a-b.vercel.app', 'no deployment hash'],
    ['notagiworkforce-k3n8x2p9q-team.vercel.app', 'a different project prefix'],
    ['agiworkforce-k3n8x2p9q-team.vercel.app.evil.com', 'suffix smuggling'],
  ])('rejects %s (%s)', (hostname) => {
    expect(previewHostPattern().test(hostname)).toBe(false);
  });

  it('drops a message that did not come from the embedding parent', () => {
    expect(SANDBOX_HTML).toContain('event.source !== window.parent');
    const listener = SANDBOX_HTML.slice(
      SANDBOX_HTML.indexOf("window.addEventListener('message'"),
      SANDBOX_HTML.indexOf('isAllowedParent(event.origin)'),
    );
    expect(listener).toContain('event.source !== window.parent');
  });

  it('keeps the origin check anchored, not a prefix/suffix pair', () => {
    expect(SANDBOX_HTML).not.toContain("hostname.startsWith('agiworkforce-')");
    expect(SANDBOX_HTML).not.toContain("hostname.endsWith('.vercel.app')");
  });
});
