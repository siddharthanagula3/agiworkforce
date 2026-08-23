import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The artifact sandbox renders whatever its parent tells it to render, so the
 * parent check is the whole boundary. It used to accept any host whose *shape*
 * looked like a Vercel preview of this project (`agiworkforce-<hash>-<team>`),
 * which anyone can mint by naming a free Vercel project `agiworkforce`.
 */

const SANDBOX_DIR = join(__dirname, '..', '..', '..', '..', 'infrastructure', 'sandbox');
const SANDBOX_HTML = readFileSync(join(SANDBOX_DIR, 'index.html'), 'utf8');
const SANDBOX_VERCEL_JSON = JSON.parse(readFileSync(join(SANDBOX_DIR, 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

function parentGateSource(): string {
  const start = SANDBOX_HTML.indexOf('const ALLOWED_PARENT_ORIGINS');
  const fnStart = SANDBOX_HTML.indexOf('function isAllowedParent(', start);
  if (start < 0 || fnStart < 0) throw new Error('sandbox parent gate is no longer declared');
  let depth = 0;
  let i = SANDBOX_HTML.indexOf('{', fnStart);
  for (; i < SANDBOX_HTML.length; i += 1) {
    const char = SANDBOX_HTML[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return SANDBOX_HTML.slice(start, i + 1);
}

const isAllowedParent = new Function(`${parentGateSource()}\nreturn isAllowedParent;`)() as (
  origin: string,
) => boolean;

function allowedOrigins(): string[] {
  return [...parentGateSource().matchAll(/'([a-z]+:\/\/[^']+)'/g)].map((m) => m[1]!);
}

function frameAncestors(): string[] {
  const csp = SANDBOX_VERCEL_JSON.headers
    .flatMap((entry) => entry.headers)
    .find((header) => header.key.toLowerCase() === 'content-security-policy');
  if (!csp) throw new Error('sandbox vercel.json no longer sets a Content-Security-Policy');
  const directive = csp.value
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('frame-ancestors'));
  if (!directive) throw new Error('sandbox CSP no longer sets frame-ancestors');
  return directive.split(/\s+/).slice(1);
}

describe('artifact sandbox parent-origin allowlist', () => {
  it('accepts the enumerated application origins', () => {
    for (const origin of ['https://agiworkforce.com', 'https://chat.agiworkforce.com']) {
      expect(isAllowedParent(origin)).toBe(true);
    }
  });

  it('keeps accepting the desktop host origins', () => {
    expect(isAllowedParent('tauri://localhost')).toBe(true);
    expect(isAllowedParent('http://tauri.localhost')).toBe(true);
  });

  it.each([
    ['https://agiworkforce-k3n8x2p9q-atkteam.vercel.app', 'a preview host anyone can mint'],
    ['https://agiworkforce-pwn.vercel.app', 'a project anyone can register'],
    ['https://agiworkforce-chat.vercel.app.evil.com', 'suffix smuggling'],
    ['https://evil.agiworkforce.com', 'an unlisted subdomain'],
    ['http://agiworkforce.com', 'the wrong scheme'],
    ['null', 'an opaque origin'],
  ])('rejects %s (%s)', (origin) => {
    expect(isAllowedParent(origin)).toBe(false);
  });

  it('has no hostname-shape fallback left in the gate', () => {
    expect(SANDBOX_HTML).not.toContain('VERCEL_PREVIEW_HOST');
    expect(parentGateSource()).not.toMatch(/\.test\(|startsWith\(|endsWith\(|RegExp/);
  });

  it('drops a message that did not come from the embedding parent', () => {
    expect(SANDBOX_HTML).toContain('event.source !== window.parent');
    const listener = SANDBOX_HTML.slice(
      SANDBOX_HTML.indexOf("window.addEventListener('message'"),
      SANDBOX_HTML.indexOf('isAllowedParent(event.origin)'),
    );
    expect(listener).toContain('event.source !== window.parent');
  });

  it('lets no wildcard host frame the sandbox', () => {
    for (const ancestor of frameAncestors()) {
      expect(ancestor).not.toContain('*');
    }
  });

  it('only lets origins the message gate trusts frame the sandbox', () => {
    const allowed = new Set(allowedOrigins());
    for (const ancestor of frameAncestors()) {
      expect(allowed.has(ancestor)).toBe(true);
    }
  });
});
