import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const dir = path.join(process.cwd(), 'db/neon');
const MIGRATION = readdirSync(dir).find((name) =>
  name.endsWith('_conversation_chat_system_prompt_version.sql'),
);
if (!MIGRATION) throw new Error('the conversation chat system prompt version migration is missing');
const sql = readFileSync(path.join(dir, MIGRATION), 'utf8').replace(/--.*$/gm, '');

describe('conversation chat system prompt version migration', () => {
  it('only adds a nullable column, so the table lock lasts milliseconds', () => {
    expect(sql).toMatch(/add column if not exists chat_system_prompt_version smallint;/);
    expect(sql).not.toMatch(/\bdefault\b/i);
    expect(sql).not.toMatch(/^\s*update\b/im);
  });

  it('fails fast instead of queueing chats behind a contended lock', () => {
    expect(sql).toMatch(/set local lock_timeout = '5s'/);
    expect(sql.indexOf('set local lock_timeout')).toBeLessThan(sql.indexOf('alter table'));
  });
});
