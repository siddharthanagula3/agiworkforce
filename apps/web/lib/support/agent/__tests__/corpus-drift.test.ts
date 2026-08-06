/**
 * The committed corpus artifact must match what the builder produces from the
 * content directory, byte for byte — and the builder's guards must actually
 * reject bad documents.
 *
 * Without the drift check, `corpus.generated.json` silently rots the moment
 * someone edits a markdown file and forgets to rebuild, and the agent starts
 * citing pages that no longer say what it claims.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..', '..', '..', '..');
const SCRIPT = join(WEB_ROOT, 'scripts', 'build-support-corpus.mjs');
const COMMITTED = join(WEB_ROOT, 'lib', 'support', 'agent', 'corpus.generated.json');

const workDir = mkdtempSync(join(tmpdir(), 'support-corpus-'));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Build from a throwaway content dir; returns stderr when the build fails. */
function buildFromDocument(markdown: string): { ok: boolean; message: string } {
  const contentDir = mkdtempSync(join(workDir, 'content-'));
  writeFileSync(join(contentDir, 'probe.md'), markdown, 'utf8');
  try {
    execFileSync(
      process.execPath,
      [SCRIPT, '--content', contentDir, '--out', join(contentDir, 'out.json')],
      { cwd: WEB_ROOT, stdio: 'pipe' },
    );
    return { ok: true, message: '' };
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
    return { ok: false, message: stderr };
  }
}

function documentWith(overrides: Partial<Record<string, string>> = {}): string {
  const frontmatter = {
    id: 'probe-doc',
    title: 'Probe document',
    path: '/help',
    category: 'probe',
    tags: 'probe, test',
    updated: '2026-08-05',
    scope: 'public',
    ...overrides,
  };
  const block = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return `---\n${block}\n---\n\n## A section\n\nSome body text for the probe document.\n`;
}

describe('support corpus artifact', () => {
  it('is byte-identical to a fresh build', () => {
    const out = join(workDir, 'corpus.generated.json');
    execFileSync(process.execPath, [SCRIPT, '--out', out], { cwd: WEB_ROOT });
    expect(readFileSync(out, 'utf8')).toBe(readFileSync(COMMITTED, 'utf8'));
  });

  it('passes its own --check mode', () => {
    const output = execFileSync(process.execPath, [SCRIPT, '--check'], {
      cwd: WEB_ROOT,
      encoding: 'utf8',
    });
    expect(output).toContain('up to date');
  });
});

describe('corpus builder guards', () => {
  it('accepts a well-formed document (guards the negative cases below)', () => {
    expect(buildFromDocument(documentWith()).ok).toBe(true);
  });

  it('rejects a path that does not resolve to a real page', () => {
    const result = buildFromDocument(documentWith({ path: '/not-a-real-route' }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not resolve to a real page');
  });

  it.each(['/settings/billing', '/admin', '/api/support', '/dev', '/user/profile'])(
    'rejects the non-public path %s',
    (path) => {
      const result = buildFromDocument(documentWith({ path }));
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/non-public prefix|does not resolve/);
    },
  );

  it('rejects a document that is not scoped public', () => {
    const result = buildFromDocument(documentWith({ scope: 'internal' }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('scope must be "public"');
  });

  it('rejects unknown frontmatter keys', () => {
    const result = buildFromDocument(documentWith({ secretFlag: 'yes' }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('unknown frontmatter key');
  });

  it('rejects a document missing required frontmatter', () => {
    const result = buildFromDocument(
      '---\nid: probe\n---\n\n## Section\n\nBody.\n'.replace('probe', 'probe-doc'),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('missing required frontmatter key');
  });

  it('rejects a path escaping the app directory', () => {
    const result = buildFromDocument(documentWith({ path: '/../../etc' }));
    expect(result.ok).toBe(false);
  });
});
