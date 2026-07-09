#!/usr/bin/env node
/**
 * Regenerate the TypeScript bindings for crates/agiworkforce-protocol into
 * packages/types/src/generated/protocol (restructure Wave 5 stage b).
 *
 * The tree is COMMITTED (web/Vercel builds cannot run cargo). Drift guard:
 * `pnpm check:protocol-types` runs this script and fails on any resulting
 * git diff under the generated directory.
 *
 * Steps: wipe the target dir -> run the crate's export_bindings test with
 * TS_RS_EXPORT_DIR pointed at it -> write an index.ts barrel -> prettier.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'packages', 'types', 'src', 'generated', 'protocol');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

execSync('cargo test -p agiworkforce-protocol --test export_bindings', {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, TS_RS_EXPORT_DIR: outDir },
});

/** Collect every generated .ts file (ts-rs may nest via per-type export_to dirs). */
function collectTsFiles(dir, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      files.push(`${prefix}${entry.name.replace(/\.ts$/, '')}`);
    }
  }
  return files;
}

const modules = collectTsFiles(outDir).sort();

// Guard against duplicate type names across modules: `export *` would clash.
const seen = new Map();
for (const mod of modules) {
  const base = path.basename(mod);
  if (seen.has(base)) {
    console.error(
      `Duplicate generated type name "${base}" (${seen.get(base)} vs ${mod}). ` +
        'Disambiguate the Rust type names or adjust export roots.',
    );
    process.exit(1);
  }
  seen.set(base, mod);
}

const banner = [
  '// GENERATED FILE — do not edit by hand.',
  '// Produced by scripts/generate-protocol-types.mjs from crates/agiworkforce-protocol',
  '// (ts-rs). Regenerate with: pnpm check:protocol-types',
  '',
].join('\n');

const barrel = banner + modules.map((mod) => `export * from './${mod}';`).join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'index.ts'), barrel);

execSync(`pnpm exec prettier --write "${path.relative(repoRoot, outDir)}/**/*.ts"`, {
  cwd: repoRoot,
  stdio: 'inherit',
});

console.log(
  `Generated ${modules.length} protocol type modules into ${path.relative(repoRoot, outDir)}`,
);
