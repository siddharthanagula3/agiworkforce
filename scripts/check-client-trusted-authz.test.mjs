import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  findTrustedClientReads,
  parseVocabulary,
  requestBoundNames,
} from './lib/client-trusted-authz.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-client-trusted-authz.mjs',
);

const RESOLVERS = [
  'apps/web/lib/resources/resource-acl.ts',
  'apps/web/lib/services/effective-subscription-service.ts',
  'apps/web/lib/services/entitlement-resolution.ts',
  'packages/contracts/types/src/capability-handshake/types.ts',
  'packages/contracts/types/src/resource-lifecycle.ts',
  'apps/web/lib/auth-guards.ts',
  'packages/contracts/types/src/trust-mode-contract.ts',
];

function fixture(routes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'client-authz-'));
  for (const relative of RESOLVERS) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'export const decide = () => true;\n');
  }
  fs.writeFileSync(
    path.join(root, 'packages/contracts/types/src/resource-lifecycle.ts'),
    "export const RESOURCE_ROLES = ['owner', 'editor', 'commenter', 'viewer'] as const;\n" +
      "export const RESOURCE_VISIBILITIES = ['private', 'organization', 'public'] as const;\n",
  );
  fs.writeFileSync(
    path.join(root, 'packages/contracts/types/src/billing-catalog.ts'),
    "export const SELF_SERVE_PAID_PLAN_TIERS = ['basic', 'pro', 'max', 'max_15x', 'team'] as const;\n",
  );
  for (const [relative, source] of Object.entries(routes)) {
    const full = path.join(root, 'apps/web/app/api', relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

function run(root) {
  try {
    return {
      code: 0,
      output: execFileSync('node', [script, '--root', root], { encoding: 'utf8' }),
    };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const SERVER_RESOLVED = `
import { canPerformOnOrganization } from '@/lib/resources/resource-acl';
export async function POST(request) {
  const { userId } = await getRequestIdentity(request);
  const body = await request.json();
  if (!canPerformOnOrganization({ viewerUserId: userId }, 'edit')) return forbidden();
  return save(body.title);
}
`;

test('passes a route that resolves the role itself', () => {
  const result = run(fixture({ 'projects/route.ts': SERVER_RESOLVED }));
  assert.equal(result.code, 0);
  assert.match(result.output, /9 concepts resolved server-side/);
});

test('fails a client page that reads what the viewer may do from the address bar', () => {
  const root = fixture({ 'projects/route.ts': SERVER_RESOLVED });
  const page = path.join(root, 'apps/web/features/share/SharePage.tsx');
  fs.mkdirSync(path.dirname(page), { recursive: true });
  fs.writeFileSync(
    page,
    "'use client';\nexport function SharePage() {\n  const isPublic = usePathname().startsWith('/share');\n  return isPublic ? <Everything /> : <Locked />;\n}\n",
  );
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /reads what the viewer may do out of the address bar/);
});

test('leaves a server component alone, it has no address bar to read', () => {
  const root = fixture({ 'projects/route.ts': SERVER_RESOLVED });
  const page = path.join(root, 'apps/web/app/share/page.tsx');
  fs.mkdirSync(path.dirname(page), { recursive: true });
  fs.writeFileSync(
    page,
    'export default async function Page({ params }) {\n  const visibility = await readVisibility(params.token);\n  return <View visibility={visibility} />;\n}\n',
  );
  assert.equal(run(root).code, 0);
});

test('fails a route that branches on a role the client sent', () => {
  const result = run(
    fixture({
      'projects/route.ts': SERVER_RESOLVED,
      'members/route.ts': `
export async function POST(request) {
  const body = await request.json();
  if (body.role === 'owner') return deleteWorkspace();
  return forbidden();
}
`,
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /members\/route\.ts:4 decides which role the caller holds/);
});

test('fails a route that branches on admin status from a header', () => {
  const result = run(
    fixture({
      'admin/route.ts': `
export async function GET(request) {
  const isAdmin = request.headers.get('x-admin') === '1';
  return isAdmin ? everything() : forbidden();
}
`,
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /whether the caller is an administrator/);
});

test('fails a route that takes the plan tier from the query string', () => {
  const result = run(
    fixture({
      'models/route.ts': `
export async function GET(request) {
  const planTier = new URL(request.url).searchParams.get('planTier');
  if (planTier === 'max') return everyModel();
  return freeModels();
}
`,
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /which plan the account is on/);
});

test('leaves a chat message role alone, because it grants nothing', () => {
  const findings = findTrustedClientReads(`
    const { role, content } = await request.json();
    if (role === 'assistant' && content) return persistAssistantTurn();
  `);
  assert.deepEqual(findings, []);
});

test('ignores a client field that is only stored, never branched on', () => {
  assert.deepEqual(
    findTrustedClientReads(`
    const body = await request.json();
    await db.insert({ organizationRole: body.organizationRole });
  `),
    [],
  );
});

test('follows client input through a parse and a rename', () => {
  const tainted = requestBoundNames(`
    const raw = await request.json();
    const parsed = schema.parse(raw);
    const { planTier } = parsed;
  `);
  assert.ok(tainted.has('parsed'));
  assert.ok(tainted.has('planTier'));
});

test('reads a declared vocabulary out of its contract', () => {
  assert.deepEqual(parseVocabulary("export const ROLES = ['owner', 'viewer'] as const;", 'ROLES'), [
    'owner',
    'viewer',
  ]);
  assert.equal(parseVocabulary('export const OTHER = 1;', 'ROLES'), null);
});

test('fails when the module that should decide reads the request itself', () => {
  const root = fixture({ 'projects/route.ts': SERVER_RESOLVED });
  fs.writeFileSync(
    path.join(root, 'apps/web/lib/auth-guards.ts'),
    "export async function admin(request) { const claim = request.headers.get('x-admin'); return claim === '1'; }\n",
  );
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /auth-guards\.ts reads the incoming request/);
});

test('fails when a privileged value is added to a contract but not to the vocabulary', () => {
  const root = fixture({ 'projects/route.ts': SERVER_RESOLVED });
  fs.writeFileSync(
    path.join(root, 'packages/contracts/types/src/resource-lifecycle.ts'),
    "export const RESOURCE_ROLES = ['owner', 'editor', 'commenter', 'viewer', 'auditor'] as const;\n" +
      "export const RESOURCE_VISIBILITIES = ['private', 'organization', 'public'] as const;\n",
  );
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /gained auditor/);
});

test('refuses to pass on an empty tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'client-authz-empty-'));
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /no request entry points/);
});
