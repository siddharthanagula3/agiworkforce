#!/usr/bin/env node
/**
 * Generates the in-app open-source attribution list.
 *
 *   node apps/mobile/scripts/generate-oss-licenses.mjs
 *
 * Walks the mobile app's production dependency graph with the shared
 * scripts/lib/third-party-notices.mjs collector and writes
 * `src/features/legal/licenses.generated.ts`. Each package keeps its own
 * copyright lines; the license, copying and notice files it ships become one
 * shared body, stored once for every package that ships the same files.
 *
 * Run it after changing dependencies and commit the result: the app bundles the
 * generated module, so a stale file is a stale attribution notice.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildNotices,
  collectNpmProductionGraph,
  textId,
} from '../../../scripts/lib/third-party-notices.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, '..');
const outputFile = path.join(mobileRoot, 'src/features/legal/licenses.generated.ts');

function build() {
  const records = new Map();
  const unresolved = collectNpmProductionGraph(records, mobileRoot, 'mobile');
  const notices = buildNotices(records);
  const bodies = new Map();

  const packages = notices.packages.map((pkg) => {
    let bodyId = null;
    if (pkg.textIds.length > 0) {
      const body = pkg.textIds.map((id) => notices.texts[id]).join('\n\n');
      bodyId = pkg.textIds.length === 1 ? pkg.textIds[0] : textId(body);
      bodies.set(bodyId, body);
    }
    return {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      copyright: pkg.copyright.join(' ') || null,
      bodyId,
      url: pkg.url,
    };
  });

  const sortedBodies = Object.fromEntries(
    [...bodies.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  const source = [
    '/**',
    ' * GENERATED FILE, do not edit by hand.',
    ' *',
    ' * Regenerate with: node apps/mobile/scripts/generate-oss-licenses.mjs',
    ' *',
    " * Attribution for the app's production dependency graph. License bodies are",
    ' * shared between packages that ship identical text; each package keeps its own',
    ' * copyright line.',
    ' */',
    "import type { OssLicenseAttribution } from './types';",
    '',
    `export const OSS_LICENSES_GENERATED_AT = ${JSON.stringify(new Date().toISOString())};`,
    '',
    'export const OSS_LICENSE_BODIES: Record<string, string> = ' +
      `${JSON.stringify(sortedBodies, null, 2)};`,
    '',
    `export const OSS_PACKAGES: OssLicenseAttribution[] = ${JSON.stringify(packages, null, 2)};`,
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, source, 'utf8');

  console.log(
    `Wrote ${path.relative(process.cwd(), outputFile)}: ` +
      `${packages.length} packages, ${bodies.size} unique license bodies.`,
  );
  if (unresolved.size > 0) {
    console.log(`Skipped ${unresolved.size} unresolved (optional/peer) dependencies.`);
  }
}

build();
