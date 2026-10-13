import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { digest } from './proof.mjs';

export function proofDockerfile(canonical) {
  if (!/^FROM .+ AS builder$/m.test(canonical) || !/^FROM .+ AS runner$/m.test(canonical))
    throw new Error('The canonical web build stages changed');
  return (
    canonical.trimEnd() +
    '\n\nFROM builder AS public_runtime_evidence\n' +
    'RUN node /repo/scripts/public-runtime/build-evidence.mjs collect /repo/apps/web/.next/server /proof-build/server\n\n' +
    'FROM runner AS public_runtime_proof\nCOPY --from=public_runtime_evidence --chown=node:node /proof-build /proof-build\n'
  );
}

export function collectBuildEvidence(serverRoot, outputRoot, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? ''))
    throw new Error('Build evidence requires an exact source revision');
  const maps = {};
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Build evidence refuses symbolic server files');
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && filename.endsWith('.js.map')) {
        const relative = path.relative(serverRoot, filename.slice(0, -4)).split(path.sep).join('/');
        const generated = readFileSync(filename.slice(0, -4));
        const map = readFileSync(filename);
        const archive = `${relative}.map.gz`;
        const destination = path.join(outputRoot, archive);
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, gzipSync(map));
        maps[relative] = { generatedDigest: digest(generated), mapDigest: digest(map), archive };
      }
    }
  };
  visit(serverRoot);
  if (!Object.keys(maps).length) throw new Error('The production build emitted no server maps');
  const manifest = {
    revision,
    buildId: readFileSync(path.join(serverRoot, '../BUILD_ID'), 'utf8').trim(),
    maps,
  };
  writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

export function buildEvidenceReader(serverRoot, evidenceRoot, expected, read = readFileSync) {
  const manifest = JSON.parse(read(path.join(evidenceRoot, 'manifest.json'), 'utf8'));
  if (manifest.revision !== expected.revision || manifest.buildId !== expected.buildId)
    throw new Error('Source maps belong to a different production build');
  const cache = new Map();
  return (filename) => {
    if (!filename.endsWith('.map')) return read(filename, 'utf8');
    const generatedFile = filename.slice(0, -4);
    const relative = path.relative(serverRoot, generatedFile).split(path.sep).join('/');
    if (relative.startsWith('../') || path.isAbsolute(relative))
      throw new Error('Source map escaped the production server');
    const binding = manifest.maps[relative];
    if (!binding || binding.archive !== `${relative}.map.gz`)
      throw new Error('No source map is bound to this runtime script');
    if (!cache.has(relative)) {
      if (digest(read(generatedFile)) !== binding.generatedDigest)
        throw Object.assign(
          new Error('Runtime JavaScript differs from its build-phase source map'),
          { code: 'BUILD_EVIDENCE_MISMATCH' },
        );
      let map;
      try {
        map = gunzipSync(read(path.join(evidenceRoot, binding.archive)), {
          maxOutputLength: 256 * 1024 * 1024,
        });
      } catch (error) {
        throw Object.assign(new Error('Build-phase source map is unreadable', { cause: error }), {
          code: 'BUILD_EVIDENCE_MISMATCH',
        });
      }
      if (digest(map) !== binding.mapDigest)
        throw Object.assign(new Error('Build-phase source map digest changed'), {
          code: 'BUILD_EVIDENCE_MISMATCH',
        });
      cache.set(relative, map.toString('utf8'));
    }
    return cache.get(relative);
  };
}

if (process.argv[1]?.endsWith('/build-evidence.mjs')) {
  if (process.argv[2] === 'dockerfile')
    process.stdout.write(
      proofDockerfile(readFileSync(new URL('../../apps/web/Dockerfile', import.meta.url), 'utf8')),
    );
  else if (process.argv[2] === 'collect')
    collectBuildEvidence(process.argv[3], process.argv[4], process.env.AGI_RELEASE_SHA);
  else throw new Error('Unknown build evidence operation');
}
