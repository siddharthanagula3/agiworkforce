import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-public-share-dlp.mjs',
);

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'share-dlp-'));
  for (const [relative, source] of Object.entries(files)) {
    const full = path.join(root, relative);
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

const INSPECTING_ROUTE = `
import { inspectOutboundContent } from '@/lib/security/outbound-content-inspection';
export async function POST(request) {
  const outbound = await inspectOutboundContent({ text: request.body });
  if (outbound.blocked) return null;
  return db.query(\`insert into shared_sessions (token, user_id) values ($1, $2)\`, []);
}
`;

test('passes a share route that inspects before it publishes', () => {
  const result = run(fixture({ 'apps/web/app/api/share/route.ts': INSPECTING_ROUTE }));
  assert.equal(result.code, 0);
  assert.match(result.output, /1 public share writers/);
});

test('fails a share route that writes the public row with no inspection', () => {
  const result = run(
    fixture({
      'apps/web/app/api/share/route.ts': INSPECTING_ROUTE,
      'apps/web/app/api/quick-share/route.ts': `
export async function POST(request) {
  return db.query(\`insert into shared_sessions (token, user_id) values ($1, $2)\`, []);
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /quick-share\/route\.ts/);
  assert.match(result.output, /without inspecting/);
});

test('fails when inspection happens only after the public row is written', () => {
  const result = run(
    fixture({
      'apps/web/app/api/share/route.ts': `
export async function POST(request) {
  const row = await db.query(\`insert into shared_sessions (token) values ($1)\`, []);
  await inspectOutboundContent({ text: request.body });
  return row;
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /without inspecting/);
});

test('follows a publishing service to the route that calls it', () => {
  const service = `
export async function publishArtifactRecord(db, input) {
  return db.query(
    \`insert into public.published_artifacts (token, user_id, content) values ($1, $2, $3)\`,
    [input.token, input.userId, input.content],
  );
}
export async function getPublishedArtifactByToken(db, token) {
  return db.query(\`select * from public.published_artifacts where token = $1\`, [token]);
}
`;

  const leaky = run(
    fixture({
      'apps/web/app/api/share/route.ts': INSPECTING_ROUTE,
      'apps/web/lib/services/published-artifact-service.ts': service,
      'apps/web/app/api/artifacts/publish/route.ts': `
import { publishArtifactRecord } from '@/lib/services/published-artifact-service';
export async function POST(request) {
  return publishArtifactRecord(db, await request.json());
}
`,
    }),
  );
  assert.equal(leaky.code, 1);
  assert.match(leaky.output, /calls publishArtifactRecord/);

  const guarded = run(
    fixture({
      'apps/web/app/api/share/route.ts': INSPECTING_ROUTE,
      'apps/web/lib/services/published-artifact-service.ts': service,
      'apps/web/app/api/artifacts/publish/route.ts': `
import { scanForSecrets, redactSecrets } from '@/lib/security/secrets-audit';
import { publishArtifactRecord } from '@/lib/services/published-artifact-service';
export async function POST(request) {
  const body = await request.json();
  const detections = scanForSecrets(body.content);
  const content = detections.length > 0 ? redactSecrets(body.content) : body.content;
  return publishArtifactRecord(db, { ...body, content });
}
`,
    }),
  );
  assert.equal(guarded.code, 0);
});

test('does not accuse a route that only reads a published share back', () => {
  const result = run(
    fixture({
      'apps/web/app/api/share/route.ts': INSPECTING_ROUTE,
      'apps/web/lib/services/published-artifact-service.ts': `
export async function publishArtifactRecord(db, input) {
  return db.query(\`insert into public.published_artifacts (token) values ($1)\`, [input.token]);
}
export async function getPublishedArtifactByToken(db, token) {
  return db.query(\`select * from public.published_artifacts where token = $1\`, [token]);
}
`,
      'apps/web/app/api/shared-artifact/[token]/route.ts': `
import { getPublishedArtifactByToken } from '@/lib/services/published-artifact-service';
export async function GET(request, context) {
  return getPublishedArtifactByToken(db, (await context.params).token);
}
`,
    }),
  );

  assert.equal(result.code, 0);
});

test('fails when no public share write is found at all', () => {
  const result = run(
    fixture({ 'apps/web/lib/services/noop.ts': 'export const noop = () => null;\n' }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /table list is stale/);
});

const PUBLICATION_POLICY_PATH = 'apps/web/lib/services/published-artifact-publication-policy.ts';
const RESTORE_ROUTE_PATH = 'apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts';
const PUBLICATION_POLICY = `
import { inspectOutboundContent } from '@/lib/security/outbound-content-inspection';
import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';
import { moderateManagedPrompt } from '@/lib/moderation';
function refuseModeratedPublication(userId, title, content) {
  const moderation = moderateManagedPrompt({ userId, segments: [title, content], surface: 'published-artifact' });
  if (!moderation.allowed) {
    throw createError.validation('refused');
  }
}
export async function preparePublishedArtifactPublication(db, input) {
  const sharingGateResponse = await buildExternalSharingGateResponse(input.userId, input.request);
  if (sharingGateResponse) return sharingGateResponse;
  refuseModeratedPublication(input.userId, input.title, input.content);
  const outbound = await inspectOutboundContent({ value: input.content, userId: input.userId });
  if (outbound.action === 'blocked') {
    throw createError.validation(outbound.message);
  }
  return { content: outbound.value };
}
`;
const RESTORE_SERVICE = `
export async function restorePublishedArtifactRecord(db, input) {
  return db.query(\`update public.published_artifacts set content = $1 where token = $2\`, [input.content, input.token]);
}
export async function renamePublishedArtifact(db, input) {
  return db.query(\`update public.published_artifacts set title = $1 where token = $2\`, [input.title, input.token]);
}
export async function recordPublishedVersion(db, input) {
  return db.query(\`update public.published_artifacts set version = $1 where token = $2\`, [input.version, input.token]);
}
`;
const RESTORE_ROUTE = `
import { preparePublishedArtifactPublication } from '@/lib/services/published-artifact-publication-policy';
import { restorePublishedArtifactRecord } from '@/lib/services/published-artifact-service';
export async function POST(request) {
  const preparation = await preparePublishedArtifactPublication(db, input);
  if (preparation instanceof Response) return preparation;
  return restorePublishedArtifactRecord(db, { ...input, content: preparation.content });
}
`;

function restoreFiles(route = RESTORE_ROUTE, policy = PUBLICATION_POLICY) {
  return {
    [PUBLICATION_POLICY_PATH]: policy,
    'apps/web/lib/services/published-artifact-service.ts': RESTORE_SERVICE,
    [RESTORE_ROUTE_PATH]: route,
  };
}

test('discovers an UPDATE-only restore and traces the imported policy implementation', () => {
  const result = run(fixture(restoreFiles()));
  assert.equal(result.code, 0);
  assert.match(result.output, /1 public share writers/);
});

test('rejects an UPDATE-only restore with no preparation', () => {
  const result = run(fixture(restoreFiles(`
export async function POST(request) {
  return restorePublishedArtifactRecord(db, input);
}
`)));
  assert.equal(result.code, 1);
  assert.match(result.output, /calls restorePublishedArtifactRecord/);
});

test('rejects a direct content UPDATE with no inspection', () => {
  const result = run(fixture({ [RESTORE_ROUTE_PATH]: `
export async function POST(request) {
  return db.query(\`update published_artifacts set content = $1 where token = $2\`, []);
}
` }));
  assert.equal(result.code, 1);
  assert.match(result.output, /without inspecting/);
});

test('does not classify metadata-only updates as content publication', () => {
  const result = run(fixture({
    ...restoreFiles(),
    'apps/web/app/api/artifacts/rename/route.ts': `
export async function POST() {
  await renamePublishedArtifact(db, input);
  return recordPublishedVersion(db, input);
}
`,
  }));
  assert.equal(result.code, 0);
});

for (const [name, route, policy] of [
  ['wrong helper import', RESTORE_ROUTE.replace('publication-policy', 'unrelated-policy'), PUBLICATION_POLICY],
  ['missing helper implementation', RESTORE_ROUTE, ''],
  ['missing inspection', RESTORE_ROUTE, PUBLICATION_POLICY.replace('await inspectOutboundContent(', 'await unrelatedInspection(')],
  ['wrong inspector import', RESTORE_ROUTE, PUBLICATION_POLICY.replace('security/outbound-content-inspection', 'security/unrelated')],
  ['missing sharing gate', RESTORE_ROUTE, PUBLICATION_POLICY.replace('await buildExternalSharingGateResponse(', 'await unrelatedGate(')],
  ['missing moderation refusal', RESTORE_ROUTE, PUBLICATION_POLICY.replace('if (!moderation.allowed) {', 'if (false) {')],
  ['missing outbound refusal', RESTORE_ROUTE, PUBLICATION_POLICY.replace("if (outbound.action === 'blocked') {", 'if (false) {')],
  ['unawaited preparation', RESTORE_ROUTE.replace('await preparePublishedArtifactPublication(', 'preparePublishedArtifactPublication('), PUBLICATION_POLICY],
  ['missing route refusal', RESTORE_ROUTE.replace('if (preparation instanceof Response) return preparation;', ''), PUBLICATION_POLICY],
  ['preparation after write', RESTORE_ROUTE.replace(
    'const preparation = await preparePublishedArtifactPublication(db, input);',
    'await restorePublishedArtifactRecord(db, input);\n  const preparation = await preparePublishedArtifactPublication(db, input);',
  ), PUBLICATION_POLICY],
  ['helper gate after inspection', RESTORE_ROUTE, PUBLICATION_POLICY.replace(
    'const sharingGateResponse = await buildExternalSharingGateResponse(input.userId, input.request);',
    '',
  ).replace(
    'return { content: outbound.value };',
    'const sharingGateResponse = await buildExternalSharingGateResponse(input.userId, input.request);\n  return { content: outbound.value };',
  )],
]) {
  test(`rejects delegated publication with ${name}`, () => {
    const result = run(fixture(restoreFiles(route, policy)));
    assert.equal(result.code, 1);
    assert.match(result.output, /calls restorePublishedArtifactRecord/);
  });
}
