/**
 * The security-critical part of SafeArtifactPreview is the sandboxed-document
 * builder: it MUST wrap untrusted artifact markup with a strict CSP that blocks
 * script execution and network egress. (JS execution itself is separately killed
 * by the component's `javaScriptEnabled={false}`.)
 */
import { buildSandboxedArtifactHtml } from '../src/features/chat/components/sandboxedArtifactHtml';

describe('buildSandboxedArtifactHtml', () => {
  it('injects a strict Content-Security-Policy that blocks external loads by default', () => {
    const html = buildSandboxedArtifactHtml('<p>hi</p>', 'html');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    // No blanket script/connect permissions that would allow exfiltration.
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
    // The script text is present as data, but default-src 'none' + no script-src
    // means it can neither run nor reach the network; the component also disables JS.
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/script-src/i);
  });
});
