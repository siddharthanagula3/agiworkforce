#!/usr/bin/env node
/**
 * check-no-hardcoded-endpoints.mjs — recurrence guard for HARD-005.
 *
 * Model-provider API hosts must be declared in ONE place per deployable and
 * resolved from there, so that a regional host, an on-prem proxy, or an AI
 * gateway configured through `*_BASE_URL` applies to every outbound provider
 * call — not just the ones that happen to go through a provider adapter.
 *
 * The guard implements the classification HARD-005 asks for. Every provider
 * host literal in first-party source is one of:
 *
 *   documentation      — the literal sits on a comment line. Allowed.
 *   test fixture       — the file is a test/fixture/mock/generated artifact, or
 *                        (in Rust) the literal sits in the file's inline
 *                        `#[cfg(test)]` module. Allowed.
 *   canonical decl.    — the file's job IS to declare endpoints: a provider
 *                        adapter declaring its own provider's default and host
 *                        allowlist, an SSRF allowlist, a pinning table, or a
 *                        deployable's endpoint module. Allowed by path rule or
 *                        by an explicit BUDGETS entry.
 *   defect             — anything else. Fails.
 *
 * BUDGETS is a per-file BUDGET, not a boolean allowlist: each entry records how
 * many literals that file may contain today, so a new call site in an unlisted
 * file fails, an extra literal in a listed file fails, and the residue can only
 * shrink. `residue: true` marks entries that are NOT approved — they are
 * un-migrated call sites owed to another ledger task, named in `why`.
 *
 * Scope, honestly stated: this covers model/LLM provider hosts (the
 * HARD-001..005 family) only. Internal cloud hosts, OAuth callback URLs,
 * localhost ports, and public asset origins are NOT covered; those parts of
 * HARD-005 remain open.
 *
 * Usage: node scripts/check-no-hardcoded-endpoints.mjs
 * Exit 0 when clean, 1 with a per-file report otherwise.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const SCAN_ROOTS = ['apps', 'packages', 'services', 'crates', 'shared'];
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
  // Developer probe/maintenance scripts inside a package (e.g.
  // apps/web/scripts/test-llm-keys.ts) are tooling, not shipped request paths.
  'scripts',
]);

/** A file whose name marks it as a test/fixture/generated artifact. */
function isNonProductionFile(fileName) {
  return (
    /\.(test|spec|bench)\.[cm]?tsx?$/.test(fileName) ||
    /\.d\.ts$/.test(fileName) ||
    /(^|[.-])(fixtures?|mocks?|generated)\./.test(fileName)
  );
}

/**
 * Files whose declared purpose is endpoint declaration, matched by path.
 * Keeping these as rules rather than a hand-listed file set means a NEW
 * provider adapter is covered the day it lands, instead of tripping the guard
 * and being waved through with a budget entry.
 */
const DECLARATION_PATH_RULES = [
  {
    // Each adapter declares its own provider's default base URL and narrow
    // host allowlist — that IS the canonical per-provider declaration the
    // HARD-001..004 fixes point at.
    test: (rel) => /^packages\/ai\/providers\/[^/]+\/src\//.test(rel),
    why: 'provider adapter package — owns its provider default base URL and host allowlist',
  },
];

/**
 * Model-provider API hosts. Matched as bare hostnames so `https://`, `http://`,
 * a bare string in a config table, and a Rust `&str` all trip the same rule.
 */
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

const HOST_PATTERN = new RegExp(PROVIDER_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|'), 'g');

/** Line is entirely a comment — the literal is documentation, not a call. */
function isCommentLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('#!')
  );
}

/**
 * Line index (0-based) at which a Rust file's inline unit tests begin, or
 * `lines.length` when it has none. Rust convention puts `#[cfg(test)] mod
 * tests` at the bottom of the file, so everything from the first `#[cfg(test)]`
 * attribute onward is test code living in a production file.
 */
function rustTestModuleStart(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith('#[cfg(test)]')) return i;
  }
  return lines.length;
}

/**
 * Approved declarations and un-migrated residue. Every entry needs a reason; an
 * entry without one is how a budget quietly becomes a permanent exemption.
 */
const BUDGETS = [
  // ---- Approved declarations -------------------------------------------
  {
    file: 'packages/ai/provider-runtime/src/base-url.ts',
    max: 13,
    why: 'ALLOWED_MANAGED_PROVIDER_HOSTS — the canonical managed-provider SSRF allowlist.',
  },
  {
    file: 'apps/web/lib/server/provider-endpoints.ts',
    max: 4,
    why: "Web's single declaration of managed-provider API roots for direct fetch call sites, including authenticated OpenRouter media jobs.",
  },
  {
    file: 'apps/web/lib/egress-policy.ts',
    max: 1,
    why: 'RETIRED_PROVIDER_HOSTS — the subtraction applied to the canonical allowlist.',
  },
  {
    file: 'apps/desktop/src/features/settings/CustomModelsSettings.tsx',
    max: 6,
    why: 'BYOK base-URL presets shown to the user for prefill; not an outbound endpoint.',
  },
  {
    file: 'apps/mobile/lib/pinning.ts',
    max: 4,
    why: 'Certificate-pinning host table — pins are declared per literal host by definition.',
  },
  {
    file: 'packages/ai/provider-protocol/src/anthropic-payload-policy.ts',
    max: 1,
    why: 'Wire-policy host check: the vendor host gates a vendor-only payload field.',
  },
  {
    file: 'packages/ai/provider-protocol/src/openai-responses-payload-policy.ts',
    max: 14,
    why: 'Wire-policy table of OpenAI-compatible endpoints and their capability profiles.',
  },
  {
    file: 'apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs',
    max: 13,
    why: "Desktop's default_base_url() provider table — the canonical desktop declaration.",
  },
  {
    file: 'apps/cli/src/models/mod.rs',
    max: 9,
    why: "CLI's ModelConfig base_url table — the canonical CLI declaration.",
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

  // ---- Residue: un-migrated call sites owed to other ledger tasks -------
  {
    file: 'apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs',
    max: 2,
    residue: true,
    why: 'HARD-001 — summarizer still posts to hardcoded OpenAI chat/embeddings endpoints.',
  },
  {
    file: 'apps/desktop/src-tauri/src/features/speech/tts.rs',
    max: 1,
    residue: true,
    why: 'HARD-004 — speech endpoints not yet moved into a shared provider contract.',
  },
  {
    file: 'apps/desktop/src-tauri/src/sys/commands/voice.rs',
    max: 1,
    residue: true,
    why: 'HARD-004 — speech endpoints not yet moved into a shared provider contract.',
  },
  {
    file: 'apps/cli/src/voice.rs',
    max: 1,
    residue: true,
    why: 'HARD-004 — speech endpoints not yet moved into a shared provider contract.',
  },
  {
    file: 'apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs',
    max: 3,
    residue: true,
    why: 'HARD-002 — image endpoints not yet resolved through provider metadata.',
  },
  {
    file: 'apps/desktop/src-tauri/src/integrations/api_integrations/perplexity.rs',
    max: 1,
    residue: true,
    why: 'HARD-002 — Perplexity host duplicated outside the provider metadata path.',
  },
  {
    file: 'apps/desktop/src-tauri/src/core/research/web_search_config.rs',
    max: 1,
    residue: true,
    why: 'HARD-002 — Perplexity search host duplicated in the research search config.',
  },
  {
    file: 'apps/desktop/src-tauri/src/integrations/api_integrations/veo3.rs',
    max: 1,
    residue: true,
    why: 'HARD-002 — Veo host duplicated outside the provider metadata path.',
  },
  {
    file: 'apps/desktop/src-tauri/src/sys/commands/llm.rs',
    max: 1,
    residue: true,
    why: 'HARD-001 — OpenRouter model-list fetch bypasses default_base_url().',
  },
  {
    file: 'apps/cli/src/config.rs',
    max: 1,
    residue: true,
    why: 'HARD-003 — CLI config default duplicates the OpenRouter base URL.',
  },
  {
    file: 'apps/cli/src/models/openrouter_models.rs',
    max: 1,
    residue: true,
    why: 'HARD-003 — OpenRouter model-list URL duplicated outside the ModelConfig table.',
  },
  {
    file: 'apps/web/app/api/llm/v1/embeddings/route.ts',
    max: 1,
    residue: true,
    why: 'HARD-005 follow-up — Google embeddings needs a Google entry in provider-endpoints.ts.',
  },
  {
    file: 'apps/web/app/api/media/image/generate/route.ts',
    max: 3,
    residue: true,
    why: 'HARD-005 follow-up — Google/Stability image hosts need declarations of their own.',
  },
  {
    file: 'apps/web/app/api/media/video/status/route.ts',
    max: 1,
    residue: true,
    why: 'HARD-005 follow-up — Google operations host needs a declaration of its own.',
  },
  {
    file: 'apps/web/app/api/control-plane/status/route.ts',
    max: 1,
    residue: true,
    why: 'HARD-005 follow-up — status probe host duplicated from the provider registry.',
  },
  {
    file: 'apps/web/lib/web-search/web-search-tool.ts',
    max: 1,
    residue: true,
    why: 'HARD-002 — Perplexity search host duplicated in the web-search tool.',
  },
  {
    file: 'services/api-gateway/src/services/providerHealth.ts',
    max: 8,
    residue: true,
    why: 'HARD-005 follow-up — gateway health pings need their own endpoint declaration.',
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

/** Provider host literals that are neither documentation nor inline test code. */
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
    console.error(`  ${violation.rel} — ${violation.message}`);
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
  console.error('\nStale BUDGETS entries (no literals found — the file was cleaned up):');
  for (const entry of stale) console.error(`  ${entry.file}`);
  console.error('Remove them so the budget list stays a true picture of the repo.');
}

if (violations.length > 0 || stale.length > 0) process.exit(1);

console.log(
  `check-no-hardcoded-endpoints: OK (${counts.size} declared file(s), ` +
    `${BUDGETS.filter((b) => b.residue).length} still carrying un-migrated call sites)`,
);
