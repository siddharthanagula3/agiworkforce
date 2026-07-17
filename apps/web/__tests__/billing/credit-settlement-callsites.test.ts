import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function countCalls(contents: string, method: string): number {
  return contents.match(new RegExp(`CreditService\\.${method}\\(`, 'g'))?.length ?? 0;
}

describe('durable post-provider credit settlements', () => {
  it.each([
    ['app/api/media/image/generate/route.ts', 1, 2],
    ['app/api/media/video/generate/route.ts', 1, 1],
    ['app/api/mission/route.ts', 1, 2],
    ['app/api/v1/providers/[providerId]/stream/route.ts', 1, 1],
    ['app/api/llm/v1/chat/completions/route.ts', 0, 1],
    ['app/api/agents/execute/route.ts', 0, 1],
  ])(
    '%s keeps synchronous reservations separate from durable settlements',
    (path, sync, durable) => {
      const contents = source(path);

      expect(countCalls(contents, 'deductCredits')).toBe(sync);
      expect(countCalls(contents, 'settleCreditsDurably')).toBe(durable);
    },
  );
});
