import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { NOTIFICATION_CATEGORIES, NOTIFICATION_TARGET_KINDS } from '@agiworkforce/types';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0199_notification_feed_targets.sql'),
  'utf8',
);

function constraintValues(column: string): string[] {
  const body = new RegExp(
    `add constraint notifications_${column}_check\\s+check \\(${column} in \\(([\\s\\S]*?)\\)\\)`,
  ).exec(migration)?.[1];
  expect(body).toBeDefined();
  return [...(body ?? '').matchAll(/'([a-z_-]+)'/g)].map((match) => match[1] ?? '');
}

describe('notification feed contract', () => {
  it('constrains the column to exactly the categories the contract publishes', () => {
    expect(constraintValues('category').sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
  });

  it('keeps every target kind a surface may be asked to resolve', () => {
    expect(NOTIFICATION_TARGET_KINDS).toContain('chat');
    expect(NOTIFICATION_TARGET_KINDS).toContain('schedule');
    expect(new Set(NOTIFICATION_TARGET_KINDS).size).toBe(NOTIFICATION_TARGET_KINDS.length);
  });
});
