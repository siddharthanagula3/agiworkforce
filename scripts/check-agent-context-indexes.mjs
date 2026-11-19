#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  outDir,
  renderIndexes,
  renderKnowledgeGraphIndexes,
  serialize,
} from './generate-agent-context-indexes.mjs';

const KNOWLEDGE_GRAPH_DIR = 'knowledge-graph';

function listFiles(root, relative = '') {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return [];
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(root, child));
    else if (entry.isFile()) found.push(child);
  }
  return found;
}

/**
 * Byte-compares a fresh render against the files committed under `root`. The
 * top-level indexes are the `.json` files directly in `root`; the knowledge
 * graph is every file under `root/knowledge-graph`, so a shard that was added,
 * dropped or edited by hand is drift like any other.
 */
export function findDrift({ root, indexes, graphFiles }) {
  const expected = new Map(
    Object.entries(indexes).map(([fileName, value]) => [fileName, serialize(value)]),
  );
  for (const [relative, content] of Object.entries(graphFiles)) expected.set(relative, content);

  const existing = new Set([
    ...(fs.existsSync(root)
      ? fs
          .readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => entry.name)
      : []),
    ...listFiles(root, KNOWLEDGE_GRAPH_DIR),
  ]);

  return [
    ...[...expected.keys()].filter((file) => !existing.has(file)).map((file) => `missing ${file}`),
    ...[...existing]
      .filter((file) => !expected.has(file))
      .map((file) => `stale ${file} (no longer generated)`),
    ...[...expected]
      .filter(
        ([file, content]) =>
          existing.has(file) && fs.readFileSync(path.join(root, file), 'utf8') !== content,
      )
      .map(([file]) => `changed ${file}`),
  ];
}

async function main() {
  const indexes = renderIndexes();
  const graphFiles = await renderKnowledgeGraphIndexes(indexes);
  const drift = findDrift({ root: outDir, indexes, graphFiles });

  if (drift.length > 0) {
    console.error('docs/agent-context/generated/ is stale:');
    for (const item of drift) {
      console.error(`- ${item}`);
    }
    console.error('Run: node scripts/generate-agent-context-indexes.mjs');
    process.exitCode = 1;
  } else {
    console.log(
      `Verified ${Object.keys(indexes).length} generated agent-context indexes and ${Object.keys(graphFiles).length} knowledge graph files match committed state.`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
