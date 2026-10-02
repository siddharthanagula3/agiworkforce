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

describe('web ratings stored with a copy of the rated answer', () => {
  it('replaces the copy with the note a web rating carries now', () => {
    expect(migration).toMatch(/update public\.feedback\s+set message = '([^']+)'/);
    expect(/set message = '([^']+)'/.exec(migration)?.[1]).toBe(WEB_RESPONSE_RATING_MESSAGE);
  });

  it('touches only web response ratings', () => {
    expect(migration).toContain("metadata ->> 'feedback_context' = 'response_rating'");
    expect(migration).toContain("metadata ->> 'source' = 'web'");
    expect(migration.match(/\bupdate\b/gi)).toHaveLength(1);
    expect(migration).not.toMatch(/\bdelete\b/i);
  });

  it('has no reversal that could put answer text back', () => {
    expect(reversal).not.toMatch(/\bupdate\b/i);
    expect(reversal).toContain(`where filename = '${MIGRATION}.sql'`);
  });
});
