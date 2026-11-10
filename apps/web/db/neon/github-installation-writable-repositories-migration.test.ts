import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0412_github_installation_writable_repositories.sql');
const down = read('down/0412_github_installation_writable_repositories.down.sql');
const linker = readFileSync(
  resolve(import.meta.dirname, '../../lib/github-install-app-return.ts'),
  'utf8',
);
const reader = readFileSync(
  resolve(import.meta.dirname, '../../lib/user-connector-tools.ts'),
  'utf8',
);

describe('0412 github installation writable repositories', () => {
  it('adds a nullable set the linker writes and the installation reader selects', () => {
    expect(up).toContain('alter table public.github_installations');
    expect(up).toContain('add column if not exists writable_repositories text[];');
    expect(up).not.toMatch(/writable_repositories text\[\]\s+(not null|default)/);
    expect(linker).toContain('writable_repositories = excluded.writable_repositories');
    expect(reader).toContain('verified_repositories, writable_repositories');
  });

  it('is a draft inside one transaction', () => {
    expect(up).toContain('NOT YET APPLIED');
    expect(up).toMatch(/\nbegin;[\s\S]*\ncommit;\s*$/);
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('drop column if exists writable_repositories;');
    expect(down).toContain(
      "where filename = '0412_github_installation_writable_repositories.sql';",
    );
    expect(down).toMatch(/\nbegin;[\s\S]*\ncommit;\s*$/);
  });
});
