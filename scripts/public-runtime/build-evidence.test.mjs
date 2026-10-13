import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildEvidenceReader, collectBuildEvidence, proofDockerfile } from './build-evidence.mjs';
import { digest } from './proof.mjs';

function temporaryBuild(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'public-build-evidence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const server = path.join(directory, 'server');
  const output = path.join(directory, 'evidence');
  mkdirSync(server);
  writeFileSync(path.join(directory, 'BUILD_ID'), 'test-build');
  writeFileSync(path.join(server, 'render.js'), 'function render(){return 1;}');
  writeFileSync(path.join(server, 'render.js.map'), '{"version":3}');
  return { server, output, revision: 'a'.repeat(40) };
}

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

test('collection retains emitted pairs and records a map without executable JavaScript', (t) => {
  const { server, output, revision } = temporaryBuild(t);
  mkdirSync(path.join(server, 'edge/chunks'), { recursive: true });
  writeFileSync(path.join(server, 'edge/chunks/wrapper.js.map'), '{"version":3}');
  const manifest = collectBuildEvidence(server, output, revision);
  assert.deepEqual(Object.keys(manifest.maps), ['render.js']);
  assert.deepEqual(manifest.orphanMaps, ['edge/chunks/wrapper.js.map']);
  assert.equal(
    buildEvidenceReader(server, output, { revision, buildId: 'test-build' })(
      path.join(server, 'render.js.map'),
    ),
    '{"version":3}',
  );
});

test('collection does not suppress adjacent JavaScript read failures other than ENOENT', (t) => {
  const { server, output, revision } = temporaryBuild(t);
  mkdirSync(path.join(server, 'invalid.js'));
  writeFileSync(path.join(server, 'invalid.js.map'), '{"version":3}');
  assert.throws(() => collectBuildEvidence(server, output, revision), { code: 'EISDIR' });
});

test('an orphan map cannot later satisfy a required runtime script binding', (t) => {
  const { server, output, revision } = temporaryBuild(t);
  writeFileSync(path.join(server, 'missing.js.map'), '{"version":3}');
  collectBuildEvidence(server, output, revision);
  writeFileSync(path.join(server, 'missing.js'), 'function requiredRender(){return 1;}');
  const read = buildEvidenceReader(server, output, { revision, buildId: 'test-build' });
  assert.throws(() => read(path.join(server, 'missing.js.map')), /No source map is bound/);
});
