import { describe, expect, it } from 'vitest';
import { buildSandboxedHtml, __ARTIFACT_SANDBOX_INTERNALS } from './artifact-sandbox';

const { CSP_META } = __ARTIFACT_SANDBOX_INTERNALS;

/**
 * Returns true when the CSP <meta> sits inside <head>. Browsers ignore a CSP
 * delivered anywhere else, so the policy's position IS the security property —
 * merely asserting the tag is present would pass while the sandbox runs
 * unprotected.
 */
function cspIsInsideHead(html: string): boolean {
  const headOpen = html.search(/<head\b[^>]*>/i);
  const headClose = html.search(/<\/head>/i);
  const csp = html.indexOf(CSP_META);
  if (headOpen === -1 || headClose === -1 || csp === -1) return false;
  return csp > headOpen && csp < headClose;
}

describe('buildSandboxedHtml', () => {
  it('puts the CSP inside <head> for a bare fragment', () => {
    expect(cspIsInsideHead(buildSandboxedHtml('<p>hi</p>'))).toBe(true);
  });

  it('puts the CSP inside <head> for a full document', () => {
    const html = '<!doctype html><html><head><title>t</title></head><body>x</body></html>';
    expect(cspIsInsideHead(buildSandboxedHtml(html))).toBe(true);
  });

  it('puts the CSP inside <head> for a document with <html> but no <head>', () => {
    expect(cspIsInsideHead(buildSandboxedHtml('<html><body>x</body></html>'))).toBe(true);
  });

  it('puts the CSP inside <head> for a doctype with no <html> or <head>', () => {
    // Regression: this shape reached the fallback branch, which prepended the
    // meta ahead of the markup. Outside <head> the policy is discarded, so the
    // sandbox executed model-generated code with no CSP at all.
    expect(cspIsInsideHead(buildSandboxedHtml('<!doctype html><body>x</body>'))).toBe(true);
  });

  it('strips an artifact-supplied CSP so it cannot widen ours', () => {
    const hostile =
      '<!doctype html><html><head>' +
      `<meta http-equiv="Content-Security-Policy" content="default-src *">` +
      '</head><body>x</body></html>';
    const out = buildSandboxedHtml(hostile);
    expect(out).not.toContain('default-src *');
    expect(cspIsInsideHead(out)).toBe(true);
  });
});
