import { describe, expect, it } from 'vitest';
import {
  PUBLISHED_SANDBOX_KINDS,
  buildPublishedFallbackSrcDoc,
  buildPublishedSandboxPayload,
  buildPublishedSvgImageSrc,
  isSandboxedPublishedKind,
} from './publishedArtifactRender';

describe('sandbox policy', () => {
  it('sandboxes exactly the kinds that execute author-supplied script', () => {
    expect([...PUBLISHED_SANDBOX_KINDS].sort()).toEqual(['html', 'mermaid', 'react']);
    for (const kind of ['html', 'react', 'mermaid'] as const) {
      expect(isSandboxedPublishedKind(kind)).toBe(true);
    }
    for (const kind of ['svg', 'markdown', 'text', 'code'] as const) {
      expect(isSandboxedPublishedKind(kind)).toBe(false);
    }
  });
});

describe('buildPublishedSandboxPayload', () => {
  it('ships React source verbatim so Babel receives JSX, not escaped markup', () => {
    const source = 'const App = () => <div>hi</div>;';
    expect(buildPublishedSandboxPayload('react', source)).toEqual({
      type: 'render',
      kind: 'react',
      code: source,
    });
  });

  it('marks html as script-running and pre-builds the sandbox document', () => {
    const payload = buildPublishedSandboxPayload('html', '<h1>hi</h1>');
    expect(payload.kind).toBe('html');
    expect(payload.runScripts).toBe(true);
    expect(payload.html).toContain('<!DOCTYPE html>');
    expect(payload.html).toContain('Content-Security-Policy');
  });

  it('degrades an inert kind to text rather than promoting it to a script path', () => {
    const payload = buildPublishedSandboxPayload('markdown', '# hi');
    expect(payload.kind).toBe('text');
    expect(payload.runScripts).toBeUndefined();
  });
});

describe('buildPublishedFallbackSrcDoc', () => {
  it('carries the CSP envelope on every document it produces', () => {
    for (const kind of ['html', 'react', 'mermaid', 'code', 'text'] as const) {
      expect(buildPublishedFallbackSrcDoc(kind, 'x')).toContain('Content-Security-Policy');
    }
  });

  it('pins connect-src to none so a published page cannot exfiltrate', () => {
    expect(buildPublishedFallbackSrcDoc('react', 'const App = () => null;')).toContain(
      "connect-src 'none'",
    );
  });

  it('escapes mermaid source so markup in a diagram stays inert', () => {
    const doc = buildPublishedFallbackSrcDoc('mermaid', 'graph TD; A["<img onerror=alert(1)>"]');
    expect(doc).not.toContain('<img onerror');
    expect(doc).toContain('&lt;img onerror');
  });

  it('escapes plain code instead of interpolating it as markup', () => {
    const doc = buildPublishedFallbackSrcDoc('code', '<script>alert(1)</script>');
    expect(doc).toContain('&lt;script&gt;');
    expect(doc).not.toContain('<script>alert(1)</script>');
  });

  it('neutralises a </script> sequence in React source', () => {
    const doc = buildPublishedFallbackSrcDoc('react', 'const s = "</script><img src=x>";');
    expect(doc).toContain('<\\/script>');
  });
});

describe('buildPublishedSvgImageSrc', () => {
  it('produces an inert data: URL rather than injectable markup', () => {
    const src = buildPublishedSvgImageSrc('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>');
    expect(src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('strips script from the SVG before it is ever encoded', () => {
    const src = buildPublishedSvgImageSrc(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect /></svg>',
    );
    expect(decodeURIComponent((src ?? '').split(',')[1] ?? '')).not.toContain('alert(1)');
  });

  it('returns null when sanitisation leaves nothing to show', () => {
    expect(buildPublishedSvgImageSrc('   ')).toBeNull();
  });
});
