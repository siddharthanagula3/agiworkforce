import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '0355_user_memories_purge_deleted_text';
const migration = fs.readFileSync(path.resolve(import.meta.dirname, `${MIGRATION}.sql`), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, `down/${MIGRATION}.down.sql`),
  'utf8',
);

function statement(pattern: RegExp): string {
  const found = pattern.exec(migration)?.[0];
  if (!found) throw new Error(`${MIGRATION} has no statement matching ${pattern}`);
  return found;
}

const cleanup = () => statement(/^update public\.user_memories\b[^;]*;/m);
const trigger = () => statement(/^create trigger \w+[^;]*;/m);
const handler = () => {
  const name = /execute function public\.(\w+)\(\)/.exec(trigger())?.[1] ?? '';
  return statement(
    new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`),
  );
};

describe('deleted memories stored with their text', () => {
  it('clears the text, the category and the normalised import copy of every deleted memory', () => {
    expect(cleanup()).toContain("set content = '', category = null, import_key = null");
    expect(cleanup()).toMatch(/where is_deleted = true\b/);
  });

  it('touches only deleted memories and removes no row', () => {
    expect(migration.match(/\bupdate public\./gi)).toHaveLength(1);
    expect(migration).not.toMatch(/\bdelete\b/i);
  });

  it('clears the text of every later delete, whichever build or device sends it', () => {
    expect(trigger()).toMatch(
      /\bbefore insert or update on public\.user_memories\s+for each row\b/,
    );
    expect(trigger()).toContain('when (new.is_deleted)');
    expect(handler()).toContain("new.content := '';");
    expect(handler()).toContain('new.category := null;');
    expect(handler()).toContain('new.import_key := null;');
  });

  it('holds new deletes back before it clears the old ones, so none lands in between', () => {
    expect(migration.indexOf(trigger())).toBeLessThan(migration.indexOf(cleanup()));
  });

  it('has no reversal that could put memory text back', () => {
    expect(reversal).not.toMatch(/\bupdate\b/i);
    expect(reversal).toContain(`where filename = '${MIGRATION}.sql'`);
  });
});
