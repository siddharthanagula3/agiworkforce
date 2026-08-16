import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cloud sync and search index migrations', () => {
  const dir = join(process.cwd(), 'db/neon');

  async function chainSql(): Promise<string> {
    const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
    const sources = await Promise.all(files.map((name) => readFile(join(dir, name), 'utf8')));
    return sources.join('\n').toLowerCase().replace(/\s+/g, ' ');
  }

  const ownerScoped = ['web_conversations', 'web_artifacts', 'user_projects', 'user_memories'];

  const MESSAGES_VERSION_INDEX = 'idx_web_messages_server_version';

  it('indexes every owner-carrying delta pull by owner first, then version', async () => {
    const sql = await chainSql();
    for (const table of ownerScoped) {
      expect(sql, `${table} has no owner-scoped server_version index`).toMatch(
        new RegExp(
          `create index (if not exists )?\\S+ on public\\.${table} ?\\(user_id, server_version\\)`,
        ),
      );
    }
  });

  it('drops every single-column server_version index except the web_messages one', async () => {
    const sql = await chainSql();
    const created = [
      ...sql.matchAll(
        /create index (?:if not exists )?(\S+) on public\.(\w+) ?\(server_version\)/g,
      ),
    ].map((match) => ({ name: match[1]!, table: match[2]! }));

    expect(
      created.length,
      'expected the 0038–0042 unscoped indexes to still be in history',
    ).toBeGreaterThan(0);
    expect(
      created.map((index) => index.name),
      'the web_messages version index must still be created by the chain',
    ).toContain(MESSAGES_VERSION_INDEX);

    const dropped = (name: string) =>
      new RegExp(`drop index (?:if exists )?(?:public\\.)?${name} ?;`).test(sql);

    for (const index of created) {
      if (index.name === MESSAGES_VERSION_INDEX) {
        expect(
          dropped(index.name),
          'dropping idx_web_messages_server_version removes the only sort-free plan for the message delta pull',
        ).toBe(false);
        continue;
      }
      expect(dropped(index.name), `${index.name} is created but never dropped`).toBe(true);
    }
  });

  it('backs the leading-wildcard search predicates with trigram indexes', async () => {
    const sql = await chainSql();
    expect(sql).toContain('create extension if not exists pg_trgm');
    for (const target of [
      'public.web_messages using gin (content gin_trgm_ops)',
      'public.web_conversations using gin (title gin_trgm_ops)',
      'public.user_memories using gin (content gin_trgm_ops)',
    ]) {
      expect(sql).toContain(target);
    }
  });
});
