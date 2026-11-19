import { describe, expect, it } from 'vitest';
import { ARTIFACT_CSP_CONTENT, extractMetaCspContent } from '@agiworkforce/types';
import { buildSandboxedHtml } from './artifact-sandbox';

const EVERY_HOST_RESOURCE_SOURCE =
  /\b(?:img|style|font)-src\b[^;"]*\s(?:https?:(?:\/\/\*)?|\*)(?=[\s;"]|$)/;

function cspIsInsideHead(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const metas = doc.head.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
  return metas.length === 1 && metas[0]!.getAttribute('content') === ARTIFACT_CSP_CONTENT;
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

  it.each([
    [
      'a commented-out <head>',
      '<!doctype html><!--<head>--><html><head></head><body>x</body></html>',
    ],
    ['a commented-out <html>', '<!--<html>--><body>x</body>'],
    [
      'a <head> inside an early script',
      '<!doctype html><html><script>"<head>"</script><body>x</body></html>',
    ],
    [
      'markup between two comments and a late doctype',
      '<!-- a --><html><head></head><body><img src="https://attacker.example/leak"><!-- b --><!doctype html>',
    ],
    [
      'a no-break space before the doctype',
      ' <!doctype html><img src="https://attacker.example/leak">',
    ],
  ])('keeps the CSP in the parsed <head> for a document with %s', (_label, html) => {
    const doc = new DOMParser().parseFromString(buildSandboxedHtml(html), 'text/html');
    const meta = doc.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
    expect(meta?.getAttribute('content')).toBe(ARTIFACT_CSP_CONTENT);
    for (const element of doc.querySelectorAll('script, link, style, img, iframe')) {
      expect(
        meta!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it.each([
    ['a leading comment', '<!-- copyright -->\n<!doctype html><html><body>x</body></html>'],
    ['several comments', '<!-- a -->\n<!--->\n<!-->\n<!doctype html><body>x</body>'],
    ['a comment closed with --!>', '<!-- a --!><!DOCTYPE html><body>x</body>'],
  ])('keeps standards mode for a document that opens with %s', (_label, html) => {
    const doc = new DOMParser().parseFromString(buildSandboxedHtml(html), 'text/html');
    expect(doc.doctype?.name).toBe('html');
    expect(doc.compatMode).toBe('CSS1Compat');
    expect(cspIsInsideHead(buildSandboxedHtml(html))).toBe(true);
  });

  it('handles a long run of leading comments without a doctype', () => {
    const html = `${'<!-- x -->'.repeat(200)}<html><body><img src="https://attacker.example/leak"></body></html>`;
    expect(cspIsInsideHead(buildSandboxedHtml(html))).toBe(true);
  });

  it('keeps the CSP ahead of a script hidden behind an unterminated comment', () => {
    const html = '<!-- open <script>alert(1)</script><!doctype html><body>x</body>';
    const doc = new DOMParser().parseFromString(buildSandboxedHtml(html), 'text/html');
    expect(doc.querySelector('script')).toBeNull();
    expect(cspIsInsideHead(buildSandboxedHtml(html))).toBe(true);
  });

  it('loads no image, stylesheet or font from an arbitrary https host', () => {
    const csp = extractMetaCspContent(buildSandboxedHtml('<p>x</p>'));
    expect(csp).toBe(ARTIFACT_CSP_CONTENT);
    expect(csp).not.toMatch(EVERY_HOST_RESOURCE_SOURCE);
  });
});
