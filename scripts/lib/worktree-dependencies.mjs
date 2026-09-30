import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function bytesMatch(source, candidate, label) {
  if (fs.existsSync(source) !== fs.existsSync(candidate)) throw new Error(`${label} mismatch`);
  if (fs.existsSync(source) && !fs.readFileSync(source).equals(fs.readFileSync(candidate))) {
    throw new Error(`${label} mismatch`);
  }
}

function manifest(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || typeof value.name !== 'string' || !value.name) throw new Error();
    return value;
  } catch {
    throw new Error('invalid dependency package manifest');
  }
}

function workspaces(root) {
  let output;
  try {
    output = execFileSync('pnpm', ['-r', 'list', '--depth', '-1', '--parseable'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('workspace dependency inventory could not be read');
  }
  const roots = new Set([root, ...output.trim().split('\n').filter(Boolean)]);
  return [...roots]
    .map((directory) => {
      const absolute = path.resolve(directory);
      if (!inside(root, absolute) || !inside(root, fs.realpathSync(absolute))) {
        throw new Error('workspace dependency inventory escapes the checkout');
      }
      return {
        relative: path.relative(root, absolute),
        directory: absolute,
        manifest: manifest(path.join(absolute, 'package.json')),
      };
    })
    .sort((a, b) => a.relative.localeCompare(b.relative));
}

function lockfile(file) {
  try {
    const value = parse(fs.readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object') throw new Error();
    return value;
  } catch {
    throw new Error('installed dependency lockfile could not be verified');
  }
}

function verifyInstalled(sourceRoot, packages) {
  const expected = lockfile(path.join(sourceRoot, 'pnpm-lock.yaml'));
  const installed = lockfile(path.join(sourceRoot, 'node_modules/.pnpm/lock.yaml'));
  for (const section of ['lockfileVersion', 'settings', 'packages', 'snapshots']) {
    if (!isDeepStrictEqual(expected[section], installed[section])) {
      throw new Error(`installed dependency lockfile ${section} mismatch`);
    }
  }
  for (const entry of packages) {
    const importer = expected.importers?.[entry.relative.split(path.sep).join('/') || '.'];
    if (!importer) throw new Error('workspace dependency lockfile importer is missing');
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name] of Object.entries(entry.manifest[section] ?? {})) {
        const resolved = importer[section]?.[name]?.version;
        if (typeof resolved !== 'string')
          throw new Error('workspace dependency lockfile resolution is missing');
        const file = path.join(entry.directory, 'node_modules', name, 'package.json');
        if (!fs.existsSync(file)) {
          if (section === 'optionalDependencies') continue;
          throw new Error('required installed dependency manifest is missing');
        }
        const actual = manifest(file);
        if (resolved.startsWith('link:')) {
          const target = path.resolve(entry.directory, resolved.slice(5));
          const workspace = packages.find((item) => item.directory === target);
          if (!workspace || workspace.manifest.name !== actual.name) {
            throw new Error('installed workspace dependency resolution mismatch');
          }
          bytesMatch(file, path.join(target, 'package.json'), 'installed workspace manifest');
          continue;
        }
        const version = resolved.split('(')[0];
        if (!(
          (version === actual.version && name === actual.name) ||
          version === `${actual.name}@${actual.version}`
        )) {
          throw new Error('installed dependency version mismatch');
        }
      }
    }
  }
}

function packageLocation(file) {
  return /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+$/.test(file.split(path.sep).join('/'));
}

export function reuseWorktreeDependencies(source, candidate) {
  const sourceRoot = fs.realpathSync(source);
  const candidateRoot = fs.realpathSync(candidate);
  const sourceSpelling = path.resolve(source);
  if (sourceRoot === candidateRoot)
    throw new Error('dependency candidate must be a separate checkout');
  for (const file of [
    'package.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.npmrc',
    '.pnpmfile.cjs',
  ]) {
    bytesMatch(
      path.join(sourceRoot, file),
      path.join(candidateRoot, file),
      `${file === 'package.json' ? 'root manifest' : file}`,
    );
  }
  if (!fs.existsSync(path.join(sourceRoot, 'package.json'))) {
    if (fs.existsSync(path.join(sourceRoot, 'node_modules')))
      throw new Error('dependency workspace manifest is missing');
    return;
  }
  const sourcePackages = workspaces(sourceRoot);
  const candidatePackages = workspaces(candidateRoot);
  if (
    !isDeepStrictEqual(
      sourcePackages.map((p) => p.relative),
      candidatePackages.map((p) => p.relative),
    )
  ) {
    throw new Error('workspace manifest inventory mismatch');
  }
  const byName = new Map();
  const roots = [];
  const modules = [];
  for (const entry of sourcePackages) {
    const destination = path.join(candidateRoot, entry.relative);
    bytesMatch(
      path.join(entry.directory, 'package.json'),
      path.join(destination, 'package.json'),
      'workspace manifest',
    );
    if (byName.has(entry.manifest.name)) throw new Error('workspace manifest names must be unique');
    byName.set(entry.manifest.name, { source: entry.directory, candidate: destination });
    roots.push({ source: entry.directory, candidate: destination });
    roots.push({ source: path.join(sourceSpelling, entry.relative), candidate: destination });
    const nodeModules = path.join(entry.directory, 'node_modules');
    if (fs.existsSync(nodeModules)) {
      const sourceModules = fs.realpathSync(nodeModules);
      const targetModules = path.join(destination, 'node_modules');
      roots.push({ source: sourceModules, candidate: targetModules });
      roots.push({
        source: path.join(sourceSpelling, entry.relative, 'node_modules'),
        candidate: targetModules,
      });
      modules.push({ source: sourceModules, candidate: targetModules });
    }
  }
  if (modules.length === 0) return;
  verifyInstalled(sourceRoot, sourcePackages);
  roots.sort((a, b) => b.source.length - a.source.length);
  const replacements = new Map(roots.map((entry) => [entry.source, entry.candidate]));
  const sourcePaths = [...replacements.keys()]
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const shimPaths = new RegExp(`(?:${sourcePaths})(?=$|[/\\\\:;"'\\s])|/[^\\s"'\x60:;()<>|]+`, 'g');
  const links = [];

  function localTarget(file) {
    const root = roots.find((entry) => inside(entry.source, file));
    if (!root) throw new Error('dependency link target is outside the verified inventory');
    return path.join(root.candidate, path.relative(root.source, file));
  }

  function link(target, destination) {
    if (!inside(candidateRoot, target)) throw new Error('dependency link escapes the candidate');
    fs.symlinkSync(path.relative(path.dirname(destination), target) || '.', destination);
    links.push(destination);
  }

  function workspaceTarget(file) {
    if (!packageLocation(file) || !fs.existsSync(path.join(file, 'package.json'))) return null;
    const installedManifest = manifest(path.join(file, 'package.json'));
    const entry = byName.get(installedManifest.name);
    if (!entry) return null;
    bytesMatch(
      path.join(file, 'package.json'),
      path.join(entry.source, 'package.json'),
      'installed workspace manifest',
    );
    return entry.candidate;
  }

  function mirror(file, destination) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      if (path.isAbsolute(fs.readlinkSync(file)))
        throw new Error('absolute dependency link cannot be reused');
      let target;
      try {
        target = fs.realpathSync(file);
      } catch {
        throw new Error('dependency link could not be safely resolved');
      }
      link(workspaceTarget(file) ?? localTarget(target), destination);
      return;
    }
    if (stat.isDirectory()) {
      const workspace = workspaceTarget(file);
      if (workspace) {
        link(workspace, destination);
        return;
      }
      fs.mkdirSync(destination, { mode: stat.mode & 0o777 });
      for (const name of fs.readdirSync(file))
        mirror(path.join(file, name), path.join(destination, name));
      return;
    }
    if (!stat.isFile()) throw new Error('unsupported installed dependency entry');
    if (file.split(path.sep).includes('.bin')) {
      const original = fs.readFileSync(file);
      let text = original.toString('utf8');
      if (Buffer.from(text).equals(original)) {
        text = text.replace(shimPaths, (matched) => {
          if (replacements.has(matched)) return replacements.get(matched);
          let resolved;
          try {
            resolved = fs.realpathSync(matched);
          } catch {
            return matched;
          }
          const root = roots.find((entry) => inside(entry.source, resolved));
          return root ? path.join(root.candidate, path.relative(root.source, resolved)) : matched;
        });
        const rebased = Buffer.from(text);
        if (!rebased.equals(original)) {
          fs.writeFileSync(destination, rebased, { mode: stat.mode & 0o777 });
          fs.chmodSync(destination, stat.mode & 0o777);
          return;
        }
      }
    }
    try {
      fs.linkSync(file, destination);
    } catch (error) {
      if (!['EXDEV', 'EPERM', 'EACCES', 'EMLINK'].includes(error.code)) throw error;
      fs.copyFileSync(file, destination);
      fs.chmodSync(destination, stat.mode & 0o777);
    }
  }

  for (const entry of modules) {
    if (fs.existsSync(entry.candidate))
      throw new Error('candidate dependency directory must start empty');
    mirror(entry.source, entry.candidate);
  }
  for (const file of links) {
    if (!inside(candidateRoot, fs.realpathSync(file)))
      throw new Error('dependency link resolves outside the candidate');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4)
      throw new Error('source and candidate checkout paths are required');
    reuseWorktreeDependencies(process.argv[2], process.argv[3]);
  } catch (error) {
    process.stderr.write(
      `Dependency reuse failed: ${error.code ? 'installed dependency filesystem could not be safely read' : error.message}\n`,
    );
    process.exitCode = 1;
  }
}
