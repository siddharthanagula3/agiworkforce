import { describe, expect, it } from 'vitest';
import { ARTIFACT_CSP_CONTENT, extractMetaCspContent } from '@agiworkforce/types';
import { buildSandboxedHtml, __ARTIFACT_SANDBOX_INTERNALS } from './artifact-sandbox';

const { CSP_META } = __ARTIFACT_SANDBOX_INTERNALS;

const EVERY_HOST_RESOURCE_SOURCE =
  /\b(?:img|style|font)-src\b[^;"]*\s(?:https?:(?:\/\/\*)?|\*)(?=[\s;"]|$)/;

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

  it('loads no image, stylesheet or font from an arbitrary https host', () => {
    const csp = extractMetaCspContent(buildSandboxedHtml('<p>x</p>'));
    expect(csp).toBe(ARTIFACT_CSP_CONTENT);
    expect(csp).not.toMatch(EVERY_HOST_RESOURCE_SOURCE);
  });
});
