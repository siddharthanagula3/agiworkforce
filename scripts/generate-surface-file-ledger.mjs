#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputDir = path.join(root, 'audit/anthropic-apps-parity');
const ledgerPath = path.join(outputDir, 'per-file-audit-ledger.jsonl');
const summaryPath = path.join(outputDir, 'per-file-audit-ledger.md');

const surfaceRoots = [
  { surface: 'cli', ownerLane: 'cli-app', prefix: 'apps/cli/src/' },
  { surface: 'rust-engine', ownerLane: 'rust-platform', prefix: 'crates/' },
  { surface: 'shared-types', ownerLane: 'shared-contracts', prefix: 'packages/types/' },
  { surface: 'shared-runtime', ownerLane: 'shared-runtime', prefix: 'packages/runtime/' },
  { surface: 'shared-runtime', ownerLane: 'shared-runtime', prefix: 'packages/llm-runtime/' },
  { surface: 'provider-adapters', ownerLane: 'provider-adapters', prefix: 'packages/providers/' },
  { surface: 'provider-adapters', ownerLane: 'provider-adapters', prefix: 'packages/routing/' },
  { surface: 'mcp-connectors', ownerLane: 'mcp-connectors', prefix: 'packages/mcp/' },
  { surface: 'unified-chat', ownerLane: 'shared-runtime', prefix: 'packages/unified-chat/' },
  { surface: 'services', ownerLane: 'services', prefix: 'services/' },
];

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function trackedFiles() {
  return git(['ls-files', ...surfaceRoots.map((rootEntry) => rootEntry.prefix)])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function sourceCommit() {
  const commit = git(['rev-parse', '--short=12', 'HEAD']);
  const dirty = git(['status', '--short']) ? '-dirty' : '';
  return `${commit}${dirty}`;
}

function surfaceFor(filePath) {
  return surfaceRoots.find((rootEntry) => filePath.startsWith(rootEntry.prefix));
}

function languageFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  if (name === 'Cargo.toml' || ext === '.toml') return 'toml';
  if (name === 'package.json' || ext === '.json') return 'json';
  if (ext === '.rs') return 'rust';
  if (ext === '.ts') return 'typescript';
  if (ext === '.tsx') return 'tsx';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  if (ext === '.md') return 'markdown';
  if (ext === '.snap') return 'snapshot';
  if (ext === '.txt') return 'text';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  return 'other';
}

function fileKindFor(filePath) {
  const base = path.basename(filePath);
  if (filePath.includes('/snapshots/') || filePath.endsWith('.snap')) return 'snapshot';
  if (filePath.includes('/tests/') || /\.test\.[tj]sx?$/.test(base) || /_test\.rs$/.test(base)) {
    return 'test';
  }
  if (base === 'Cargo.toml' || base === 'package.json' || base.endsWith('.config.js')) {
    return 'config';
  }
  if (filePath.endsWith('.md') || filePath.endsWith('.txt')) return 'docs';
  return 'source';
}

function lineCount(filePath) {
  const absolutePath = path.join(root, filePath);
  try {
    const body = fs.readFileSync(absolutePath, 'utf8');
    if (!body) return 0;
    return body.endsWith('\n') ? body.split('\n').length - 1 : body.split('\n').length;
  } catch {
    return null;
  }
}

function riskTagsFor(filePath) {
  const tags = new Set();
  const lower = filePath.toLowerCase();
  const checks = [
    ['auth', 'auth-boundary'],
    ['oauth', 'auth-boundary'],
    ['permission', 'permission-boundary'],
    ['approval', 'permission-boundary'],
    ['sandbox', 'sandbox-boundary'],
    ['path_security', 'filesystem-boundary'],
    ['tools/', 'tool-execution'],
    ['exec', 'tool-execution'],
    ['bash', 'shell-execution'],
    ['powershell', 'shell-execution'],
    ['mcp', 'mcp-boundary'],
    ['provider', 'provider-boundary'],
    ['models', 'provider-boundary'],
    ['stream', 'streaming-protocol'],
    ['hook', 'agent-hook-boundary'],
    ['subagent', 'subagent-boundary'],
    ['team', 'multi-agent-boundary'],
    ['sync', 'sync-boundary'],
    ['memory', 'memory-boundary'],
    ['services/', 'cloud-boundary'],
    ['db/neon', 'data-boundary'],
    ['billing', 'commercial-boundary'],
  ];
  for (const [needle, tag] of checks) {
    if (lower.includes(needle)) tags.add(tag);
  }
  return [...tags].sort();
}

function parityRelevanceFor(filePath, surface) {
  const tags = new Set([surface]);
  const lower = filePath.toLowerCase();
  if (lower.includes('claude') || lower.includes('command') || lower.includes('slash')) {
    tags.add('claude-code-muscle-memory');
  }
  if (lower.includes('mcp')) tags.add('mcp-connectors');
  if (lower.includes('hook')) tags.add('hooks');
  if (lower.includes('agent') || lower.includes('subagent') || lower.includes('team')) {
    tags.add('agents');
  }
  if (lower.includes('tool')) tags.add('tools');
  if (lower.includes('lsp')) tags.add('lsp-navigation');
  if (lower.includes('sync') || lower.includes('conversation'))
    tags.add('cross-surface-continuity');
  if (lower.includes('provider') || lower.includes('model')) tags.add('multi-provider-byok');
  return [...tags].sort();
}

function summarize(rows) {
  const bySurface = new Map();
  const byRisk = new Map();
  for (const row of rows) {
    bySurface.set(row.surface, (bySurface.get(row.surface) ?? 0) + 1);
    for (const risk of row.risk_tags) {
      byRisk.set(risk, (byRisk.get(risk) ?? 0) + 1);
    }
  }

  const surfaceRows = [...bySurface.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([surface, count]) => `| \`${surface}\` | ${count} |`)
    .join('\n');
  const riskRows = [...byRisk.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([risk, count]) => `| \`${risk}\` | ${count} |`)
    .join('\n');

  return `# Per-File Audit Ledger

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

This is the focused file-level audit ledger for Claude/OpenAI application parity work. The JSONL source is \`per-file-audit-ledger.jsonl\`.

## Scope

- CLI engine files under \`apps/cli/src\`.
- Shared Rust engine crates under \`crates\`.
- Shared contracts/runtime/provider/MCP/service paths needed by CLI and future Desktop/Web/Mobile reuse.

## Counts By Surface

| Surface | Files |
| --- | ---: |
${surfaceRows}

## Counts By Risk Tag

| Risk Tag | Files |
| --- | ---: |
${riskRows || '| None | 0 |'}

## Row Contract

Each JSONL row includes \`path\`, \`surface\`, \`owner_lane\`, \`language\`, \`file_kind\`, \`loc\`, \`risk_tags\`, \`parity_relevance\`, \`audit_status\`, and evidence placeholders. Agents should update rows from \`not-started\` to \`reviewed\` only after reading the full file, checking callers/callees where relevant, and recording verification.
`;
}

fs.mkdirSync(outputDir, { recursive: true });

const generatedDate = '2026-05-21';
const commit = sourceCommit();
const rows = trackedFiles().map((filePath) => {
  const surface = surfaceFor(filePath);
  return {
    schema_version: '1.0',
    generated_at: generatedDate,
    source_commit: commit,
    path: filePath,
    surface: surface.surface,
    owner_lane: surface.ownerLane,
    language: languageFor(filePath),
    file_kind: fileKindFor(filePath),
    loc: lineCount(filePath),
    audit_status: 'not-started',
    audit_depth: 'file-inventory',
    risk_tags: riskTagsFor(filePath),
    parity_relevance: parityRelevanceFor(filePath, surface.surface),
    evidence: {
      read_full_file: false,
      searched_references: false,
      checked_callers_or_callees: false,
      ran_verification: false,
    },
    findings: [],
    notes: '',
  };
});

fs.writeFileSync(ledgerPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
fs.writeFileSync(summaryPath, summarize(rows));

console.log(`Wrote ${rows.length} rows to ${path.relative(root, ledgerPath)}`);
console.log(`Wrote summary to ${path.relative(root, summaryPath)}`);
