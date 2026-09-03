#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, '..');
const outputFile = path.join(mobileRoot, 'src/features/legal/licenses.generated.ts');

const LICENSE_FILE_NAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'license',
  'license.md',
  'license.txt',
  'LICENCE',
  'LICENCE.md',
  'LICENCE.txt',
  'LICENSE-MIT',
  'LICENSE-MIT.txt',
  'LICENSE-APACHE',
  'COPYING',
  'COPYING.txt',
];

const FIRST_PARTY_SCOPE = '@agiworkforce/';

function resolvePackageJson(name, fromDir) {
  try {
    return createRequire(path.join(fromDir, 'noop.js')).resolve(`${name}/package.json`);
  } catch {
    return null;
  }
}

function licenseIdOf(meta) {
  if (typeof meta.license === 'string') return meta.license;
  if (meta.license && typeof meta.license.type === 'string') return meta.license.type;
  if (Array.isArray(meta.licenses)) {
    const ids = meta.licenses
      .map((entry) => (typeof entry === 'string' ? entry : entry?.type))
      .filter(Boolean);
    if (ids.length > 0) return ids.join(' OR ');
  }
  return 'UNKNOWN';
}

function urlOf(meta) {
  if (typeof meta.homepage === 'string' && meta.homepage.startsWith('http')) return meta.homepage;
  const repo = meta.repository;
  const raw = typeof repo === 'string' ? repo : typeof repo?.url === 'string' ? repo.url : null;
  if (!raw) return null;
  const cleaned = raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '')
    // Attribution points at the project, not at a directory inside a monorepo.
    .replace(/\/(?:tree|blob)\/.*$/, '');
  return cleaned.startsWith('http') ? cleaned : null;
}

function readLicenseText(dir) {
  for (const name of LICENSE_FILE_NAMES) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return fs.readFileSync(candidate, 'utf8').replace(/\r\n/g, '\n').trim();
    }
  }
  return null;
}

function isCopyrightLine(line) {
  if (!/^\s*(?:copyright\b|\(c\)|©)/i.test(line)) return false;
  return /(?:\b(?:19|20)\d{2}\b|©|\(c\))/i.test(line);
}

function splitCopyright(text) {
  const lines = text.split('\n');
  const copyright = lines.filter(isCopyrightLine).map((line) => line.trim());
  const body = lines
    .filter((line) => !isCopyrightLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { copyright: copyright.join(' ') || null, body };
}

function collectPackages() {
  const manifest = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));
  const queue = Object.keys(manifest.dependencies ?? {}).map((name) => [name, mobileRoot]);
  const byPath = new Map();
  const unresolved = new Set();

  while (queue.length > 0) {
    const [name, fromDir] = queue.shift();
    if (name.startsWith(FIRST_PARTY_SCOPE)) continue;

    const packageJsonPath = resolvePackageJson(name, fromDir);
    if (!packageJsonPath) {
      unresolved.add(name);
      continue;
    }
    if (byPath.has(packageJsonPath)) continue;

    const meta = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    byPath.set(packageJsonPath, meta);

    const dir = path.dirname(packageJsonPath);
    for (const dependency of Object.keys(meta.dependencies ?? {})) {
      queue.push([dependency, dir]);
    }
  }

  return { byPath, unresolved };
}

function build() {
  const { byPath, unresolved } = collectPackages();
  const bodies = new Map();
  const packages = [];

  for (const [packageJsonPath, meta] of byPath) {
    const text = readLicenseText(path.dirname(packageJsonPath));
    let bodyId = null;
    let copyright = null;

    if (text) {
      const split = splitCopyright(text);
      copyright = split.copyright;
      if (split.body) {
        bodyId = createHash('sha1').update(split.body).digest('hex').slice(0, 10);
        if (!bodies.has(bodyId)) bodies.set(bodyId, split.body);
      }
    }

    packages.push({
      name: meta.name ?? path.basename(path.dirname(packageJsonPath)),
      version: meta.version ?? '0.0.0',
      license: licenseIdOf(meta),
      copyright,
      bodyId,
      url: urlOf(meta),
    });
  }

  packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

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
      `${JSON.stringify(Object.fromEntries(bodies), null, 2)};`,
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
