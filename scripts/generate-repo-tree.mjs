#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

// Renders the tracked file tree for humans. Output is deliberately NOT committed
// and NOT drift-checked: it changes on every file added or removed, so a guard
// over it would fail on unrelated work and teach people to ignore the guard.
// Run it when you want a current map.

const root = process.cwd();
const outDir = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'tmp';

const fmt = (n) => n.toLocaleString('en-US');

function buildTree() {
  const files = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
    .trim()
    .split('\n')
    .filter(Boolean);

  const node = { name: '', dir: true, children: new Map() };
  for (const file of files) {
    let cursor = node;
    const parts = file.split('/');
    parts.forEach((name, index) => {
      const isLeaf = index === parts.length - 1;
      if (!cursor.children.has(name)) {
        cursor.children.set(name, isLeaf ? { name } : { name, dir: true, children: new Map() });
      }
      cursor = cursor.children.get(name);
    });
  }

  const finalize = (entry) => {
    if (!entry.dir) return { name: entry.name, count: 1 };
    const children = [...entry.children.values()].map(finalize);
    children.sort(
      (a, b) => (a.children ? 0 : 1) - (b.children ? 0 : 1) || a.name.localeCompare(b.name, 'en'),
    );
    return {
      name: entry.name,
      dir: true,
      children,
      count: children.reduce((sum, child) => sum + child.count, 0),
    };
  };

  return { tree: finalize(node), total: files.length };
}

function renderFiles(nodes, prefix, out, depth, maxDepth) {
  nodes.forEach((entry, index) => {
    const last = index === nodes.length - 1;
    const branch = last ? '└── ' : '├── ';
    if (!entry.dir) {
      out.push(prefix + branch + entry.name);
      return;
    }
    const label = `${prefix}${branch}${entry.name}/`;
    const atLimit = maxDepth !== null && depth + 1 >= maxDepth;
    const pad = ' '.repeat(Math.max(2, 62 - label.length));
    const noun = entry.count === 1 ? 'file' : 'files';
    const more = atLimit && entry.children.some((c) => c.dir) ? ' ⋯' : '';
    out.push(`${label}${pad}${fmt(entry.count)} ${noun}${more}`);
    if (!atLimit) {
      renderFiles(entry.children, prefix + (last ? '    ' : '│   '), out, depth + 1, maxDepth);
    }
  });
}

function renderDirs(nodes, prefix, out, depth, maxDepth) {
  const dirs = nodes.filter((entry) => entry.dir);
  dirs.forEach((entry, index) => {
    const last = index === dirs.length - 1;
    const label = `${prefix}${last ? '└── ' : '├── '}${entry.name}/`;
    out.push(label + ' '.repeat(Math.max(2, 58 - label.length)) + fmt(entry.count));
    if (depth + 1 < maxDepth) {
      renderDirs(entry.children, prefix + (last ? '    ' : '│   '), out, depth + 1, maxDepth);
    }
  });
}

function anchor(name) {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function main() {
  const { tree, total } = buildTree();
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const stamp = execFileSync('git', ['log', '-1', '--format=%cs'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  const dirs = tree.children.filter((entry) => entry.dir);
  const rootFiles = tree.children.filter((entry) => !entry.dir);
  const docTiers = fs.existsSync(path.join(root, 'docs'))
    ? fs
        .readdirSync(path.join(root, 'docs'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory()).length
    : 0;

  const md = [
    '# agiworkforce, file tree',
    '',
    `Every tracked file, as \`git ls-files\` sees it on \`${branch}\` at \`${head}\` (${stamp}).`,
    'Untracked and ignored paths, `node_modules/`, `target/`, build output, local',
    'env files, are excluded.',
    '',
    'Regenerate with `pnpm generate:repo-tree`. This file is not committed and not',
    'drift-checked; it changes whenever any file is added or removed.',
    '',
    '| | |',
    '|---|---|',
    `| Tracked files | **${fmt(total)}** |`,
    `| Root markdown | **${rootFiles.filter((f) => f.name.endsWith('.md')).length}** |`,
    `| docs/ tiers | **${docTiers}** |`,
    '',
    '---',
    '',
    '## Overview, depth 3',
    '',
    '```',
    'agiworkforce/',
  ];
  const overview = [];
  renderFiles(tree.children, '', overview, 0, 3);
  md.push(...overview, '```', '', '---', '', '## Contents', '');
  for (const dir of dirs)
    md.push(`- [\`${dir.name}/\`](#${anchor(dir.name)}), ${fmt(dir.count)} files`);
  md.push(`- [Root files](#root-files), ${fmt(rootFiles.length)} files`, '', '---', '');
  for (const dir of dirs) {
    md.push(`## \`${dir.name}/\``, '', `*${fmt(dir.count)} files*`, '', '```', `${dir.name}/`);
    const body = [];
    renderFiles(dir.children, '', body, 0, null);
    md.push(...body, '```', '');
  }
  md.push('## Root files', '', '```');
  const rootBody = [];
  renderFiles(rootFiles, '', rootBody, 0, null);
  md.push(...rootBody, '```', '');

  const dirMd = [
    '# agiworkforce, directory map',
    '',
    `Directories only, four levels deep, on \`${branch}\` at \`${head}\`. Counts are`,
    'recursive totals. Regenerate with `pnpm generate:repo-tree`.',
    '',
    '```',
    'agiworkforce/',
  ];
  const dirBody = [];
  renderDirs(tree.children, '', dirBody, 0, 4);
  dirMd.push(...dirBody, '```');

  fs.mkdirSync(path.join(root, outDir), { recursive: true });
  fs.writeFileSync(path.join(root, outDir, 'REPO-TREE.md'), `${md.join('\n')}\n`);
  fs.writeFileSync(path.join(root, outDir, 'REPO-DIRS.md'), `${dirMd.join('\n')}\n`);
  console.log(
    `Wrote ${outDir}/REPO-TREE.md and ${outDir}/REPO-DIRS.md, ${fmt(total)} files, ${dirs.length} top-level directories.`,
  );
}

main();
