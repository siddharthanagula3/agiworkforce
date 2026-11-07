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
  {
    route: 'app/api/artifacts/publish/route.ts',
    writes: ['publishArtifactRecord('],
    delegated: true,
  },
  {
    route: 'app/api/artifacts/publish/[token]/versions/[version]/route.ts',
    writes: ['restorePublishedArtifactRecord('],
    delegated: true,
  },
  {
    route: 'app/api/artifacts/publish/[token]/route.ts',
    writes: ['await updatePublishedArtifactAudience('],
    audience: true,
  },
  { route: 'app/api/schedules/[id]/share/route.ts', writes: ['saveScheduleShare('] },
] as const;

const GATE_CALL = 'buildExternalSharingGateResponse(';
const PREPARATION_CALL = 'preparePublishedArtifactPublication(';
const PREPARATION_IMPORT =
  "import { preparePublishedArtifactPublication } from '@/lib/services/published-artifact-publication-policy';";

describe('external sharing policy covers every public-link route', () => {
  it('the imported publication helper refuses before moderation or outbound inspection', () => {
    const source = readFileSync(
      join(APP_ROOT, 'lib/services/published-artifact-publication-policy.ts'),
      'utf8',
    );
    expect(source).toContain(
      "import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';",
    );
    const declaration = source.indexOf(
      'export async function preparePublishedArtifactPublication(',
    );
    expect(declaration).toBeGreaterThan(-1);
    const body = source.slice(declaration);
    const gate = body.indexOf(GATE_CALL);
    const refusal = body.indexOf('if (sharingGateResponse) return sharingGateResponse;');
    expect(gate).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(gate);
    expect(body.indexOf('refuseModeratedPublication(')).toBeGreaterThan(refusal);
    expect(body.indexOf('inspectOutboundContent(')).toBeGreaterThan(refusal);
  });

  for (const entry of PUBLIC_LINK_ROUTES) {
    const { route, writes } = entry;
    const delegated = 'delegated' in entry && entry.delegated;
    const gateCall = delegated ? PREPARATION_CALL : GATE_CALL;
    it(`${route} asks the workspace before minting a link`, () => {
      const text = readFileSync(join(APP_ROOT, route), 'utf8');
      if (delegated) expect(text).toContain(PREPARATION_IMPORT);
      expect(
        text.includes(gateCall),
        `${route} mints a public link without asking the workspace policy`,
      ).toBe(true);
    });

    it(`${route} refuses before it writes anything`, () => {
      // A gate that runs after the insert has already published the link. The
      // call is matched, not the name, which the import line already contains.
      const text = readFileSync(join(APP_ROOT, route), 'utf8');
      if ('audience' in entry && entry.audience) {
        assertAudienceAuthorizationBoundary(text);
        return;
      }
      const gate = text.indexOf(gateCall);
      const write = Math.min(...writes.map((marker) => text.indexOf(marker)).filter((i) => i >= 0));

      expect(gate).toBeGreaterThan(-1);
      expect(Number.isFinite(write)).toBe(true);
      expect(gate, `${route} checks the policy after it has already written`).toBeLessThan(write);
      if (delegated) {
        const refusal = text.indexOf('if (preparation instanceof Response) return preparation;');
        expect(refusal).toBeGreaterThan(gate);
        expect(refusal).toBeLessThan(write);
      }
    });
  }
});

// Source-shape coverage only: the service executes the callback before mutation,
// even though its declaration appears after the route's service invocation.
function assertAudienceAuthorizationBoundary(route: string): void {
  expect(route).toContain(
    "import { updatePublishedArtifactAudience } from '@/lib/services/org-shared-artifact-service';",
  );
  expect(route).toContain('const { db, userId, organizationId } = await getUserScopedDb(request);');
  expect(route).not.toMatch(
    /\b(?:resolveOrgMembership|resolveArtifactShareTarget|moveToAudience|setPublishedArtifactVisibility|shareArtifactWithOrganization|unshareArtifactFromOrganization)\s*\(/,
  );
  const call = route.indexOf('await updatePublishedArtifactAudience(db, {');
  const callback = route.indexOf(
    'authorize: async ({ db: tx, publication, sharedOrganizationId }) => {',
    call,
  );
  expect(call).toBeGreaterThan(-1);
  expect(callback).toBeGreaterThan(call);
  expect(route.slice(call, callback)).toContain('organizationId,');
  const gate = route.indexOf('await buildExternalSharingGateResponse(', callback);
  const refusal = route.indexOf(
    'if (sharingGateResponse) throw new PublicationSharingGateError(sharingGateResponse);',
    callback,
  );
  const publicOnly = route.indexOf("if (visibility !== 'public') return;", callback);
  expect(publicOnly).toBeGreaterThan(callback);
  expect(publicOnly).toBeLessThan(gate);
  expect(gate).toBeGreaterThan(callback);
  expect(refusal).toBeGreaterThan(gate);
  expect(route.slice(gate, refusal)).toContain(
    'await readPublicationOrganizationIds(tx, publication, sharedOrganizationId)',
  );
  expect(
    route.indexOf(
      'if (error instanceof PublicationSharingGateError) return error.response;',
      refusal,
    ),
  ).toBeGreaterThan(refusal);

  const source = readFileSync(
    join(APP_ROOT, 'lib/services/org-shared-artifact-service.ts'),
    'utf8',
  );
  const declaration = source.indexOf('export async function updatePublishedArtifactAudience(');
  expect(declaration).toBeGreaterThan(-1);
  const body = source.slice(declaration);
  const transaction = body.indexOf('return db.transaction(async (tx) => {');
  const lock = body.indexOf('for update');
  const grantRead = body.indexOf('const grants = await readGrants();');
  const authorization = body.indexOf('await input.authorize({');
  expect(transaction).toBeGreaterThan(-1);
  expect(lock).toBeGreaterThan(transaction);
  expect(grantRead).toBeGreaterThan(lock);
  expect(authorization).toBeGreaterThan(grantRead);
  expect(body.slice(authorization)).toMatch(/await input\.authorize\(\{\s*db: tx,/);
  expect(body).not.toMatch(/\bdb\.(?:query|execute)\s*\(/);
  expect(body).not.toContain('resolveOrgMembership(');
  for (const write of [
    'delete from public.organization_shared_artifacts',
    'insert into public.organization_shared_artifacts',
    'update public.published_artifacts',
  ]) {
    expect(body.indexOf(write), `${write} must follow the authorization callback`).toBeGreaterThan(
      authorization,
    );
  }
}
