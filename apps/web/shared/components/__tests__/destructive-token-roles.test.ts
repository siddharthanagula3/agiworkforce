import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');

function sourceFiles(): string[] {
  const out = execFileSync('git', ['ls-files', 'apps/web/**/*.tsx', 'packages/ui/**/*.tsx'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  // git tracks paths that may be deleted in the working tree; only read what exists.
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => existsSync(resolve(repoRoot, f)));
}

/**
 * `--settings-destructive-foreground` resolves near-white: it is the colour to
 * put ON a solid destructive fill, never a destructive text colour. Used as
 * `color:` on a normal card it measured ~1.04:1. `--settings-destructive-text`
 * is the readable red for that role.
 */
describe('destructive tokens are used in the role they were tuned for', () => {
  it('never paints text with the on-fill foreground unless a destructive fill is present', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const lines = readFileSync(resolve(repoRoot, file), 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!/color:\s*[^,;]*--settings-destructive-foreground/.test(line)) return;
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        const context = lines.slice(Math.max(0, index - 6), index + 5).join('\n');
        const onFill = /background(Color)?:\s*'var\(--settings-destructive[,)]/.test(context);
        if (!onFill) offenders.push(`${file}:${index + 1}`);
      });
    }

    expect(offenders, `use --settings-destructive-text for text:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });

  it('never paints text with the raw accent fill token', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const lines = readFileSync(resolve(repoRoot, file), 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        // `text-[var(--chat-accent-primary)]` and `color: 'var(--chat-accent-primary)'`
        // are the fill colour used as text; the readable variant is *-text.
        if (
          /text-\[var\(--chat-accent-primary\)\]/.test(line) ||
          /(?<![A-Za-z])color:\s*'var\(--chat-accent-primary[,)]/.test(line)
        ) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
    }

    expect(
      offenders,
      `use --chat-accent-primary-text for text, or --chat-accent-on-primary on the fill:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
