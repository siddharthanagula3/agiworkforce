import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function appRoot(): string {
  const direct = process.cwd();
  if (existsSync(join(direct, 'db/neon'))) return direct;
  const nested = join(direct, 'apps/web');
  if (existsSync(join(nested, 'db/neon'))) return nested;
  throw new Error(`Could not locate apps/web from ${direct}`);
}

const APP_ROOT = appRoot();

const METERED_ROUTES = [
  'app/api/llm/v1/chat/completions/route.ts',
  'app/api/llm/v1/chat/completions/approve/route.ts',
  'app/api/llm/v1/embeddings/route.ts',
  'app/api/llm/v1/audio/transcriptions/route.ts',
  'app/api/media/image/generate/route.ts',
  'app/api/media/video/generate/route.ts',
] as const;

function source(relative: string): string {
  return readFileSync(join(APP_ROOT, relative), 'utf8');
}

describe('spend limit covers every metered route', () => {
  for (const route of METERED_ROUTES) {
    it(`${route} asks the workspace budget`, () => {
      expect(
        source(route).includes('buildSpendLimitGateResponse'),
        `${route} meters spend without asking whether the workspace has budget left`,
      ).toBe(true);
    });

    it(`${route} checks the budget before reserving credit`, () => {
      // A turn a spend cap will refuse must not spend anything first, then be
      // refunded. The refund path exists for provider failures, not for a
      // decision we could have made up front.
      const text = source(route);
      const gate = text.indexOf('buildSpendLimitGateResponse');
      const reserve = text.search(/reserveManagedUsage|CreditService\.reserve|processRequest\(/);

      expect(gate).toBeGreaterThan(-1);
      if (reserve === -1) return;
      expect(gate, `${route} reserves credit before checking the budget`).toBeLessThan(reserve);
    });
  }
});
