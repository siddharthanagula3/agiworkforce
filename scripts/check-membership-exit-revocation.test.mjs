import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  BASELINE_FILE,
  REPO_ROOT,
  checkMembershipExitRevocation,
} from './check-membership-exit-revocation.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-membership-exit-revocation.mjs');

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function sandbox(files, baseline = null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'membership-exit-'));
  sandboxes.push(dir);
  for (const [relativePath, source] of Object.entries(files)) {
    mkdirSync(path.join(dir, path.dirname(relativePath)), { recursive: true });
    writeFileSync(path.join(dir, relativePath), source, 'utf8');
  }
  if (baseline) {
    mkdirSync(path.join(dir, path.dirname(BASELINE_FILE)), { recursive: true });
    writeFileSync(path.join(dir, BASELINE_FILE), JSON.stringify(baseline), 'utf8');
  }
  return dir;
}

const SERVICE = 'apps/web/lib/services/removal.ts';
const ROUTE = 'apps/web/app/api/team/route.ts';

const DELETES_AND_REVOKES = `
export async function removeMember(db, organizationId, userId) {
  await db.execute('delete from public.organization_members where organization_id = $1 and user_id = $2', [organizationId, userId]);
  await deprovisionMember(db, identity, { userId, organizationId });
}
`;

const DELETES_ONLY = `
export async function removeMember(db, organizationId, userId) {
  await db.execute('delete from public.organization_members where organization_id = $1 and user_id = $2', [organizationId, userId]);
}
`;

const CALLER_REVOKES = `
import { removeMember } from '@/lib/services/removal';
export async function DELETE(request) {
  await removeMember(db, organizationId, userId);
  await deprovisionMember(db, identity, { userId, organizationId });
}
`;

const CALLER_FORGETS = `
import { removeMember } from '@/lib/services/removal';
export async function DELETE(request) {
  await removeMember(db, organizationId, userId);
  return new Response(null, { status: 204 });
}
`;

const FORGOTTEN_PATH = `${SERVICE}::removeMember <- ${ROUTE}::DELETE`;

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('a delete followed by the offboarding call in the same function passes', () => {
  const { failures, report } = checkMembershipExitRevocation(
    sandbox({ [SERVICE]: DELETES_AND_REVOKES }),
  );
  assert.deepEqual(failures, []);
  assert.equal(report.revoked, 1);
});

test('a delete whose every caller revokes passes', () => {
  const { failures } = checkMembershipExitRevocation(
    sandbox({ [SERVICE]: DELETES_ONLY, [ROUTE]: CALLER_REVOKES }),
  );
  assert.deepEqual(failures, []);
});

test('a caller that deletes a membership and revokes nothing is reported by path', () => {
  const { failures } = checkMembershipExitRevocation(
    sandbox({ [SERVICE]: DELETES_ONLY, [ROUTE]: CALLER_FORGETS }),
  );
  assert.equal(failures.length, 1);
  assert.ok(failures[0].startsWith(FORGOTTEN_PATH), failures[0]);
});

test('a function that only shares the name is not taken for a caller', () => {
  const unrelated = `
function removeMember(passkeyId) {
  return passkeyId;
}
export function Panel() {
  removeMember('passkey');
}
`;
  const { failures } = checkMembershipExitRevocation(
    sandbox({
      [SERVICE]: DELETES_ONLY,
      [ROUTE]: CALLER_REVOKES,
      'apps/web/features/settings/Panel.tsx': unrelated,
    }),
  );
  assert.deepEqual(failures, []);
});

test('a delete nothing calls is reported rather than assumed safe', () => {
  const { failures } = checkMembershipExitRevocation(sandbox({ [SERVICE]: DELETES_ONLY }));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /nothing calls it/);
});

test('a statement kept in a module constant is traced to the functions that run it', () => {
  const source = `
const REMOVE_SQL = \`delete from public.organization_members where organization_id = $1\`;
export async function sweep(db, organizationId) {
  await db.execute(REMOVE_SQL, [organizationId]);
}
export async function DELETE() {
  await sweep(db, organizationId);
}
`;
  const { failures } = checkMembershipExitRevocation(sandbox({ [SERVICE]: source }));
  assert.equal(failures.length, 1);
  assert.ok(failures[0].startsWith(`${SERVICE}::sweep <- ${SERVICE}::DELETE`), failures[0]);
});

test('a recorded defect passes until it is fixed, then its entry has to go', () => {
  const baseline = {
    unrevoked: {
      [FORGOTTEN_PATH]: {
        kind: 'defect',
        reason: 'The route removes the member and never calls the offboarding service.',
        fixIn: ROUTE,
      },
    },
  };
  const recorded = checkMembershipExitRevocation(
    sandbox({ [SERVICE]: DELETES_ONLY, [ROUTE]: CALLER_FORGETS }, baseline),
  );
  assert.deepEqual(recorded.failures, []);

  const fixed = checkMembershipExitRevocation(
    sandbox({ [SERVICE]: DELETES_ONLY, [ROUTE]: CALLER_REVOKES }, baseline),
  );
  assert.equal(fixed.failures.length, 1);
  assert.match(fixed.failures[0], /only shrinks/);
});

test('a recorded entry without a kind, a reason or the file to fix is refused', () => {
  const baseline = { unrevoked: { [FORGOTTEN_PATH]: { kind: 'defect', reason: 'short' } } };
  const { failures } = checkMembershipExitRevocation(
    sandbox({ [SERVICE]: DELETES_ONLY, [ROUTE]: CALLER_FORGETS }, baseline),
  );
  assert.ok(
    failures.some((failure) => /needs a reason/.test(failure)),
    failures.join('\n'),
  );
  assert.ok(
    failures.some((failure) => /must name the file/.test(failure)),
    failures.join('\n'),
  );

  const untyped = checkMembershipExitRevocation(
    sandbox(
      { [SERVICE]: DELETES_ONLY, [ROUTE]: CALLER_FORGETS },
      { unrevoked: { [FORGOTTEN_PATH]: { reason: 'x'.repeat(60), fixIn: ROUTE } } },
    ),
  );
  assert.ok(untyped.failures.some((failure) => /defect or cannot-end/.test(failure)));
});

test('an empty tree proves nothing and says so', () => {
  const { failures } = checkMembershipExitRevocation(
    sandbox({ 'apps/web/lib/placeholder.ts': 'export const nothing = 1;\n' }),
  );
  assert.ok(failures.some((failure) => /proves nothing/.test(failure)));
});
