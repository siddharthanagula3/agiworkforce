import {
  buildMermaidPreviewHtml,
  buildSandboxedArtifactHtml,
} from '../src/features/chat/components/sandboxedArtifactHtml';

describe('buildSandboxedArtifactHtml', () => {
  it('injects a strict Content-Security-Policy that blocks external loads by default', () => {
    const html = buildSandboxedArtifactHtml('<p>hi</p>', 'html');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/script-src[^;"]*'unsafe-inline'/i);
    expect(html).not.toContain("connect-src 'self'");
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

  it('does not execute — a <script> in the artifact is inert under the CSP (no script-src allowed)', () => {
    const html = buildSandboxedArtifactHtml(
      '<script>fetch("https://evil.example")</script>',
      'html',
    );
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/script-src/i);
  });
});

describe('buildMermaidPreviewHtml', () => {
  it('limits script-src to the single pinned mermaid CDN and renders in strict mode', () => {
    const html = buildMermaidPreviewHtml('graph TD; A-->B');
    expect(html).toContain('script-src https://cdn.jsdelivr.net');
    expect(html).not.toMatch(/script-src[^;"]*\*/);
    expect(html).toContain("securityLevel: 'strict'");
    expect(html).toContain('cdn.jsdelivr.net/npm/mermaid@11');
  });

  it('injects the untrusted diagram source as a data literal with < escaped (no script-tag break-out)', () => {
    const evil = 'a"; fetch("https://evil.example"); //</script><script>alert(1)</script>';
    const html = buildMermaidPreviewHtml(evil);
    expect(html).toContain('\\u003c/script>');
    expect(html).not.toContain('//</script><script>alert');
    expect(html).toContain('\\"; fetch(');
  });
});
