#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

const requiredInputs = [
  {
    path: 'apps/cli/README.md',
    consumer: 'apps/cli/Cargo.toml package metadata',
  },
  {
    path: 'apps/cli/npm/README.md',
    consumer: 'the @agiworkforce/cli npm package',
  },
  {
    path: 'apps/cli/src/output_styles/explanatory.md',
    consumer: 'Rust include_str! in apps/cli/src/output_styles.rs',
  },
  {
    path: 'apps/cli/src/output_styles/learning.md',
    consumer: 'Rust include_str! in apps/cli/src/output_styles.rs',
  },
];

function requireNonemptyFile(relativePath, consumer) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing executable documentation input: ${relativePath} (${consumer})`);
    return;
  }

  if (!fs.statSync(absolutePath).isFile() || fs.readFileSync(absolutePath, 'utf8').trim() === '') {
    errors.push(`Executable documentation input is empty: ${relativePath} (${consumer})`);
  }
}

for (const input of requiredInputs) {
  requireNonemptyFile(input.path, input.consumer);
}

function walkRustFiles(relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];

  const files = [];
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (entry.name === 'target') continue;
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkRustFiles(relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      files.push(relativePath);
    }
  }
  return files;
}

const literalIncludePattern = /include_str!\(\s*"([^"]+\.(?:md|txt))"\s*\)/g;
for (const sourcePath of [...walkRustFiles('apps'), ...walkRustFiles('crates')]) {
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  for (const match of source.matchAll(literalIncludePattern)) {
    const inputPath = path.posix.normalize(
      path.posix.join(path.posix.dirname(sourcePath), match[1]),
    );
    requireNonemptyFile(inputPath, `literal include_str! in ${sourcePath}`);
  }
}

if (errors.length > 0) {
  console.error('Executable documentation check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Executable documentation check passed.');
