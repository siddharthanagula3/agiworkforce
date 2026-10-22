import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const FIRST_PARTY_SCOPE = '@agiworkforce/';
const NOTICE_FILE = /^(?:licen[cs]e|copying|notice|unlicense)(?:[-._][\w.-]*)?$/i;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function npmLicenseOf(meta) {
  if (typeof meta.license === 'string' && meta.license.trim()) return meta.license.trim();
  if (meta.license && typeof meta.license.type === 'string') return meta.license.type;
  if (Array.isArray(meta.licenses)) {
    const ids = meta.licenses
      .map((entry) => (typeof entry === 'string' ? entry : entry?.type))
      .filter(Boolean);
    if (ids.length > 0) return ids.join(' OR ');
  }
  return 'UNKNOWN';
}

function projectRoot(url) {
  return url.replace(/#readme$/i, '').replace(/\/(?:tree|blob)\/.*$/, '');
}

export function projectUrl(homepage, repository) {
  if (typeof homepage === 'string' && /^https?:\/\//.test(homepage)) return projectRoot(homepage);
  const raw =
    typeof repository === 'string'
      ? repository
      : typeof repository?.url === 'string'
        ? repository.url
        : null;
  if (!raw) return null;
  const cleaned = raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^github:/, 'https://github.com/')
    .replace(/\.git$/, '');
  if (/^[\w.-]+\/[\w.-]+$/.test(cleaned)) return `https://github.com/${cleaned}`;
  return /^https?:\/\//.test(cleaned) ? projectRoot(cleaned) : null;
}

export function readNoticeFiles(dir, extraFile) {
  const names = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && NOTICE_FILE.test(entry.name)) names.add(entry.name);
  }
  if (extraFile) {
    const relative = path.relative(dir, path.resolve(dir, extraFile));
    if (!relative.startsWith('..') && fs.existsSync(path.join(dir, relative))) names.add(relative);
  }
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) =>
      fs
        .readFileSync(path.join(dir, name), 'utf8')
        .replace(/^﻿/, '')
        .replace(/\r\n?/g, '\n')
        .trim(),
    )
    .filter(Boolean);
}

// A line counts as an attribution only when it also carries a year or a (c)/© mark: ISC's
// "copyright notice and this permission notice" and MIT's "COPYRIGHT HOLDERS BE LIABLE" start the
// same way, and lifting them would publish a mangled license.
function isCopyrightLine(line) {
  if (!/^\s*(?:copyright\b|\(c\)|©)/i.test(line)) return false;
  return /(?:\b(?:19|20)\d{2}\b|©|\(c\))/i.test(line);
}

export function splitCopyright(text) {
  const lines = text.split('\n');
  const copyright = lines.filter(isCopyrightLine).map((line) => line.trim());
  const body = lines
    .filter((line) => !isCopyrightLine(line))
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { copyright, body };
}

export function textId(body) {
  const words = body.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(words).digest('hex').slice(0, 12);
}

function resolvePackageJson(name, fromDir) {
  try {
    return createRequire(path.join(fromDir, 'noop.js')).resolve(`${name}/package.json`);
  } catch {
    let dir = fromDir;
    for (;;) {
      const candidate = path.join(dir, 'node_modules', name, 'package.json');
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

export function isFirstParty(packageJsonPath, meta) {
  if (typeof meta.name === 'string' && meta.name.startsWith(FIRST_PARTY_SCOPE)) return true;
  return !fs.realpathSync(packageJsonPath).split(path.sep).includes('node_modules');
}

export function addPackage(records, entry, source) {
  const key = `${entry.ecosystem}:${entry.name}@${entry.version}`;
  const existing = records.get(key);
  if (existing) {
    existing.sources.add(source);
    return;
  }
  records.set(key, { ...entry, sources: new Set([source]) });
}

export function addNpmPackage(records, packageJsonPath, source) {
  const meta = readJson(packageJsonPath);
  if (isFirstParty(packageJsonPath, meta)) return;
  const dir = path.dirname(packageJsonPath);
  addPackage(
    records,
    {
      ecosystem: 'npm',
      name: meta.name ?? path.basename(dir),
      version: meta.version ?? 'unversioned',
      license: npmLicenseOf(meta),
      url: projectUrl(meta.homepage, meta.repository),
      files: readNoticeFiles(dir),
    },
    source,
  );
}

export function collectNpmProductionGraph(records, manifestDir, source) {
  const manifest = readJson(path.join(manifestDir, 'package.json'));
  const queue = Object.keys(manifest.dependencies ?? {}).map((name) => [name, manifestDir]);
  const seen = new Set();
  const unresolved = new Set();
  while (queue.length > 0) {
    const [name, fromDir] = queue.shift();
    const packageJsonPath = resolvePackageJson(name, fromDir);
    if (!packageJsonPath) {
      unresolved.add(name);
      continue;
    }
    const real = fs.realpathSync(packageJsonPath);
    if (seen.has(real)) continue;
    seen.add(real);
    addNpmPackage(records, real, source);
    const meta = readJson(real);
    for (const dependency of Object.keys(meta.dependencies ?? {})) {
      queue.push([dependency, path.dirname(real)]);
    }
  }
  return unresolved;
}

export function buildNotices(records) {
  const texts = new Map();
  const packages = [...records.values()].map((record) => {
    const copyright = [];
    const textIds = [];
    for (const file of record.files) {
      const split = splitCopyright(file);
      for (const line of split.copyright) if (!copyright.includes(line)) copyright.push(line);
      if (!split.body) continue;
      const id = textId(split.body);
      const known = texts.get(id);
      if (known === undefined || split.body < known) texts.set(id, split.body);
      if (!textIds.includes(id)) textIds.push(id);
    }
    return {
      ecosystem: record.ecosystem,
      name: record.name,
      version: record.version,
      license: record.license,
      url: record.url,
      copyright,
      textIds,
      sources: [...record.sources].sort(),
    };
  });
  packages.sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      a.version.localeCompare(b.version) ||
      a.ecosystem.localeCompare(b.ecosystem),
  );
  return {
    texts: Object.fromEntries([...texts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    packages,
  };
}
