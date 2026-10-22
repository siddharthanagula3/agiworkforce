#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  addNpmPackage,
  addPackage,
  buildNotices,
  collectNpmProductionGraph,
  projectUrl,
  readNoticeFiles,
} from '../../../scripts/lib/third-party-notices.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(webRoot, '../..');
const desktopRoot = path.join(repoRoot, 'apps/desktop');
const electronRoot = path.join(desktopRoot, 'electron');
export const OUTPUT_FILE = path.join(webRoot, 'public/legal/third-party-notices.json');

const CLI_PACKAGE = 'agiworkforce-cli';
const CLI_TARGETS = ['aarch64-apple-darwin', 'x86_64-apple-darwin'];

export function packageRootOfModule(modulePath) {
  const segments = modulePath.split(/[\\/]/);
  const index = segments.lastIndexOf('node_modules');
  if (index === -1 || index + 1 >= segments.length) return null;
  const length = segments[index + 1].startsWith('@') ? index + 3 : index + 2;
  if (segments.length < length) return null;
  return segments.slice(0, length).join('/');
}

export function cargoRuntimeClosure(metadata, rootName) {
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const root = metadata.packages.find((pkg) => pkg.name === rootName && pkg.source === null);
  if (!root) throw new Error(`cargo metadata has no workspace package ${rootName}`);
  const reached = new Set([root.id]);
  const queue = [root.id];
  while (queue.length > 0) {
    const node = nodes.get(queue.shift());
    for (const dep of node?.deps ?? []) {
      const runtime = (dep.dep_kinds ?? []).some((kind) => kind.kind === null);
      if (!runtime || reached.has(dep.pkg)) continue;
      reached.add(dep.pkg);
      queue.push(dep.pkg);
    }
  }
  return [...reached].map((id) => packages.get(id)).filter((pkg) => pkg && pkg.source !== null);
}

async function collectDesktopShell(records) {
  const entryPoints = ['main.ts', 'preload.ts', 'browser/nativeHostMain.ts'].map((entry) =>
    path.join(electronRoot, entry),
  );
  if (!entryPoints.every((entry) => fs.existsSync(entry))) {
    return 'the Electron sources are not in this checkout';
  }
  const desktopRequire = createRequire(path.join(desktopRoot, 'package.json'));
  const esbuild = desktopRequire('esbuild');
  const shared = {
    absWorkingDir: repoRoot,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    write: false,
    metafile: true,
    logLevel: 'silent',
    outdir: path.join(electronRoot, 'dist'),
  };
  const builds = await Promise.all([
    esbuild.build({ ...shared, external: ['electron'], entryPoints: entryPoints.slice(0, 2) }),
    esbuild.build({ ...shared, external: [], entryPoints: entryPoints.slice(2) }),
  ]);
  const roots = new Set([path.dirname(desktopRequire.resolve('electron/package.json'))]);
  for (const result of builds) {
    for (const input of Object.keys(result.metafile.inputs)) {
      const root = packageRootOfModule(input);
      if (root) roots.add(path.resolve(repoRoot, root));
    }
  }
  for (const root of roots) addNpmPackage(records, path.join(root, 'package.json'), 'desktop');
  return null;
}

function cargoMetadata(target) {
  return spawnSync(
    'cargo',
    ['metadata', '--format-version', '1', '--locked', '--offline', '--filter-platform', target],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  );
}

function collectCli(records) {
  if (!fs.existsSync(path.join(repoRoot, 'Cargo.toml'))) {
    return 'the Cargo workspace is not in this checkout';
  }
  const closures = [];
  for (const target of CLI_TARGETS) {
    const result = cargoMetadata(target);
    if (result.error || result.status !== 0) {
      const reason = result.error?.message ?? result.stderr.trim().split('\n').pop();
      return `cargo metadata is unavailable (${reason})`;
    }
    closures.push(cargoRuntimeClosure(JSON.parse(result.stdout), CLI_PACKAGE));
  }
  for (const pkg of closures.flat()) {
    addPackage(
      records,
      {
        ecosystem: 'cargo',
        name: pkg.name,
        version: pkg.version,
        license: pkg.license ?? (pkg.license_file ? 'See license file' : 'UNKNOWN'),
        url: projectUrl(pkg.homepage, pkg.repository),
        files: readNoticeFiles(path.dirname(pkg.manifest_path), pkg.license_file),
      },
      'cli',
    );
  }
  return null;
}

export async function generate() {
  const records = new Map();
  const unresolved = collectNpmProductionGraph(records, webRoot, 'web');
  const skipped = {
    desktop: await collectDesktopShell(records),
    cli: collectCli(records),
  };
  return { notices: buildNotices(records), unresolved, skipped };
}

async function main() {
  const { notices, unresolved, skipped } = await generate();
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(notices)}\n`, 'utf8');
  console.log(
    `Wrote ${path.relative(repoRoot, OUTPUT_FILE)}: ${notices.packages.length} packages, ${Object.keys(notices.texts).length} unique notice texts.`,
  );
  for (const [source, reason] of Object.entries(skipped)) {
    if (reason) console.warn(`Left out ${source} notices: ${reason}.`);
  }
  if (unresolved.size > 0) {
    console.log(`Skipped ${unresolved.size} web dependencies that are not installed here.`);
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
