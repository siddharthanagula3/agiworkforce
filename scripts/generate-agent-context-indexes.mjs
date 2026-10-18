#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const outDir = path.join(repoRoot, 'docs', 'agent-context', 'generated');

function readJsonFile(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function runJson(command, args) {
  const stdout = execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

export function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildTypeScriptGraph() {
  const dryRun = runJson('pnpm', ['exec', 'turbo', 'run', 'build', '--dry=json']);
  const nodes = [...new Set(dryRun.packages ?? [])].sort();

  const edgeKeys = new Set();
  for (const task of dryRun.tasks ?? []) {
    const from = task.package;
    for (const dependencyTaskId of task.dependencies ?? []) {
      const separatorIndex = dependencyTaskId.lastIndexOf('#');
      const to =
        separatorIndex === -1 ? dependencyTaskId : dependencyTaskId.slice(0, separatorIndex);
      if (to === from) continue;
      edgeKeys.add(`${from}\u0000${to}`);
    }
  }
  const edges = [...edgeKeys]
    .map((key) => {
      const [from, to] = key.split('\u0000');
      return { from, to };
    })
    .sort((a, b) => `${a.from}\u0000${a.to}`.localeCompare(`${b.from}\u0000${b.to}`));

  return { nodes, edges };
}

function buildRustGraph() {
  const metadata = runJson('cargo', ['metadata', '--format-version=1', '--no-deps']);
  const memberDirsByName = new Map(
    metadata.packages.map((pkg) => [pkg.name, path.dirname(pkg.manifest_path)]),
  );
  const nodes = [...memberDirsByName.keys()].sort();

  const edgeKeys = new Set();
  for (const pkg of metadata.packages) {
    for (const dependency of pkg.dependencies ?? []) {
      if (!dependency.path) continue;
      const resolvedDir = memberDirsByName.get(dependency.name);
      if (!resolvedDir || resolvedDir !== dependency.path) continue;
      if (dependency.name === pkg.name) continue;
      edgeKeys.add(`${pkg.name}\u0000${dependency.name}`);
    }
  }
  const edges = [...edgeKeys]
    .map((key) => {
      const [from, to] = key.split('\u0000');
      return { from, to };
    })
    .sort((a, b) => `${a.from}\u0000${a.to}`.localeCompare(`${b.from}\u0000${b.to}`));

  return { nodes, edges };
}

export function buildDependencyGraph() {
  return {
    generatedFrom:
      'pnpm exec turbo run build --dry=json (typescript) + cargo metadata --no-deps (rust)',
    typescript: buildTypeScriptGraph(),
    rust: buildRustGraph(),
  };
}

const readmeMetadataLinePattern =
  /^(Status|Owner|Owner role|Last updated|Kind|Criticality|Extends|Related):/i;

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function scrapeReadmePurpose(readmePath) {
  if (!fs.existsSync(readmePath)) return null;
  const lines = fs.readFileSync(readmePath, 'utf8').split('\n');

  const purposeHeadingIndex = lines.findIndex((line) => /^##\s+(Purpose|Scope)\b/i.test(line));
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line));
  const startIndex =
    purposeHeadingIndex !== -1 ? purposeHeadingIndex + 1 : titleIndex === -1 ? 0 : titleIndex + 1;

  const paragraph = [];
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (line.startsWith('#')) break;
    if (purposeHeadingIndex === -1 && readmeMetadataLinePattern.test(line)) continue;
    if (purposeHeadingIndex === -1 && /^Read root /i.test(line)) continue;
    paragraph.push(line);
  }
  if (paragraph.length === 0) return null;

  const collapsed = collapseWhitespace(paragraph.join(' '));
  return collapsed.length > 240 ? `${collapsed.slice(0, 237)}...` : collapsed;
}

function derivePurpose(unitDir) {
  const packageJsonPath = path.join(unitDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const description = readJsonFile(packageJsonPath).description;
    if (typeof description === 'string' && description.trim()) return description.trim();
  }

  const cargoTomlPath = path.join(unitDir, 'Cargo.toml');
  if (fs.existsSync(cargoTomlPath)) {
    const match = fs
      .readFileSync(cargoTomlPath, 'utf8')
      .match(/^description\s*=\s*"((?:[^"\\]|\\.)*)"/m);
    if (match) return match[1].replace(/\\"/g, '"').trim();
  }

  const scraped = scrapeReadmePurpose(path.join(unitDir, 'README.md'));
  if (scraped) return scraped;

  return 'unknown';
}

function deriveName(unitDir, unitPath) {
  const packageJsonPath = path.join(unitDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const name = readJsonFile(packageJsonPath).name;
    if (typeof name === 'string' && name.trim()) return name;
  }

  const cargoTomlPath = path.join(unitDir, 'Cargo.toml');
  if (fs.existsSync(cargoTomlPath)) {
    const match = fs.readFileSync(cargoTomlPath, 'utf8').match(/^name\s*=\s*"([^"]+)"/m);
    if (match) return match[1];
  }

  return path.basename(unitPath);
}

// repo-map.json is hand-maintained and seeds every generated summary, so a unit
// missing from it is invisible to every agent reading the generated map , and
// the drift check cannot see the gap, because it compares the render to itself.
// packages/ai/providers/minimax was absent for exactly that reason. The
// assertion is one-directional and scoped to manifest-bearing workspace roots:
// the reverse direction produces false positives for legitimate manifest-less
// units (packages/ai/providers as a group, tools/skill-vetting).
const COVERED_ROOTS = ['packages', 'crates', 'services'];

function manifestBearingUnits() {
  const found = [];
  const walk = (relative, depth) => {
    const absolute = path.join(repoRoot, relative);
    if (!fs.existsSync(absolute)) return;
    const hasManifest =
      fs.existsSync(path.join(absolute, 'package.json')) ||
      fs.existsSync(path.join(absolute, 'Cargo.toml'));
    if (hasManifest) {
      found.push(relative);
      return;
    }
    if (depth === 0) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      walk(path.posix.join(relative, entry.name), depth - 1);
    }
  };
  for (const root of COVERED_ROOTS) walk(root, 3);
  return found;
}

function assertRepoMapCoverage(units) {
  const mapped = new Set(units.map((unit) => unit.path));
  const missing = manifestBearingUnits().filter((unit) => !mapped.has(unit));
  if (missing.length > 0) {
    throw new Error(
      `docs/agent-context/repo-map.json#workspaceUnits is missing ${missing.length} workspace unit(s) that carry a manifest:\n` +
        missing.map((unit) => `  - ${unit}`).join('\n') +
        '\nAdd each with its canonicalOwner, trustBoundary, action and evidence; those fields have no machine-readable source.',
    );
  }
}

export function buildModuleSummaries() {
  const repoMap = readJsonFile(path.join(repoRoot, 'docs', 'agent-context', 'repo-map.json'));
  const units = [...(repoMap.workspaceUnits ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  assertRepoMapCoverage(units);

  const summaries = units.map((unit) => {
    const unitDir = path.join(repoRoot, unit.path);
    return {
      name: deriveName(unitDir, unit.path),
      path: unit.path,
      kind: unit.kind,
      purpose: derivePurpose(unitDir),
    };
  });

  return {
    generatedFrom:
      "docs/agent-context/repo-map.json#workspaceUnits (unit list) + each unit's package.json description / Cargo.toml description / README.md ## Purpose|Scope section",
    units: summaries,
  };
}

function listTopLevelModules(srcDir, { excludeDirs = [] } = {}) {
  if (!fs.existsSync(srcDir)) return [];
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  const modules = [];
  for (const entry of entries) {
    if (entry.name.startsWith('__')) continue;
    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) continue;
      modules.push(entry.name);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      modules.push(entry.name.replace(/\.ts$/, ''));
    }
  }
  return modules.sort();
}

export function buildContractRegistry() {
  const typesSrcDir = path.join(repoRoot, 'packages', 'contracts', 'types', 'src');
  const cloudContractsSrcDir = path.join(
    repoRoot,
    'packages',
    'contracts',
    'cloud-contracts',
    'src',
  );
  const protocolDir = path.join(typesSrcDir, 'generated', 'protocol');

  const typesModules = listTopLevelModules(typesSrcDir, { excludeDirs: ['generated'] });
  const cloudContractsModules = listTopLevelModules(cloudContractsSrcDir);
  const generatedProtocolTypeCount = fs.existsSync(protocolDir)
    ? fs
        .readdirSync(protocolDir, { withFileTypes: true })
        .filter(
          (entry) => entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts',
        ).length
    : 0;

  return {
    generatedFrom:
      'packages/contracts/types/src top-level modules (excl. generated/, __tests__) + packages/contracts/cloud-contracts/src top-level modules + packages/contracts/types/src/generated/protocol file count (ts-rs output from crates/agiworkforce-protocol)',
    typesModules,
    cloudContractsModules,
    generatedProtocolTypeCount,
  };
}

const DO_NOT_EDIT =
  'GENERATED FILE, do not edit. Run `node scripts/generate-agent-context-indexes.mjs`; `pnpm check:agent-context-indexes` byte-compares this against a fresh render.';

function marked(value) {
  return { $generated: DO_NOT_EDIT, ...value };
}

export function renderIndexes() {
  return {
    'dependency-graph.json': marked(buildDependencyGraph()),
    'module-summaries.json': marked(buildModuleSummaries()),
    'contract-registry.json': marked(buildContractRegistry()),
  };
}

function main() {
  const indexes = renderIndexes();
  fs.mkdirSync(outDir, { recursive: true });
  for (const [fileName, value] of Object.entries(indexes)) {
    fs.writeFileSync(path.join(outDir, fileName), serialize(value));
  }
  console.log(
    `Wrote ${Object.keys(indexes).length} generated indexes to ${path.relative(repoRoot, outDir)}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
