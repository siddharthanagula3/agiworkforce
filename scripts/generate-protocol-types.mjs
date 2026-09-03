#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(
  repoRoot,
  'packages',
  'contracts',
  'types',
  'src',
  'generated',
  'protocol',
);
const [mode = '--write', ...extraArgs] = process.argv.slice(2);
if (!['--check', '--write'].includes(mode) || extraArgs.length > 0) {
  throw new Error('Usage: node scripts/generate-protocol-types.mjs [--check|--write]');
}
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-protocol-types-'));
const stagingDir = path.join(stagingRoot, 'protocol');
fs.mkdirSync(stagingDir, { recursive: true });

try {
  execFileSync('cargo', ['test', '-p', 'agiworkforce-protocol', '--test', 'export_bindings'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_TARGET_DIR: path.join(os.tmpdir(), 'agi-protocol-types-target'),
      TS_RS_EXPORT_DIR: stagingDir,
    },
  });

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

  function collectRelativeFiles(dir, prefix = '') {
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relativePath = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        files.push(...collectRelativeFiles(path.join(dir, entry.name), `${relativePath}/`));
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
    return files;
  }

  const modules = collectTsFiles(stagingDir).sort();

  const requiredModules = [
    'EventMsg',
    'Tool',
    'AppServerRequest',
    'AppServerResponse',
    'AppServerNotification',
  ];
  const missingRequiredModules = requiredModules.filter((module) => !modules.includes(module));
  if (missingRequiredModules.length > 0) {
    throw new Error(
      `Protocol generation omitted required roots: ${missingRequiredModules.join(', ')}`,
    );
  }

  const seen = new Map();
  for (const mod of modules) {
    const base = path.basename(mod);
    if (seen.has(base)) {
      throw new Error(
        `Duplicate generated type name "${base}" (${seen.get(base)} vs ${mod}). ` +
          'Disambiguate the Rust type names or adjust export roots.',
      );
    }
    seen.set(base, mod);
  }

  const banner = [
    '// GENERATED FILE, do not edit by hand.',
    '// Produced by scripts/generate-protocol-types.mjs from crates/agiworkforce-protocol',
    '// (ts-rs). Regenerate with: pnpm generate:protocol-types',
    '',
  ].join('\n');

  const barrel = banner + modules.map((mod) => `export * from './${mod}';`).join('\n') + '\n';
  fs.writeFileSync(path.join(stagingDir, 'index.ts'), barrel);

  execFileSync(
    'pnpm',
    [
      'exec',
      'prettier',
      '--log-level',
      'warn',
      '--config',
      path.join(repoRoot, '.prettierrc.json'),
      '--write',
      `${stagingDir}/**/*.ts`,
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  );

  const expectedFiles = new Set([...modules.map((module) => `${module}.ts`), 'index.ts']);
  const existingFiles = new Set(collectRelativeFiles(outDir));

  if (mode === '--check') {
    const missingFiles = [...expectedFiles].filter((file) => !existingFiles.has(file));
    const staleFiles = [...existingFiles].filter((file) => !expectedFiles.has(file));
    const changedFiles = [...expectedFiles].filter(
      (file) =>
        existingFiles.has(file) &&
        !fs
          .readFileSync(path.join(stagingDir, file))
          .equals(fs.readFileSync(path.join(outDir, file))),
    );
    const drift = [
      ...missingFiles.map((file) => `missing ${file}`),
      ...staleFiles.map((file) => `stale ${file}`),
      ...changedFiles.map((file) => `changed ${file}`),
    ];
    if (drift.length > 0) {
      throw new Error(
        `Protocol bindings are stale:\n${drift.map((item) => `- ${item}`).join('\n')}\n` +
          'Run pnpm generate:protocol-types and include the generated tree.',
      );
    }
    console.log(
      `Verified ${modules.length} protocol type modules in ${path.relative(repoRoot, outDir)}`,
    );
  } else {
    fs.mkdirSync(outDir, { recursive: true });
    const publishOrder = [...expectedFiles].sort((left, right) => {
      if (left === 'index.ts') return 1;
      if (right === 'index.ts') return -1;
      return left.localeCompare(right);
    });

    for (const relativeFile of publishOrder) {
      const destination = path.join(outDir, relativeFile);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(stagingDir, relativeFile), destination);
    }

    for (const relativeFile of existingFiles) {
      if (!expectedFiles.has(relativeFile)) {
        fs.rmSync(path.join(outDir, relativeFile), { force: true });
      }
    }

    function removeEmptyDirectories(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const child = path.join(dir, entry.name);
          removeEmptyDirectories(child);
          if (fs.readdirSync(child).length === 0) {
            fs.rmdirSync(child);
          }
        }
      }
    }
    removeEmptyDirectories(outDir);

    console.log(
      `Generated ${modules.length} protocol type modules into ${path.relative(repoRoot, outDir)}`,
    );
  }
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}
