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

const MANAGED_ROUTES = [
  'app/api/llm/v1/chat/completions/route.ts',
  'app/api/llm/v1/chat/completions/approve/route.ts',
  'app/api/llm/v1/embeddings/route.ts',
  'app/api/llm/v1/audio/transcriptions/route.ts',
  'app/api/media/image/generate/route.ts',
  'app/api/media/video/generate/route.ts',
  'app/api/settings/test-provider/route.ts',
] as const;

function source(relative: string): string {
  return readFileSync(join(APP_ROOT, relative), 'utf8');
}

describe('the workspace policy covers every managed-compute route', () => {
  for (const route of MANAGED_ROUTES) {
    it(`${route} asks the workspace policy`, () => {
      expect(
        source(route).includes('buildOrganizationPolicyGateResponse'),
        `${route} meters managed compute without asking the workspace policy, so an administrator's decision does not bind on it`,
      ).toBe(true);
    });
  }

  it('every route sends the surface, since sync policy is scoped by it', () => {
    for (const route of MANAGED_ROUTES) {
      const text = source(route);
      const at = text.indexOf('buildOrganizationPolicyGateResponse(');
      const call = text.slice(at, at + 420);
      expect(call, `${route} must pass a surface`).toMatch(/surface:/);
    }
  });

  it('names every route that reaches the gate, so the list cannot rot silently', () => {
    const callers = MANAGED_ROUTES.filter((r) =>
      source(r).includes('buildOrganizationPolicyGateResponse'),
    );
    expect(callers.length).toBe(MANAGED_ROUTES.length);
  });
});
