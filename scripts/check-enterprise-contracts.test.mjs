import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  COMMITMENTS_PATH,
  CONTRACT_TEST_PATH,
  LIFECYCLE_PATH,
  MIGRATIONS_DIR,
  ROUTE_DIR,
  SERVICE_DIR,
  checkEnterpriseContracts,
  readAgreementColumns,
  readAgreementSchema,
  readLifecycleVocabulary,
} from './check-enterprise-contracts.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const MIGRATION = `
create table if not exists public.organization_commercial_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  version integer not null,
  status text not null default 'draft'
    check (status = any (array['draft', 'executed', 'superseded'])),
  committed_seats integer not null,
  tax_exempt_status text not null
    check (tax_exempt_status = any (array['none', 'exempt']))
);
`;

const LATER_MIGRATION = `
alter table public.organization_commercial_agreements
  add column if not exists terminated_at timestamptz;
`;

const LIFECYCLE = `
export const CONTRACT_LIFECYCLE_STATES = ['draft', 'executed'] as const;

export const CONTRACT_LIFECYCLE_EVENTS = ['record_signature', 'terminate'] as const;

export const CONTRACT_TRANSITIONS: TransitionTable = Object.freeze({
  draft: Object.freeze({
    record_signature: move('executed'),
    terminate: refuse('not_signed_yet'),
  }),
  executed: Object.freeze({
    record_signature: refuse('already_executed'),
    terminate: move('terminated'),
  }),
});
`;

const COMMITMENTS = `
export const COMMERCIAL_MODELS = ['seat_only', 'postpaid_usage'] as const;

export function resolveCommercialModel(shape: CommitmentShape): CommercialModel | null {
  if (shape.committedSeats > 0) return 'seat_only';
  return 'postpaid_usage';
}
`;

const CONTRACT_TEST = `
it('reads seats as seat_only and metered as postpaid_usage', () => {});
`;

const STORE = `
const AGREEMENT_COLUMNS = \`id, organization_id, version, status, committed_seats,
       terminated_at\`;

export async function terminateCommercialAgreement(db, input) {
  await recordAuditEvent({ organizationId: input.organizationId });
}
`;

const TYPES = `
export const COMMERCIAL_AGREEMENT_STATUSES = ['draft', 'executed', 'superseded'] as const;
`;

const ROUTE = `
export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);

async function handleGet(request) {
  await requireMemberPermission(organizationId, userId, 'billing.read', 'no');
}

async function handlePost(request) {
  const csrfError = await requireCsrfToken(request);
  await requireMemberPermission(organizationId, userId, 'billing.contracts.manage', 'no');
  return terminateCommercialAgreement(db, input);
}
`;

function repo(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'enterprise-contracts-'));
  roots.push(root);
  const files = {
    [`${MIGRATIONS_DIR}/0228_agreements.sql`]: MIGRATION,
    [`${MIGRATIONS_DIR}/0285_lifecycle.sql`]: LATER_MIGRATION,
    [LIFECYCLE_PATH]: LIFECYCLE,
    [COMMITMENTS_PATH]: COMMITMENTS,
    [CONTRACT_TEST_PATH]: CONTRACT_TEST,
    [`${SERVICE_DIR}/agreement-store.ts`]: STORE,
    [`${SERVICE_DIR}/types.ts`]: TYPES,
    [`${ROUTE_DIR}/route.ts`]: ROUTE,
    ...overrides,
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    if (contents !== null) write(root, relativePath, contents);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a domain whose sources agree passes', () => {
  assert.deepEqual(checkEnterpriseContracts(repo()), []);
});

test('reads the vocabulary, the columns and the newest schema out of the sources', () => {
  const root = repo();
  assert.deepEqual(readLifecycleVocabulary(root).states, ['draft', 'executed']);
  assert.deepEqual(readLifecycleVocabulary(root).table.executed, ['record_signature', 'terminate']);
  assert.ok(readAgreementColumns(root).includes('terminated_at'));
  const schema = readAgreementSchema(root);
  assert.deepEqual(schema.statuses, ['draft', 'executed', 'superseded']);
  assert.ok(schema.columns.includes('terminated_at'));
});

test('a state with no outcome for an event fails', () => {
  const problems = checkEnterpriseContracts(
    repo({
      [LIFECYCLE_PATH]: LIFECYCLE.replace("    terminate: move('terminated'),\n", ''),
    }),
  );
  assert.ok(
    problems.some((problem) => /state "executed" states no outcome for event/.test(problem)),
  );
});

test('a commercial model nothing resolves to, or nothing tests, fails', () => {
  const declared = checkEnterpriseContracts(
    repo({
      [COMMITMENTS_PATH]: COMMITMENTS.replace(
        "['seat_only', 'postpaid_usage']",
        "['seat_only', 'postpaid_usage', 'hybrid']",
      ),
    }),
  );
  assert.ok(declared.some((problem) => /no terms resolve to it/.test(problem)));
  assert.ok(declared.some((problem) => /model "hybrid" has no test/.test(problem)));
});

test('a column the store reads that no migration creates fails', () => {
  const problems = checkEnterpriseContracts(
    repo({
      [`${SERVICE_DIR}/agreement-store.ts`]: STORE.replace('terminated_at', 'expiry_grace_days'),
    }),
  );
  assert.ok(
    problems.some((problem) => /"expiry_grace_days" is read but no migration/.test(problem)),
  );
});

test('a status the table stores that the domain does not name fails', () => {
  const problems = checkEnterpriseContracts(
    repo({
      [`${MIGRATIONS_DIR}/0286_status.sql`]: `
alter table public.organization_commercial_agreements
  add constraint organization_commercial_agreements_status_check
  check (status = any (array['draft', 'executed', 'superseded', 'terminated']));
`,
    }),
  );
  assert.ok(problems.some((problem) => /stores status "terminated"/.test(problem)));
});

test('a route that changes a contract without a permission, CSRF or an audit fails', () => {
  const unguarded = checkEnterpriseContracts(
    repo({ [`${ROUTE_DIR}/route.ts`]: ROUTE.replace(/requireMemberPermission\(/g, 'nothing(') }),
  );
  assert.ok(unguarded.some((problem) => /without checking a workspace permission/.test(problem)));

  const uncsrfed = checkEnterpriseContracts(
    repo({ [`${ROUTE_DIR}/route.ts`]: ROUTE.replace('await requireCsrfToken(request)', 'null') }),
  );
  assert.ok(uncsrfed.some((problem) => /POST changes a contract with no CSRF check/.test(problem)));

  const unaudited = checkEnterpriseContracts(
    repo({
      [`${ROUTE_DIR}/route.ts`]: ROUTE.replace(
        'terminateCommercialAgreement(db, input)',
        'db.execute(sql)',
      ),
    }),
  );
  assert.ok(unaudited.some((problem) => /writes an audit event/.test(problem)));
});

test('float money and a reach into the self-serve catalog both fail', () => {
  const floats = checkEnterpriseContracts(
    repo({
      [`${SERVICE_DIR}/invoicing.ts`]: 'export const due = (cents) => (cents / 100).toFixed(2);\n',
    }),
  );
  assert.ok(floats.some((problem) => /money arithmetic uses a division by 100/.test(problem)));
  assert.ok(floats.some((problem) => /money arithmetic uses a toFixed/.test(problem)));

  const catalog = checkEnterpriseContracts(
    repo({
      [`${SERVICE_DIR}/invoicing.ts`]:
        "import { BILLING_PLAN_PRICING } from '@agiworkforce/types';\n",
    }),
  );
  assert.ok(catalog.some((problem) => /reaches into the self-serve catalog/.test(problem)));
});
