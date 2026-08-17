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

const rendererHtml = readFileSync(RENDERER_HTML_PATH, 'utf8');

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
