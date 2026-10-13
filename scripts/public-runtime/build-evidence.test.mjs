import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { buildEvidenceReader, proofDockerfile } from './build-evidence.mjs';
import { digest } from './proof.mjs';

test('the proof stage extends the canonical builder and runner without replacing either', () => {
  const original =
    'FROM node AS builder\nRUN canonical-build\nFROM node AS runner\nCOPY --from=builder /runtime /runtime\n';
  const output = proofDockerfile(original);
  assert.ok(output.startsWith(original));
  assert.match(output, /FROM builder AS public_runtime_evidence/);
  assert.match(output, /FROM runner AS public_runtime_proof/);
  assert.throws(() => proofDockerfile('FROM invented AS renamed'), /stages changed/);
});

test('server maps are usable only for their immutable build and exact generated JavaScript', () => {
  const javascript = Buffer.from('function render() { return 1; }');
  const map = Buffer.from('{"version":3}');
  const manifest = {
    revision: 'a'.repeat(40),
    buildId: 'build',
    maps: {
      'chunks/render.js': {
        generatedDigest: digest(javascript),
        mapDigest: digest(map),
        archive: 'chunks/render.js.map.gz',
      },
    },
  };
  const expected = { revision: manifest.revision, buildId: manifest.buildId };
  const files = new Map([
    ['/proof/manifest.json', JSON.stringify(manifest)],
    ['/server/chunks/render.js', javascript],
    ['/proof/chunks/render.js.map.gz', gzipSync(map)],
  ]);
  const read = (filename) => {
    if (!files.has(filename)) throw new Error('Missing file');
    return files.get(filename);
  };
  assert.equal(
    buildEvidenceReader('/server', '/proof', expected, read)('/server/chunks/render.js.map'),
    map.toString(),
  );
  assert.throws(
    () => buildEvidenceReader('/server', '/proof', { ...expected, buildId: 'different' }, read),
    /different production build/,
  );
  files.set('/server/chunks/render.js', Buffer.from('unrelated code'));
  assert.throws(
    () => buildEvidenceReader('/server', '/proof', expected, read)('/server/chunks/render.js.map'),
    /JavaScript differs/,
  );
  files.set('/server/chunks/render.js', javascript);
  files.set('/proof/chunks/render.js.map.gz', gzipSync(Buffer.from('changed map')));
  assert.throws(
    () => buildEvidenceReader('/server', '/proof', expected, read)('/server/chunks/render.js.map'),
    /map digest changed/,
  );
});
