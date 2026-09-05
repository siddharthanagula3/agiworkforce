#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const SCAN_ROOTS = ['apps', 'packages', 'services', 'crates', 'shared', 'examples', 'tools'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.rs'];

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  'target',
  'out',
  '.next',
  '.turbo',
  'coverage',
  'generated',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'tests',
  'test',
  'fixtures',
  'e2e',
  'scripts',
]);

function isNonProductionFile(fileName) {
  return (
    /\.(test|spec|bench)\.[cm]?tsx?$/.test(fileName) ||
    /\.d\.ts$/.test(fileName) ||
    /(^|[.-])(fixtures?|mocks?|generated)\./.test(fileName)
  );
}

const DECLARATION_PATH_RULES = [
  {
    test: (rel) => /^packages\/ai\/providers\/[^/]+\/src\//.test(rel),
    why: 'provider adapter package, owns its provider default base URL and host allowlist',
  },
];

const PROVIDER_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.x.ai',
  'api.deepseek.com',
  'api.perplexity.ai',
  'api.groq.com',
  'api.mistral.ai',
  'api.moonshot.cn',
  'api.moonshot.ai',
  'api.minimax.io',
  'open.bigmodel.cn',
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
  'openrouter.ai',
  'api.mulerouter.ai',
  'api.together.xyz',
  'api.fireworks.ai',
  'api.stability.ai',
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HOST_PATTERN = new RegExp(PROVIDER_HOSTS.map(escapeRegExp).join('|'), 'g');

function isCommentLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('#!')
  );
}

function rustTestModuleStart(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith('#[cfg(test)]')) return i;
  }
  return lines.length;
}

const BUDGETS = [
  {
    file: 'packages/ai/provider-runtime/src/base-url.ts',
    max: 15,
    why: 'ALLOWED_MANAGED_PROVIDER_HOSTS, the canonical managed-provider SSRF allowlist.',
  },
  {
    file: 'apps/web/lib/server/provider-endpoints.ts',
    max: 4,
    why: "Web's single declaration of managed-provider API roots for direct fetch call sites, including authenticated OpenRouter media jobs.",
  },
  {
    file: 'apps/web/lib/egress-policy.ts',
    max: 1,
    why: 'RETIRED_PROVIDER_HOSTS, the subtraction applied to the canonical allowlist.',
  },
  {
    file: 'apps/desktop/src/features/settings/CustomModelsSettings.tsx',
    max: 6,
    why: 'BYOK base-URL presets shown to the user for prefill; not an outbound endpoint.',
  },
  {
    file: 'apps/mobile/lib/pinning.ts',
    max: 4,
    why: 'Certificate-pinning host table, pins are declared per literal host by definition.',
  },
  {
    file: 'apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs',
    max: 14,
    why: "Desktop's default_base_url() provider table plus RETIRED_PROVIDER_HOSTS, the canonical desktop declaration.",
  },
  {
    file: 'apps/cli/src/models/mod.rs',
    max: 9,
    why: "CLI's ModelConfig base_url table, the canonical CLI declaration.",
  },
  {
    file: 'apps/cli/src/models/streaming.rs',
    max: 2,
    why: "CLI's Anthropic/Gemini streaming endpoint declarations.",
  },
  {
    file: 'crates/agiworkforce-llm/src/spec.rs',
    max: 1,
    why: 'Wire-shape detection: the vendor host selects the OpenAI request dialect.',
  },
  {
    file: 'crates/agiworkforce-llm/src/speech.rs',
    max: 1,
    why: 'Shared transcription contract, the single BYOK speech endpoint both Rust binaries read.',
  },
  {
    file: 'tools/evals/src/anthropic.ts',
    max: 1,
    why: 'Eval harness endpoint declaration, overridable via ANTHROPIC_BASE_URL; not shipped code.',
  },

  {
    file: 'apps/desktop/src-tauri/src/features/speech/tts.rs',
    max: 1,
    residue: true,
    why: 'HARD-004, speech endpoints not yet moved into a shared provider contract.',
  },
  {
    file: 'apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs',
    max: 3,
    residue: true,
    why: 'HARD-002, image endpoints not yet resolved through provider metadata.',
  },
  {
    file: 'apps/desktop/src-tauri/src/integrations/api_integrations/perplexity.rs',
    max: 1,
    residue: true,
    why: 'HARD-002, Perplexity host duplicated outside the provider metadata path.',
  },
  {
    file: 'apps/desktop/src-tauri/src/core/research/web_search_config.rs',
    max: 1,
    residue: true,
    why: 'HARD-002, Perplexity search host duplicated in the research search config.',
  },
  {
    file: 'apps/desktop/src-tauri/src/integrations/api_integrations/veo3.rs',
    max: 1,
    residue: true,
    why: 'HARD-002, Veo host duplicated outside the provider metadata path.',
  },
  {
    file: 'apps/desktop/src-tauri/src/sys/commands/llm.rs',
    max: 1,
    residue: true,
    why: 'HARD-001, OpenRouter model-list fetch bypasses default_base_url().',
  },
  {
    file: 'apps/cli/src/config.rs',
    max: 1,
    residue: true,
    why: 'HARD-003, CLI config default duplicates the OpenRouter base URL.',
  },
  {
    file: 'apps/cli/src/models/openrouter_models.rs',
    max: 1,
    residue: true,
    why: 'HARD-003, OpenRouter model-list URL duplicated outside the ModelConfig table.',
  },
  {
    file: 'apps/web/app/api/llm/v1/embeddings/route.ts',
    max: 1,
    residue: true,
    why: 'HARD-005 follow-up, Google embeddings needs a Google entry in provider-endpoints.ts.',
  },
  {
    file: 'apps/web/app/api/media/image/generate/route.ts',
    max: 3,
    residue: true,
    why: 'HARD-005 follow-up, Google/Stability image hosts need declarations of their own.',
  },
  {
    file: 'apps/web/app/api/media/video/status/route.ts',
    max: 1,
    residue: true,
    why: 'HARD-005 follow-up, Google operations host needs a declaration of its own.',
  },
  {
    file: 'apps/web/app/api/control-plane/status/route.ts',
    max: 1,
    residue: true,
    why: 'HARD-005 follow-up, status probe host duplicated from the provider registry.',
  },
  {
    file: 'apps/web/lib/web-search/web-search-tool.ts',
    max: 1,
    residue: true,
    why: 'HARD-002, Perplexity search host duplicated in the web-search tool.',
  },
];

const BUDGET_BY_FILE = new Map(BUDGETS.map((entry) => [entry.file, entry]));

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      if (isNonProductionFile(entry.name)) continue;
      yield full;
    }
  }
}

function scanFile(absPath, rel) {
  const lines = readFileSync(absPath, 'utf8').split('\n');
  const testStart = rel.endsWith('.rs') ? rustTestModuleStart(lines) : lines.length;
  const hits = [];
  for (let i = 0; i < Math.min(lines.length, testStart); i += 1) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    HOST_PATTERN.lastIndex = 0;
    const matched = line.match(HOST_PATTERN);
    if (!matched) continue;
    for (const host of matched) hits.push({ line: i + 1, host, text: line.trim() });
  }
  return hits;
}

const counts = new Map();
for (const root of SCAN_ROOTS) {
  const abs = join(REPO_ROOT, root);
  try {
    if (!statSync(abs).isDirectory()) continue;
  } catch {
    continue;
  }
  for (const file of walk(abs)) {
    const rel = relative(REPO_ROOT, file).split(sep).join('/');
    if (DECLARATION_PATH_RULES.some((rule) => rule.test(rel))) continue;
    const hits = scanFile(file, rel);
    if (hits.length > 0) counts.set(rel, hits);
  }
}

const violations = [];
for (const [rel, hits] of counts) {
  const budget = BUDGET_BY_FILE.get(rel);
  if (!budget) {
    violations.push({
      rel,
      hits,
      message: `${hits.length} provider host literal(s) in a file that is not an approved declaration`,
    });
  } else if (hits.length > budget.max) {
    violations.push({
      rel,
      hits,
      message: `${hits.length} provider host literal(s) exceeds the allowed budget of ${budget.max}`,
    });
  }
}

const stale = BUDGETS.filter((entry) => !counts.has(entry.file));

if (violations.length > 0) {
  console.error('Hardcoded model-provider endpoints found outside approved declarations:\n');
  for (const violation of violations) {
    console.error(`  ${violation.rel}, ${violation.message}`);
    for (const hit of violation.hits.slice(0, 6)) {
      console.error(`    ${violation.rel}:${hit.line}  ${hit.text.slice(0, 120)}`);
    }
  }
  console.error(
    "\nResolve the endpoint from your deployable's endpoint declaration instead of\n" +
      'inlining the host. On the web app that is apps/web/lib/server/provider-endpoints.ts.\n' +
      'If the file genuinely IS a declaration, add it to BUDGETS with a reason.',
  );
}

if (stale.length > 0) {
  console.error('\nStale BUDGETS entries (no literals found, the file was cleaned up):');
  for (const entry of stale) console.error(`  ${entry.file}`);
  console.error('Remove them so the budget list stays a true picture of the repo.');
}

if (violations.length > 0 || stale.length > 0) process.exit(1);

console.log(
  `check-no-hardcoded-endpoints: OK (${counts.size} declared file(s), ` +
    `${BUDGETS.filter((b) => b.residue).length} still carrying un-migrated call sites)`,
);
