#!/usr/bin/env node
// Rebuild AUDIT_MANIFEST.txt and the remaining batch lists (130+) after the
// 2026-06-10 deletion. Done files = union of recovered AUDIT_BATCHES/batch-001..129
// lists. Remaining = current find output minus done, classified and ordered with
// the same category logic as scripts/audit-classify-manifest.mjs, sliced into 20s.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = '/Users/siddhartha/Desktop/agiworkforce';

const FIND_ARGS = [
  '.',
  ...'-not -path */node_modules/* -not -path */target/* -not -path */dist/* -not -path */.git/* -not -path */build/* -not -path */coverage/* -not -path */.next/* -not -path */out/* -not -path */__pycache__/* -not -path */vendor/* -not -path */binaries/*'.split(
    ' ',
  ),
  '-type',
  'f',
  '(',
  ...'-name *.ts -o -name *.tsx -o -name *.rs -o -name *.js -o -name *.jsx -o -name *.toml -o -name *.json -o -name *.yaml -o -name *.yml -o -name *.env* -o -name *.sh -o -name Dockerfile* -o -name *.md'
    .split(' ')
    .map((s) => s),
  ')',
];

const current = execFileSync('find', FIND_ARGS, {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .split('\n')
  .filter(Boolean)
  // exclude the audit's own artifacts from the scan universe
  .filter(
    (p) =>
      !/^\.\/(AUDIT_|REMEDIATION_PRIORITY)/.test(p) &&
      !p.startsWith('./AUDIT_PARTS/') &&
      !p.startsWith('./AUDIT_BATCHES/') &&
      !/scripts\/audit-(classify-manifest|recover|recovery|rebuild)/.test(p),
  )
  .sort();

const done = new Set();
for (let i = 1; i <= 129; i++) {
  const f = path.join(ROOT, 'AUDIT_BATCHES', `batch-${String(i).padStart(3, '0')}.txt`);
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l.trim()) done.add(l.trim());
}

const currentSet = new Set(current);
const remaining = current.filter((p) => !done.has(p));
const vanishedDone = [...done].filter((p) => !currentSet.has(p)); // scanned, since deleted
const GENERATED =
  /(\/dist-web\/|\/\.vercel\/|\/\.playwright-mcp\/|\/\.expo\/|\/\.firecrawl\/|\/\.minimax\/|pnpm-lock\.yaml|Cargo\.lock|\/snapshots\/|\.snap$|\/_archive\/|\/archive\/)/i;
const TESTISH =
  /(__tests__|__mocks__|\.test\.|\.spec\.|\/e2e\/|\/tests?\/|\/fixtures\/|playwright)/i;

function categorize(p) {
  const f = p.toLowerCase();
  if (GENERATED.test(f)) return 19;
  if (f.endsWith('.md')) return 18;
  if (TESTISH.test(f)) return 16;
  if (f.includes('apps/desktop/src-tauri/')) {
    if (f.includes('/sys/commands/') || f.includes('tauri.conf') || f.includes('/capabilities/'))
      return 2;
    if (f.endsWith('.rs')) return 1;
    return 2;
  }
  if (
    f.includes('packages/providers/') ||
    f.includes('packages/llm-normalize/') ||
    f.includes('packages/llm-runtime/') ||
    f.includes('packages/local-llm/') ||
    f.includes('packages/routing/') ||
    f.includes('packages/unified-chat/') ||
    /(openai|anthropic|ollama|deepseek|openrouter|groq|mistral|bedrock|lmstudio|perplexity|gemini)/.test(
      f,
    ) ||
    (/(provider|models)/.test(f) && /\.(ts|tsx|rs|js)$/.test(f))
  )
    return 3;
  if (/(auth|oauth|token|session|permission|clerk|csrf|secret)/.test(f)) return 4;
  if (
    f.includes('/app/api/') ||
    f.includes('/pages/api/') ||
    f.endsWith('proxy.ts') ||
    /middleware/.test(f) ||
    f.startsWith('./services/') ||
    f.includes('apps/web/api/') ||
    f.includes('apps/web/handlers/')
  )
    return 5;
  if (/(\/db\/|\/neon\/|migration|schema|drizzle|\/data-layer\/)/.test(f)) return 6;
  if (f.includes('packages/')) return 7;
  if (f.includes('apps/cli/') || f.startsWith('./crates/')) return 10;
  if (f.includes('apps/extension-vscode/')) return 11;
  if (f.includes('apps/extension/')) return 12;
  if (f.includes('apps/mobile/') || f.startsWith('./ios/')) return 13;
  if (
    /(\/services\/|\/api\/|client|\/lib\/|\/stores?\/|\/hooks\/|\/core\/|\/utils\/)/.test(f) &&
    /\.(ts|js)$/.test(f) &&
    (f.includes('apps/desktop/src/') || f.includes('apps/web/'))
  )
    return 8;
  if ((f.includes('apps/desktop/src/') || f.includes('apps/web/')) && /\.(tsx|jsx|ts|js)$/.test(f))
    return 9;
  if (
    f.startsWith('./.github/') ||
    f.includes('dockerfile') ||
    f.endsWith('vercel.json') ||
    /\.(yml|yaml)$/.test(f)
  )
    return 14;
  if (
    f.startsWith('./scripts/') ||
    f.includes('/scripts/') ||
    f.endsWith('.sh') ||
    f.startsWith('./.claude/') ||
    f.startsWith('./.cursor/') ||
    f.startsWith('./.codex/') ||
    f.startsWith('./.opencode/') ||
    f.startsWith('./.agents/') ||
    f.startsWith('./.remember/') ||
    f.startsWith('./examples/') ||
    f.startsWith('./tasks/') ||
    f.startsWith('./audit/') ||
    f.startsWith('./reports/')
  )
    return 15;
  return 17;
}

const entries = remaining.map((p) => ({ cat: categorize(p), p }));
entries.sort((a, b) => a.cat - b.cat || a.p.localeCompare(b.p));

// manifest = done (preserved as scanned evidence) + remaining, marked
fs.writeFileSync(
  path.join(ROOT, 'AUDIT_MANIFEST.txt'),
  [...done].sort().join('\n') + '\n' + remaining.join('\n') + '\n',
);

const BATCH = 20;
let n = 129;
for (let i = 0; i < entries.length; i += BATCH) {
  n++;
  fs.writeFileSync(
    path.join(ROOT, 'AUDIT_BATCHES', `batch-${String(n).padStart(3, '0')}.txt`),
    entries
      .slice(i, i + BATCH)
      .map((e) => e.p)
      .join('\n') + '\n',
  );
}

const counts = {};
for (const e of entries) counts[e.cat] = (counts[e.cat] || 0) + 1;
console.log(
  `done=${done.size} (vanished since scan: ${vanishedDone.length}) remaining=${remaining.length} total-universe=${done.size + remaining.length}`,
);
console.log(`remaining batches: 130..${n}`);
console.log(
  Object.entries(counts)
    .sort((a, b) => +a[0] - +b[0])
    .map(([c, k]) => `cat${c}=${k}`)
    .join(' '),
);
if (vanishedDone.length)
  fs.writeFileSync(
    path.join(ROOT, 'AUDIT_BATCHES', 'vanished-after-scan.txt'),
    vanishedDone.join('\n') + '\n',
  );
