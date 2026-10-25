import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Resolves the app root by looking for a marker, not from `process.cwd()`.
 *
 * A coverage guard that resolves from the working directory fails with a wall
 * of unreadable-file errors the moment vitest is invoked from the repo root
 * instead of the app, noise that says nothing about the thing being guarded.
 */
function appRoot(): string {
  const direct = process.cwd();
  if (existsSync(join(direct, 'db/neon'))) return direct;
  const nested = join(direct, 'apps/web');
  if (existsSync(join(nested, 'db/neon'))) return nested;
  throw new Error(`Could not locate apps/web from ${direct}`);
}

const APP_ROOT = appRoot();

/**
 * Every route that mints an anonymous public link must ask the workspace first.
 *
 * A sharing rule that holds for chat transcripts but not for published
 * artifacts is not a control. This reads the sources so a new public-link route
 * cannot ship without the gate.
 */
const PUBLIC_LINK_ROUTES = [
  { route: 'app/api/share/route.ts', writes: ['insert into'] },
  { route: 'app/api/artifacts/publish/route.ts', writes: ['publishArtifactRecord('] },
  { route: 'app/api/artifacts/publish/[token]/route.ts', writes: ['await moveToAudience('] },
  { route: 'app/api/schedules/[id]/share/route.ts', writes: ['saveScheduleShare('] },
] as const;

const GATE_CALL = 'buildExternalSharingGateResponse(';

describe('external sharing policy covers every public-link route', () => {
  for (const { route, writes } of PUBLIC_LINK_ROUTES) {
    it(`${route} asks the workspace before minting a link`, () => {
      const text = readFileSync(join(APP_ROOT, route), 'utf8');
      expect(
        text.includes(GATE_CALL),
        `${route} mints a public link without asking the workspace policy`,
      ).toBe(true);
    });

    it(`${route} refuses before it writes anything`, () => {
      // A gate that runs after the insert has already published the link. The
      // call is matched, not the name, which the import line already contains.
      const text = readFileSync(join(APP_ROOT, route), 'utf8');
      const gate = text.indexOf(GATE_CALL);
      const write = Math.min(...writes.map((marker) => text.indexOf(marker)).filter((i) => i >= 0));

      expect(gate).toBeGreaterThan(-1);
      expect(Number.isFinite(write)).toBe(true);
      expect(gate, `${route} checks the policy after it has already written`).toBeLessThan(write);
    });
  }
});
