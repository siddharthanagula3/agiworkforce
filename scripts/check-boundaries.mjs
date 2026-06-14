#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ignoredParts = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  'target',
  'coverage',
  '.cache',
  '.turbo',
  '.expo',
  'Pods',
  '.vercel',
  'dist-web',
  '.vscode-test',
  'public',
  'playwright-report',
  'test-results',
]);

const uiPackages = new Set(['@agiworkforce/unified-chat', '@agiworkforce/design-tokens']);
const workspacePackages = new Map();

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectWorkspacePackages(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectWorkspacePackages(fullPath);
      continue;
    }

    if (entry.name !== 'package.json') continue;

    const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!packageJson.name) continue;

    workspacePackages.set(packageJson.name, {
      relativePath: relativePath(fullPath),
      exportedSubpaths: exportedSubpaths(packageJson.exports),
    });
  }
}

function exportedSubpaths(exportsField) {
  if (!exportsField || typeof exportsField === 'string') {
    return new Set();
  }

  if (typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    return new Set();
  }

  return new Set(
    Object.keys(exportsField)
      .filter((subpath) => subpath !== '.')
      .map((subpath) => subpath.replace(/^\.\//, '')),
  );
}

function importsFrom(source) {
  const imports = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]+?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
}

function relativePath(fullPath) {
  return path.relative(root, fullPath).split(path.sep).join('/');
}

function resolveRelativeImport(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.normalize(path.resolve(path.dirname(file), specifier));
}

function appNameFromPath(relative) {
  const parts = relative.split('/');
  return parts[0] === 'apps' ? parts[1] : null;
}

const scanRoots = ['apps', 'packages', 'services']
  .map((dir) => path.join(root, dir))
  .filter((dir) => fs.existsSync(dir));

collectWorkspacePackages(path.join(root, 'packages'));

for (const scanRoot of scanRoots) {
  for (const file of walk(scanRoot)) {
    const rel = relativePath(file);
    const source = fs.readFileSync(file, 'utf8');
    const imports = importsFrom(source);

    for (const specifier of imports) {
      const resolved = resolveRelativeImport(file, specifier);

      if (rel.startsWith('apps/')) {
        const currentApp = appNameFromPath(rel);
        if (resolved) {
          const resolvedRel = relativePath(resolved);
          const importedApp = appNameFromPath(resolvedRel);
          if (importedApp && importedApp !== currentApp) {
            errors.push(`${rel} imports another app via ${specifier}`);
          }
        }
        if (specifier.startsWith('apps/')) {
          errors.push(`${rel} imports another app via root path ${specifier}`);
        }
      }

      if (rel.startsWith('packages/')) {
        if (resolved) {
          const resolvedRel = relativePath(resolved);
          if (resolvedRel.startsWith('apps/')) {
            errors.push(`${rel} imports app code via ${specifier}`);
          }
        }
        if (
          specifier.startsWith('apps/') ||
          specifier.startsWith('@agiworkforce/desktop') ||
          specifier.startsWith('@agiworkforce/web')
        ) {
          errors.push(`${rel} imports app code via ${specifier}`);
        }
      }

      if (rel.startsWith('services/')) {
        if (uiPackages.has(specifier)) {
          errors.push(`${rel} imports UI package ${specifier}`);
        }
        if (resolved) {
          const resolvedRel = relativePath(resolved);
          if (resolvedRel.startsWith('apps/')) {
            errors.push(`${rel} imports app code via ${specifier}`);
          }
        }
      }

      for (const [packageName, packageInfo] of workspacePackages.entries()) {
        const deepImportPrefix = `${packageName}/`;
        if (!specifier.startsWith(deepImportPrefix)) continue;

        const subpath = specifier.slice(deepImportPrefix.length);
        if (!packageInfo.exportedSubpaths.has(subpath)) {
          errors.push(
            `${rel} deep-imports workspace package ${specifier}; import ${packageName} or an exported subpath from ${packageInfo.relativePath}.`,
          );
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Boundary check passed.');
