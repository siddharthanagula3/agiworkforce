import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * WEB-13 (audit 2026-05-19): regression test. Fails CI if any TSX/TS file
 * under `apps/web/` reintroduces `sandbox="allow-scripts allow-same-origin"`.
 * That combination defeats the iframe sandbox per the W3C spec — scripts
 * inside the iframe run with the parent's cookies and same-origin fetch
 * credentials. The fix is either the cross-origin sandbox subdomain
 * (NEXT_PUBLIC_SANDBOX_ORIGIN) or `sandbox="allow-scripts"` alone.
 *
 * This test runs as a pure file-system grep so it executes in CI without
 * spinning up a real browser.
 */

const WEB_ROOT = join(__dirname, '..', '..');
const DESKTOP_ROOT = join(WEB_ROOT, '..', 'desktop');

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  '.cache',
  '.vercel',
  'dist',
  'dist-web',
  'out',
  'playwright-report',
  'test-results',
  'public',
  '__tests__',
]);

const VALID_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html'];

function walk(dir: string): string[] {
  const entries: string[] = [];
  let items: string[];
  try {
    items = readdirSync(dir);
  } catch {
    return entries;
  }
  for (const item of items) {
    if (IGNORE_DIRS.has(item)) continue;
    const full = join(dir, item);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      entries.push(...walk(full));
    } else if (VALID_EXTENSIONS.some((ext) => item.endsWith(ext))) {
      entries.push(full);
    }
  }
  return entries;
}

describe('iframe-sandbox regression (WEB-13)', () => {
  it('no source file contains `allow-scripts allow-same-origin` together', () => {
    const files = walk(WEB_ROOT);
    const offenders: { file: string; line: number; content: string }[] = [];

    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      // Look for the W3C-spec-defeating combination, in any order, with
      // arbitrary whitespace between tokens. Allow tokens to appear in any
      // order so e.g. "allow-same-origin allow-scripts" is also flagged.
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        // Skip comment-only lines (JSDoc/multiline, single-line, HTML comment)
        // to avoid flagging this test's own docstring + the helper modules
        // that legitimately reference the bad pattern in prose.
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('<!--')) {
          continue;
        }
        if (
          /sandbox\s*=\s*"[^"]*\ballow-scripts\b[^"]*\ballow-same-origin\b[^"]*"/.test(line) ||
          /sandbox\s*=\s*"[^"]*\ballow-same-origin\b[^"]*\ballow-scripts\b[^"]*"/.test(line) ||
          /sandbox\s*=\s*'[^']*\ballow-scripts\b[^']*\ballow-same-origin\b[^']*'/.test(line) ||
          /sandbox\s*=\s*'[^']*\ballow-same-origin\b[^']*\ballow-scripts\b[^']*'/.test(line)
        ) {
          offenders.push({ file, line: i + 1, content: line.trim() });
        }
      }
    }

    if (offenders.length > 0) {
      const msg = offenders.map((o) => `  ${o.file}:${o.line}: ${o.content}`).join('\n');
      throw new Error(
        `WEB-13 regression — iframe sandbox combines allow-scripts + allow-same-origin:\n${msg}\n\n` +
          `This combination defeats the iframe sandbox per the W3C spec. Either ` +
          `use the cross-origin sandbox subdomain (infrastructure/sandbox) or sandbox="allow-scripts" alone.`,
      );
    }

    expect(offenders).toEqual([]);
  });

  it('dynamic iframe creation assigns a sandbox before use', () => {
    const files = [...walk(WEB_ROOT), ...walk(DESKTOP_ROOT)];
    const offenders: { file: string; line: number; content: string }[] = [];

    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!/createElement\(\s*['"]iframe['"]\s*\)/.test(line)) continue;

        const windowText = lines.slice(i, i + 8).join('\n');
        const hasSandbox =
          /\.sandbox\s*=/.test(windowText) || /\.setAttribute\(\s*['"]sandbox['"]/.test(windowText);

        if (!hasSandbox) {
          offenders.push({ file, line: i + 1, content: line.trim() });
        }
      }
    }

    if (offenders.length > 0) {
      const msg = offenders.map((o) => `  ${o.file}:${o.line}: ${o.content}`).join('\n');
      throw new Error(
        `iframe sandbox regression — dynamic iframe creation without sandbox assignment:\n${msg}`,
      );
    }

    expect(offenders).toEqual([]);
  });

  it('does not create executable text/html Blob URLs from web source', () => {
    const files = walk(WEB_ROOT);
    const offenders: { file: string; line: number; content: string }[] = [];

    for (const file of files) {
      if (file.endsWith('eslint.config.mjs')) continue;

      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('<!--')) {
          continue;
        }
        if (!/new\s+Blob\s*\(/.test(line)) continue;

        const windowText = lines.slice(i, i + 6).join('\n');
        if (/type\s*:\s*['"]text\/html['"]/.test(windowText)) {
          offenders.push({ file, line: i + 1, content: line.trim() });
        }
      }
    }

    if (offenders.length > 0) {
      const msg = offenders.map((o) => `  ${o.file}:${o.line}: ${o.content}`).join('\n');
      throw new Error(
        `HTML Blob regression — source creates executable text/html Blob URLs:\n${msg}\n\n` +
          `Render untrusted HTML in SandboxedIframe and use text/plain for source-view Blob URLs.`,
      );
    }

    expect(offenders).toEqual([]);
  });
});
