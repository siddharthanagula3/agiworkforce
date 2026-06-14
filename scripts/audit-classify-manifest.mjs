#!/usr/bin/env node
// Audit helper: classify AUDIT_MANIFEST.txt into the 18 priority categories
// (plus 19 = generated/vendored artifacts) and emit 20-file batches.
// Outputs: AUDIT_MANIFEST_ORDERED.txt (cat<TAB>path) and AUDIT_BATCHES/batch-NNN.txt
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const lines = fs
  .readFileSync(path.join(root, 'AUDIT_MANIFEST.txt'), 'utf8')
  .split('\n')
  .filter(Boolean);

const GENERATED =
  /(\/dist-web\/|\/\.vercel\/|\/\.playwright-mcp\/|\/\.expo\/|\/\.firecrawl\/|\/\.minimax\/|pnpm-lock\.yaml|Cargo\.lock|\/snapshots\/|\.snap$|\/_archive\/|\/archive\/)/i;
const TESTISH =
  /(__tests__|__mocks__|\.test\.|\.spec\.|\/e2e\/|\/tests?\/|\/fixtures\/|playwright)/i;

function categorize(p) {
  // p starts with './'
  const f = p.toLowerCase();
  if (GENERATED.test(f)) return 19;
  const isMd = f.endsWith('.md');
  if (isMd) return 18;
  if (TESTISH.test(f)) return 16;

  // 1-2: Tauri Rust backend core / IPC commands
  if (f.includes('apps/desktop/src-tauri/')) {
    if (f.includes('/sys/commands/') || f.includes('tauri.conf') || f.includes('/capabilities/'))
      return 2;
    if (f.endsWith('.rs')) return 1;
    return 2; // other src-tauri config/toml/json travels with IPC tier
  }
  // 3: LLM provider integrations
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
  // 4: auth/token/session/permissions
  if (/(auth|oauth|token|session|permission|clerk|csrf|secret)/.test(f)) return 4;
  // 5: API routes, middleware, backend services
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
  // 6: DB schema/migrations/queries
  if (/(\/db\/|\/neon\/|migration|schema|drizzle|\/data-layer\/)/.test(f)) return 6;
  // 7: shared contracts & types
  if (
    f.includes('packages/types/') ||
    f.includes('packages/api/') ||
    f.includes('agiworkforce-protocol') ||
    f.includes('packages/compliance/') ||
    f.includes('packages/stores/') ||
    f.includes('packages/services/') ||
    f.includes('packages/')
  )
    return 7;
  // 10-13: other surfaces (before generic frontend rules so cli/ext/mobile win)
  if (f.includes('apps/cli/') || f.startsWith('./crates/')) return 10;
  if (f.includes('apps/extension-vscode/')) return 11;
  if (f.includes('apps/extension/')) return 12;
  if (f.includes('apps/mobile/') || f.startsWith('./ios/')) return 13;
  // 8: frontend service/API-client layer (desktop+web TS)
  if (
    /(\/services\/|\/api\/|client|\/lib\/|\/stores?\/|\/hooks\/|\/core\/|\/utils\/)/.test(f) &&
    /\.(ts|js)$/.test(f) &&
    (f.includes('apps/desktop/src/') || f.includes('apps/web/'))
  )
    return 8;
  // 9: frontend components/UI
  if ((f.includes('apps/desktop/src/') || f.includes('apps/web/')) && /\.(tsx|jsx|ts|js)$/.test(f))
    return 9;
  // 14: CI/CD + infra
  if (
    f.startsWith('./.github/') ||
    f.includes('dockerfile') ||
    f.endsWith('vercel.json') ||
    /\.(yml|yaml)$/.test(f)
  )
    return 14;
  // 15: scripts, hooks, build tools, agent config dirs
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
  // 17: configs and everything else
  return 17;
}

const entries = lines.map((p) => ({ cat: categorize(p), p }));
entries.sort((a, b) => a.cat - b.cat || a.p.localeCompare(b.p));

fs.writeFileSync(
  path.join(root, 'AUDIT_MANIFEST_ORDERED.txt'),
  entries.map((e) => `${e.cat}\t${e.p}`).join('\n') + '\n',
);

const batchDir = path.join(root, 'AUDIT_BATCHES');
fs.rmSync(batchDir, { recursive: true, force: true });
fs.mkdirSync(batchDir, { recursive: true });
const BATCH = 20;
let n = 0;
for (let i = 0; i < entries.length; i += BATCH) {
  n++;
  const chunk = entries.slice(i, i + BATCH);
  const id = String(n).padStart(3, '0');
  fs.writeFileSync(path.join(batchDir, `batch-${id}.txt`), chunk.map((e) => e.p).join('\n') + '\n');
}

const counts = {};
for (const e of entries) counts[e.cat] = (counts[e.cat] || 0) + 1;
console.log('total', entries.length, 'batches', n);
console.log(
  Object.entries(counts)
    .sort((a, b) => +a[0] - +b[0])
    .map(([c, k]) => `cat${c}=${k}`)
    .join(' '),
);
