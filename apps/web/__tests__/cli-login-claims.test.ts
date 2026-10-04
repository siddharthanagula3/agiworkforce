import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');

const SURFACES = [
  'apps/web/content/support/install-the-cli.md',
  'apps/web/app/cli/page.tsx',
  'apps/cli/README.md',
] as const;

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

describe('agi login copy across the install article, /cli and the CLI README', () => {
  it.each(SURFACES)('%s shows the provider form of agi login', (path) => {
    expect(read(path)).toMatch(/agi login (?:<provider>|anthropic)/u);
  });

  it.each(SURFACES)('%s never describes a bare agi login as taking a key', (path) => {
    const offenders = read(path)
      .split(/\r?\n|(?<=[.;])\s+/u)
      .map((line) => line.replace(/agi login (?:<provider>|&lt;provider&gt;|anthropic)/gu, ''))
      .filter((line) => /agi login/u.test(line))
      .filter((line) => /API key|paste|OAuth, or|OAuth or/iu.test(line));
    expect(offenders).toEqual([]);
  });
});
