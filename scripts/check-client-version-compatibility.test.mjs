import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-client-version-compatibility.mjs',
);

const SYNC_ROUTE = `
import { SYNC_PROTOCOL_MIN_VERSION, resolveSyncProtocolVersion } from '@agiworkforce/cloud-contracts';
export async function POST(request) {
  const decision = resolveSyncProtocolVersion(await request.json());
  if (decision.compatibility === 'too_old') {
    throw createError.clientUpdateRequired(\`needs \${SYNC_PROTOCOL_MIN_VERSION} or newer\`);
  }
  return Response.json({ ok: true });
}
`;

const INVENTORY = {
  _description: 'fixture',
  refusals: [
    {
      file: 'apps/web/app/api/chat/sync/route.ts',
      trigger: 'createError.clientUpdateRequired',
      refuses:
        'A sync exchange whose declared protocol version is under the floor the shared contract sets.',
      remedy:
        'The sentence names the protocol the caller speaks and the one this deployment now needs.',
    },
  ],
};

/** The guard refuses a scan that found nothing, so a fixture carries a real tree. */
function fixture({ files = {}, inventory = INVENTORY } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'client-version-'));
  const write = (relative, source) => {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  };
  write('apps/web/app/api/chat/sync/route.ts', SYNC_ROUTE);
  for (let index = 0; index < 220; index += 1) {
    write(`apps/web/lib/filler/module-${index}.ts`, 'export const value = 1;\n');
  }
  for (const [relative, source] of Object.entries(files)) write(relative, source);
  write('scripts/config/client-upgrade-refusals.json', JSON.stringify(inventory, null, 2));
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

test('passes a refusal that is inventoried and names the version it needs', () => {
  const result = run(fixture());
  assert.equal(result.code, 0);
  assert.match(result.output, /1 accounted forced-update refusal/);
});

test('fails a route that refuses an old build without being inventoried', () => {
  const result = run(
    fixture({
      files: {
        'apps/web/app/api/projects/sync/route.ts': SYNC_ROUTE,
      },
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /projects\/sync\/route\.ts refuses a caller for its build/);
});

test('fails a refusal that tells the caller to update without naming the version', () => {
  const result = run(
    fixture({
      files: {
        'apps/web/app/api/chat/sync/route.ts':
          "export async function POST() { throw createError.clientUpdateRequired('Update to continue.'); }\n",
      },
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /without naming the version this deployment needs/);
});

test('fails an inventory entry whose site no longer refuses anything', () => {
  const result = run(
    fixture({
      inventory: {
        ...INVENTORY,
        refusals: [
          ...INVENTORY.refusals,
          {
            file: 'apps/web/app/api/memory/sync/route.ts',
            trigger: 'createError.clientUpdateRequired',
            refuses: 'A memory sync exchange below the floor the shared contract sets today.',
            remedy: 'The sentence names the protocol the caller speaks and the one needed now.',
          },
        ],
      },
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /no longer refuses anything/);
});

test('fails a handler that reads the client version itself', () => {
  const result = run(
    fixture({
      files: {
        'apps/web/app/api/me/route.ts':
          "export async function GET(request) { return Response.json({ v: request.headers.get('x-agi-client-version') }); }\n",
      },
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /reads the client version itself/);
});

test('fails when the trigger list no longer matches how the server refuses', () => {
  const result = run(
    fixture({
      files: { 'apps/web/app/api/chat/sync/route.ts': 'export async function POST() {}\n' },
      inventory: { _description: 'fixture', refusals: [] },
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /found no refusal site at all/);
});
