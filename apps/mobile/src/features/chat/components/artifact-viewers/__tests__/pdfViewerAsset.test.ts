import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ASSET_DIR = join(__dirname, '../../../../../../assets/pdfjs');
const viewer: { pdfjsVersion: string; html: string } = JSON.parse(
  readFileSync(join(ASSET_DIR, 'pdf-viewer.json'), 'utf8'),
);
const template = readFileSync(join(ASSET_DIR, 'viewer.template.html'), 'utf8');
const SCRIPT_ELEMENT = /<script\b[^>]*>([\s\S]*?)<\/script(?:[\s/][^>]*)?>/gi;

function scriptElements(html: string): { bodies: string[]; shell: string } {
  const bodies: string[] = [];
  let shell = '';
  let end = 0;
  for (const element of html.matchAll(SCRIPT_ELEMENT)) {
    bodies.push(element[1]!);
    shell += html.slice(end, element.index);
    end = element.index + element[0].length;
  }
  return { bodies, shell: shell + html.slice(end) };
}

function contentSecurityPolicy(): Map<string, string> {
  const meta = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(viewer.html);
  const directives = new Map<string, string>();
  for (const part of (meta?.[1] ?? '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name, sources.join(' '));
  }
  return directives;
}

describe('bundled pdf.js viewer', () => {
  it('is one page with its scripts inline and nothing to fetch', () => {
    const scripts = viewer.html.match(/<script\b[^>]*>/gi) ?? [];
    const { bodies, shell } = scriptElements(viewer.html);

    expect(scripts).toEqual([
      '<script type="module">',
      '<script type="module">',
      '<script type="module">',
    ]);
    expect(bodies).toHaveLength(scripts.length);
    expect(shell).not.toMatch(/<\/?script\b/i);
    expect(shell).not.toMatch(/<(link|iframe|object|embed|img|form|a|base)\b/i);
    expect(shell).not.toMatch(/\b(?:src|href|action)\s*=/i);
    expect(shell).not.toMatch(/https?:|\/\/[a-z]/i);
  });

  it('forbids every network address and remote script through its content security policy', () => {
    const policy = contentSecurityPolicy();

    expect(policy.get('default-src')).toBe("'none'");
    expect(policy.get('script-src')).toBe("'unsafe-inline'");
    expect(policy.get('connect-src')).toBe('blob: data:');
    expect(policy.get('img-src')).toBe('blob: data:');
    expect(policy.get('font-src')).toBe('blob: data:');
    expect(policy.get('form-action')).toBe("'none'");
    expect(policy.get('base-uri')).toBe("'none'");
    for (const sources of policy.values()) expect(sources).not.toMatch(/https?:|\*|unsafe-eval/);
  });

  it('runs the worker on the page, so it never opens a worker or loads a worker file', () => {
    expect(viewer.html).toContain('globalThis.pdfjsWorker=');
    expect(viewer.html).toContain('globalThis.pdfjsLib=');
    expect(viewer.html).toContain('isEvalSupported: false');
    expect(viewer.html).toContain('useWasm: false');
    expect(viewer.html).toContain('useWorkerFetch: false');
  });

  it('carries the viewer script of its template, so the two cannot drift apart', () => {
    const { bodies } = scriptElements(template);
    const script = (bodies.at(-1) ?? '').trim();

    expect(script.startsWith('{')).toBe(true);
    expect(viewer.html).toContain(script);
    expect(viewer.html).not.toContain('__PDFJS_');
  });

  it('keeps the licence of the library and says which version it is', () => {
    expect(viewer.pdfjsVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(viewer.html).toContain('Apache License, Version 2.0');
    expect(existsSync(join(ASSET_DIR, 'LICENSE'))).toBe(true);
    expect(readFileSync(join(ASSET_DIR, 'LICENSE'), 'utf8')).toContain('Apache License');
  });
});
