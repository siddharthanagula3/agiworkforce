import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { WEB_RESPONSE_RATING_MESSAGE } from '@/app/api/feedback/response-rating-contract';

const MIGRATION = '0353_feedback_ratings_drop_answer_text';
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

const cleanup = () => statement(/^update public\.feedback\b[^;]*;/m);
const trigger = () => statement(/^create trigger \w+[^;]*;/m);

describe('web ratings stored with a copy of the rated answer', () => {
  it('replaces the copy with the note a web rating carries now', () => {
    expect(/set message = '([^']+)'/.exec(cleanup())?.[1]).toBe(WEB_RESPONSE_RATING_MESSAGE);
  });

  it('touches only web response ratings', () => {
    expect(cleanup()).toContain("metadata ->> 'feedback_context' = 'response_rating'");
    expect(cleanup()).toContain("metadata ->> 'source' = 'web'");
    expect(migration.match(/\bupdate\b/gi)).toHaveLength(1);
    expect(migration).not.toMatch(/\bdelete\b/i);
  });

  it('leaves a web rating the route marked alone, so a stored comment is never replaced', () => {
    expect(cleanup()).toContain("and not (metadata ? 'message_source')");
  });

  it('gives a web rating an older build writes after it the note, not the answer it copied', () => {
    expect(trigger()).toMatch(/\bbefore insert on public\.feedback\s+for each row\b/);
    expect(trigger()).toContain("new.metadata ->> 'feedback_context' = 'response_rating'");
    expect(trigger()).toContain("new.metadata ->> 'source' = 'web'");
    expect(trigger()).toContain("not (new.metadata ? 'message_source')");
    const handler = /execute function public\.(\w+)\(\)/.exec(trigger())?.[1] ?? '';
    const body = statement(
      new RegExp(`create or replace function public\\.${handler}\\(\\)[\\s\\S]*?\\$\\$;`),
    );
    expect(/new\.message := '([^']+)'/.exec(body)?.[1]).toBe(WEB_RESPONSE_RATING_MESSAGE);
  });

  it('holds new writes back before it replaces the copies, so none lands in between', () => {
    expect(migration.indexOf(trigger())).toBeLessThan(migration.indexOf(cleanup()));
  });

  it('has no reversal that could put answer text back', () => {
    expect(reversal).not.toMatch(/\bupdate\b/i);
    expect(reversal).toContain(`where filename = '${MIGRATION}.sql'`);
  });
});
