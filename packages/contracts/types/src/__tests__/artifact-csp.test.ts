import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ARTIFACT_CSP_CONTENT,
  ARTIFACT_RENDERER_CSP_CONTENT,
  ARTIFACT_SCRIPT_CDN_HOSTS,
  buildArtifactCspContent,
  extractMetaCspContent,
} from '../artifact-csp';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const RENDERER_HTML_PATH = join(REPO_ROOT, 'infrastructure/sandbox/index.html');
const SANDBOX_DEPLOYMENT_PATH = join(REPO_ROOT, 'infrastructure/sandbox/vercel.json');

const rendererHtml = readFileSync(RENDERER_HTML_PATH, 'utf8');

const SANDBOX_ORIGIN = 'https://sandbox.agiworkforce.com';
const INJECTED_URL = 'https://attacker.example/pixel.png?d=conversation';
const RESOURCE_DIRECTIVES = ['img-src', 'style-src', 'font-src'] as const;

function deployedSandboxCsp(): string {
  const config = JSON.parse(readFileSync(SANDBOX_DEPLOYMENT_PATH, 'utf8')) as {
    headers: Array<{ headers: Array<{ key: string; value: string }> }>;
  };
  const header = config.headers
    .flatMap((rule) => rule.headers)
    .find(({ key }) => key.toLowerCase() === 'content-security-policy');
  if (!header) throw new Error('infrastructure/sandbox/vercel.json sends no CSP header');
  return header.value;
}

function sourceMatches(source: string, url: URL, selfOrigin: string | null): boolean {
  if (source === "'self'") return selfOrigin !== null && url.origin === selfOrigin;
  if (source === '*') return url.protocol === 'https:' || url.protocol === 'http:';
  if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) return url.protocol === source.toLowerCase();
  const host = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*|(?:\*\.)?[^/:']+)(?::\d+)?(?:\/.*)?$/i.exec(
    source,
  );
  if (!host) return false;
  const [, scheme, pattern = ''] = host;
  if (scheme && `${scheme.toLowerCase()}:` !== url.protocol) return false;
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) return url.hostname.endsWith(pattern.slice(1));
  return url.hostname === pattern.toLowerCase();
}

function allows(csp: string, directive: string, target: string, selfOrigin: string | null) {
  const policy = directives(csp);
  const sources = policy.get(directive) ?? policy.get('default-src') ?? [];
  const url = new URL(target);
  return sources.some((source) => sourceMatches(source, url, selfOrigin));
}

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name as string, values];
      }),
  );
}

describe('artifact CSP lockstep', () => {
  it('finds the renderer meta policy', () => {
    expect(extractMetaCspContent(rendererHtml)).not.toBeNull();
  });

  it('keeps the renderer meta byte-identical to ARTIFACT_RENDERER_CSP_CONTENT', () => {
    expect(extractMetaCspContent(rendererHtml)).toBe(ARTIFACT_RENDERER_CSP_CONTENT);
  });

  it('allows the same script hosts on the renderer and the srcDoc fallback', () => {
    const renderer = directives(ARTIFACT_RENDERER_CSP_CONTENT).get('script-src') ?? [];
    const fallback = directives(ARTIFACT_CSP_CONTENT).get('script-src') ?? [];
    const hosts = (values: string[]) => values.filter((value) => value.startsWith('https://'));
    expect(hosts(renderer)).toEqual([...ARTIFACT_SCRIPT_CDN_HOSTS]);
    expect(hosts(fallback)).toEqual(hosts(renderer));
  });

  it('differs from the renderer policy only by the origin-scoped sources', () => {
    const renderer = directives(ARTIFACT_RENDERER_CSP_CONTENT);
    const fallback = directives(ARTIFACT_CSP_CONTENT);
    expect([...fallback.keys()]).toEqual([...renderer.keys()]);
    for (const [name, rendererValues] of renderer) {
      const expected =
        name === 'frame-src' ? ["'none'"] : rendererValues.filter((value) => value !== "'self'");
      expect(fallback.get(name), name).toEqual(expected);
    }
  });

  it('never lets the same-page fallback keep self as a source', () => {
    expect(ARTIFACT_CSP_CONTENT).not.toContain("'self'");
  });

  it('locks the invariants the isolation argument depends on', () => {
    for (const csp of [ARTIFACT_RENDERER_CSP_CONTENT, ARTIFACT_CSP_CONTENT]) {
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("connect-src 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("form-action 'none'");
      expect(csp).not.toContain('frame-ancestors');
    }
  });

  it('threads extra script sources through without disturbing the rest', () => {
    const extended = buildArtifactCspContent(['https://unpkg.com/x']);
    expect(directives(extended).get('script-src')).toEqual([
      ...(directives(ARTIFACT_CSP_CONTENT).get('script-src') ?? []),
      'https://unpkg.com/x',
    ]);
  });
});

describe('artifact CSP resource egress', () => {
  const policies = [ARTIFACT_RENDERER_CSP_CONTENT, ARTIFACT_CSP_CONTENT, deployedSandboxCsp()];

  it('loads images, stylesheets and fonts only from data:, blob:, its own origin and the vetted CDN hosts', () => {
    const renderer = directives(ARTIFACT_RENDERER_CSP_CONTENT);
    const hosts = [...ARTIFACT_SCRIPT_CDN_HOSTS];
    expect(renderer.get('img-src')).toEqual(["'self'", 'data:', 'blob:', ...hosts]);
    expect(renderer.get('style-src')).toEqual(["'self'", "'unsafe-inline'", ...hosts]);
    expect(renderer.get('font-src')).toEqual(["'self'", 'data:', ...hosts]);
  });

  it('blocks an injected image, stylesheet or font on any other https host', () => {
    for (const csp of policies) {
      for (const directive of RESOURCE_DIRECTIVES) {
        expect(allows(csp, directive, INJECTED_URL, SANDBOX_ORIGIN), `${directive} in ${csp}`).toBe(
          false,
        );
        expect(allows(csp, directive, 'http://attacker.example/x', SANDBOX_ORIGIN)).toBe(false);
      }
      expect(allows(csp, 'connect-src', INJECTED_URL, SANDBOX_ORIGIN)).toBe(false);
    }
  });

  it('still loads data:, blob: and same-origin images', () => {
    for (const csp of [ARTIFACT_RENDERER_CSP_CONTENT, ARTIFACT_CSP_CONTENT]) {
      expect(allows(csp, 'img-src', 'data:image/png;base64,iVBORw0KGgo=', null)).toBe(true);
      expect(allows(csp, 'img-src', `blob:${SANDBOX_ORIGIN}/5f0c6b1e`, null)).toBe(true);
    }
    expect(
      allows(
        ARTIFACT_RENDERER_CSP_CONTENT,
        'img-src',
        `${SANDBOX_ORIGIN}/logo.png`,
        SANDBOX_ORIGIN,
      ),
    ).toBe(true);
  });

  it('still loads scripts, stylesheets, images and fonts from every vetted CDN host', () => {
    for (const csp of [ARTIFACT_RENDERER_CSP_CONTENT, ARTIFACT_CSP_CONTENT]) {
      for (const host of ARTIFACT_SCRIPT_CDN_HOSTS) {
        for (const directive of ['script-src', ...RESOURCE_DIRECTIVES]) {
          expect(allows(csp, directive, `${host}/npm/lib@1.0.0/dist/file`, null), directive).toBe(
            true,
          );
        }
      }
    }
  });

  it('serves the sandbox deployment header no laxer than the renderer policy', () => {
    const renderer = directives(ARTIFACT_RENDERER_CSP_CONTENT);
    for (const [name, values] of directives(deployedSandboxCsp())) {
      if (name === 'frame-ancestors') continue;
      const allowed = renderer.get(name);
      expect(allowed, `${name} is missing from the renderer policy`).toBeDefined();
      expect(
        values.filter((value) => !allowed?.includes(value)),
        name,
      ).toEqual([]);
    }
  });
});
