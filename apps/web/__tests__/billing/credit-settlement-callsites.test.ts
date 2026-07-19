import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('durable post-provider credit settlements', () => {
  it.each([
    'app/api/media/image/generate/route.ts',
    'app/api/media/video/generate/route.ts',
    'app/api/llm/v1/chat/completions/route.ts',
    'app/api/llm/v1/chat/completions/lib/response-builder.ts',
    'app/api/llm/v1/chat/completions/lib/stream-transform.ts',
  ])('%s has no alternate legacy deduction or settlement path', (path) => {
    const contents = source(path);

    expect(contents).not.toMatch(/CreditService\.(deductCredits|settleCreditsDurably)\(/);
  });

  it.each(['app/api/media/image/generate/route.ts', 'app/api/media/video/generate/route.ts'])(
    '%s uses the shared managed reservation lifecycle',
    (path) => {
      const contents = source(path);

      expect(contents).toMatch(/reserveManagedUsageRequest\(/);
      expect(contents).toMatch(/markManagedUsageProviderStarted\(/);
      expect(contents).toMatch(/finalizeManagedUsageRequest\(/);
      expect(contents).toMatch(/markManagedUsageClientDelivered\(/);
    },
  );

  it.each([
    'app/api/mission/route.ts',
    'app/api/v1/providers/[providerId]/stream/route.ts',
    'app/api/agents/execute/route.ts',
  ])('%s performs no credit operations after retirement', (path) => {
    const contents = source(path);

    expect(contents).not.toMatch(/CreditService\.(deductCredits|settleCreditsDurably)\(/);
  });
});
