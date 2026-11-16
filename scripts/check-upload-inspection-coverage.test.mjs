import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { callerByteReads, readsCallerBytes } from './lib/upload-ingest.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-upload-inspection-coverage.mjs',
);

const MODULE = `
export function scanUploadForCredentials(bytes) { return []; }
export function uploadFindingRejects(finding) { return finding.kind === 'credential'; }
export function inspectUploadBytes(bytes, declaredMime) { return { declaredMime }; }
export async function scanUploadBytes(bytes, mime, name) { return { findings: [] }; }
`;

const STAGES = `
export async function PUT(request) {
  const body = Buffer.from(await request.arrayBuffer());
  return store(body);
}
`;

const COMPLETES = `
import { scanUploadBytes } from '@/lib/security/upload-scan';
export async function POST(request) {
  const object = await read(await request.json());
  return scanUploadBytes(object.data, 'image/png', 'f');
}
`;

const STEPS = `
import { inspectUploadHead } from '@/lib/security/upload-scan';
import { submitSourceScan } from '@/lib/security/source-scan-client';
export async function inspect(head) { return inspectUploadHead(head, 'application/pdf', 'f'); }
export async function submit(request) { return submitSourceScan(request); }
`;

const SEAL = `
import { insertScannedChatFileMediaAsset } from '@/lib/server/media-assets';
export async function commit(tx, row) {
  return insertScannedChatFileMediaAsset({ metadata: { source: 'chat-attachment' } }, tx);
}
`;

const MEDIA_ASSETS = `
export async function insertMediaAsset(params, db) { return db.query('insert', [params]); }
export async function insertScannedChatFileMediaAsset(params, db) { return db.query('insert', [params]); }
`;

const WRITES_CHAT_MEDIA = `
import { insertMediaAsset } from '@/lib/server/media-assets';
export async function keep(db, key) {
  return insertMediaAsset({ storageUrl: key, metadata: { source: 'chat-attachment' } }, db);
}
`;

const INGESTS = `
export async function POST(request) {
  const form = await request.formData();
  return store(await form.get('file').arrayBuffer());
}
`;

const INSPECTS = `
import { scanUploadBytes } from '@/lib/security/upload-scan';
export async function POST(request) {
  const form = await request.formData();
  const bytes = new Uint8Array(await form.get('file').arrayBuffer());
  const scan = await scanUploadBytes(bytes, 'application/zip', 'f');
  return scan.findings.length === 0 ? store(bytes) : reject();
}
`;

const SINGLE_REQUEST_ROUTES = [
  'apps/web/app/api/code/sessions/[sessionId]/notebook/files/route.ts',
  'apps/web/app/api/llm/v1/audio/transcriptions/route.ts',
  'apps/web/app/api/plugins/uploads/route.ts',
  'apps/web/app/api/skills/route.ts',
];

const DEFERRALS = [
  [
    'apps/web/app/api/files/uploads/[uploadId]/route.ts',
    [
      'apps/web/lib/server/chat-attachment-completion.ts',
      'apps/web/lib/server/project-knowledge-extraction.ts',
      'apps/web/lib/server/chat-file-intake/steps.ts',
    ],
  ],
  [
    'apps/web/app/api/uploads/chat-attachment/put/route.ts',
    ['apps/web/lib/server/chat-attachment-completion.ts'],
  ],
  [
    'apps/web/app/api/uploads/knowledge-file/put/route.ts',
    ['apps/web/lib/server/project-knowledge-extraction.ts'],
  ],
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STEPS_FILE = 'apps/web/lib/server/chat-file-intake/steps.ts';
const SEAL_FILE = 'apps/web/lib/server/chat-file-intake/seal.ts';
const COMPLETION_FILE = 'apps/web/lib/server/chat-attachment-completion.ts';

function completingSource(file) {
  return file === STEPS_FILE ? STEPS : COMPLETES;
}

function baseTree() {
  const tree = {
    'apps/web/lib/security/upload-scan.ts': MODULE,
    'apps/web/lib/server/media-assets.ts': MEDIA_ASSETS,
    [SEAL_FILE]: SEAL,
  };
  for (const route of SINGLE_REQUEST_ROUTES) tree[route] = INSPECTS;
  for (const [stage, completing] of DEFERRALS) {
    tree[stage] = STAGES;
    for (const file of completing) tree[file] = completingSource(file);
  }
  tree[COMPLETION_FILE] = `${COMPLETES}\n${WRITES_CHAT_MEDIA}`;
  return tree;
}

function fixture(tree) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-ingest-'));
  for (const [relative, source] of Object.entries(tree)) {
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

test('reads caller bytes through the request and nothing else', () => {
  assert.deepEqual(callerByteReads('const b = await request.arrayBuffer();'), ['arrayBuffer']);
  assert.deepEqual(callerByteReads('const f = await req.formData();'), ['formData']);
  assert.equal(readsCallerBytes('const b = await upstream.arrayBuffer();'), false);
  assert.equal(readsCallerBytes('const body = await request.json();'), false);
});

test('passes when every ingesting route inspects in place or at the finishing step', () => {
  const result = run(fixture(baseTree()));
  assert.equal(result.code, 0);
  assert.match(result.output, /7 routes read caller bytes, 7 inspected, 3 of them/);
});

test('fails for whichever single-request route loses its inspection call', () => {
  for (const route of SINGLE_REQUEST_ROUTES) {
    const tree = baseTree();
    tree[route] = INGESTS;
    const result = run(fixture(tree));
    assert.equal(result.code, 1, `${route} could drop its scan`);
    assert.match(result.output, /reads caller bytes \(formData\) and inspects none of them/);
  }
});

test('fails when a new route takes caller bytes with nothing behind it', () => {
  const tree = baseTree();
  tree['apps/web/app/api/avatars/route.ts'] = INGESTS;
  const result = run(fixture(tree));
  assert.equal(result.code, 1);
  assert.match(result.output, /apps\/web\/app\/api\/avatars\/route\.ts reads caller bytes/);
});

test('fails when any file a deferral names does not inspect', () => {
  for (const [stage, completing] of DEFERRALS) {
    for (const file of completing) {
      const tree = baseTree();
      tree[file] = completingSource(file)
        .replaceAll('scanUploadBytes', 'store')
        .replaceAll('inspectUploadHead(', 'store(');
      const result = run(fixture(tree));
      assert.equal(result.code, 1, `${stage} accepted a deferral to nothing through ${file}`);
      assert.match(
        result.output,
        new RegExp(`${escapeRegExp(stage)} defers inspection to ${escapeRegExp(file)}`),
      );
    }
  }
});

test('fails when a deferral entry names a route that no longer reads caller bytes', () => {
  const tree = baseTree();
  tree['apps/web/app/api/uploads/chat-attachment/put/route.ts'] =
    'export async function GET() { return list(); }';
  const result = run(fixture(tree));
  assert.equal(result.code, 1);
  assert.match(result.output, /stale entry: apps\/web\/app\/api\/uploads\/chat-attachment\/put/);
});

test('fails when a deferring route starts inspecting in place and keeps its entry', () => {
  const tree = baseTree();
  tree['apps/web/app/api/uploads/knowledge-file/put/route.ts'] = INSPECTS;
  const result = run(fixture(tree));
  assert.equal(result.code, 1);
  assert.match(result.output, /inspects in place now; remove its deferral entry/);
});

test('fails when the scanner loses a part the routes depend on', () => {
  for (const [needle, message] of [
    ['scanUploadForCredentials', /looks for credentials in the bytes/],
    ['uploadFindingRejects', /decides which findings refuse the upload/],
    ['inspectUploadBytes', /checks the declared type against the bytes/],
  ]) {
    const tree = baseTree();
    tree['apps/web/lib/security/upload-scan.ts'] = MODULE.replaceAll(needle, 'removed');
    const result = run(fixture(tree));
    assert.equal(result.code, 1, `${needle} could be deleted`);
    assert.match(result.output, message);
  }
});

test('fails when the scanner module is gone entirely', () => {
  const tree = baseTree();
  delete tree['apps/web/lib/security/upload-scan.ts'];
  const result = run(fixture(tree));
  assert.equal(result.code, 1);
  assert.match(result.output, /is missing; nothing inspects/);
});

test('fails when the intake steps stop calling either check that stands in for reading the bytes', () => {
  for (const [needle, replacement] of [
    ['inspectUploadHead(head', 'store(head'],
    ['submitSourceScan(request', 'store(request'],
  ]) {
    const tree = baseTree();
    tree[STEPS_FILE] = STEPS.replace(needle, replacement);
    const result = run(fixture(tree));
    assert.equal(result.code, 1, `the intake steps could drop ${needle}`);
    assert.match(result.output, new RegExp(`defers inspection to ${escapeRegExp(STEPS_FILE)}`));
  }
});

test('fails when another file writes a chat-attachment media row', () => {
  for (const writer of ['insertMediaAsset', 'insertMediaAssetsAtomically']) {
    const tree = baseTree();
    tree['apps/web/lib/server/shortcut-upload.ts'] = WRITES_CHAT_MEDIA.replaceAll(
      'insertMediaAsset',
      writer,
    );
    const result = run(fixture(tree));
    assert.equal(result.code, 1, `${writer} with source chat-attachment slipped through`);
    assert.match(
      result.output,
      /apps\/web\/lib\/server\/shortcut-upload\.ts writes a chat-attachment media row/,
    );
  }
});

test('passes a media write that is not a chat attachment, and a test that plants one', () => {
  const tree = baseTree();
  tree['apps/web/lib/server/generated-image.ts'] = WRITES_CHAT_MEDIA.replace(
    "'chat-attachment'",
    "'generated-image'",
  );
  tree['apps/web/lib/server/__tests__/planted.test.ts'] = WRITES_CHAT_MEDIA;
  tree['apps/web/lib/server/planted.test.ts'] = WRITES_CHAT_MEDIA;
  const result = run(fixture(tree));
  assert.equal(result.code, 0, result.output);
});

test('fails when any file but the seal calls the scanned media insert', () => {
  const tree = baseTree();
  tree['apps/web/app/api/files/intakes/[intakeId]/finish.ts'] = SEAL;
  const result = run(fixture(tree));
  assert.equal(result.code, 1);
  assert.match(
    result.output,
    /intakes\/\[intakeId\]\/finish\.ts calls insertScannedChatFileMediaAsset/,
  );
  assert.doesNotMatch(result.output, /media-assets\.ts calls/);
});
