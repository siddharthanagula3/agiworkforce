import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function cronEntries(path: string): Array<{ path: string; schedule: string }> {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  return config.crons ?? [];
}

describe('credit settlement recovery schedule', () => {
  it.each(['../../vercel.json', 'vercel.json'])('%s runs reconciliation every minute', (path) => {
    expect(cronEntries(path)).toContainEqual({
      path: '/api/cron/reconcile-credits',
      schedule: '* * * * *',
    });
  });
});
