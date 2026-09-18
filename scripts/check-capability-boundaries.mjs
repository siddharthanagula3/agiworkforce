#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CAPABILITY_SOURCE = 'packages/contracts/types/src/capabilities.ts';
export const PROVIDER_SOURCE = 'packages/contracts/types/src/provider.ts';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench|stories)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e|node_modules|dist|build|\.next|\.turbo|coverage|public)\//.test(
      relativePath,
    )
  );
}

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/** The vocabularies are read from the contracts, never restated here. */
export function readUnionMembers(source, typeName) {
  const declaration = new RegExp(`export type ${typeName} =([\\s\\S]*?);`).exec(source);
  if (declaration === null) return [];
  return [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function platformCapabilities(repoRoot = REPO_ROOT) {
  const source = readSource(repoRoot, CAPABILITY_SOURCE);
  return source === null ? [] : readUnionMembers(source, 'PlatformCapability');
}

export function providerIds(repoRoot = REPO_ROOT) {
  const source = readSource(repoRoot, PROVIDER_SOURCE);
  return source === null ? [] : readUnionMembers(source, 'Provider');
}

// ---------------------------------------------------------------------------
// 1. Slash-command registries
// ---------------------------------------------------------------------------

const SURFACE_RE =
  /(SlashCommand|slash-command|useSlashCommand|Composer|PlusMenu|AttachmentMenu|AddToChatSheet|ChatInput)/;
const REGISTRY_RE =
  /(BUILT_IN_SLASH_COMMANDS|filterSlashCommandsByCapability|slash-command-registry)/;
const CMD_LITERAL_RE = /['"`]\/[a-z][a-z0-9-]+['"`]/g;
const MIN_DISTINCT_COMMANDS = 4;

export const SLASH_COMMAND_ALLOWLIST = new Map([
  [
    'apps/mobile/src/features/chat/components/ChatInput.tsx',
    'mobile slash set (/image,/voice,/compare,/export), adopt the now-shared @agiworkforce/unified-chat registry and package menu in the mobile composer.',
  ],
]);

export function slashCommandViolations({ repoRoot = REPO_ROOT, files }) {
  const violations = [];
  for (const relativePath of files) {
    if (!SURFACE_RE.test(relativePath)) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    if (relativePath.endsWith('slash-command-registry.ts')) continue;
    if (SLASH_COMMAND_ALLOWLIST.has(relativePath)) continue;

    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    const distinct = new Set(
      (source.match(CMD_LITERAL_RE) ?? []).map((literal) => literal.replace(/['"`]/g, '')),
    );
    if (distinct.size < MIN_DISTINCT_COMMANDS) continue;
    if (REGISTRY_RE.test(source)) continue;

    violations.push(
      `${relativePath}: hardcodes ${distinct.size} slash-command literals without importing the ` +
        `canonical @agiworkforce/unified-chat registry (BUILT_IN_SLASH_COMMANDS + ` +
        `filterSlashCommandsByCapability). Consume the registry + capability filter instead of a ` +
        `private allowlist.`,
    );
  }
  return violations;
}

// ---------------------------------------------------------------------------
// 2. Capability inference outside the handshake
// ---------------------------------------------------------------------------

export const CLIENT_ROOTS = Object.freeze([
  'apps/web/features',
  'apps/web/shared',
  'apps/web/components',
  'apps/desktop/src',
  'apps/mobile',
  'apps/extension/src',
  'apps/extension-vscode/src',
]);

/**
 * Anything that reaches the server's answer, directly or through a store that
 * holds it. Naming capabilities is fine; deciding them locally is not.
 */
const HANDSHAKE_CONSUMER_RE =
  /(isCapabilityEnabled|getPlatformCapabilities|PLATFORM_CAPABILITIES|capability-handshake|useCapabilit|isCapabilityRequestable|grantedCapabilities|CapabilityDecision|resolveEffectiveCapabilities)/;

const MIN_DISTINCT_CAPABILITIES = 3;

export const CAPABILITY_LITERAL_ALLOWLIST = new Map([]);

export function capabilityLiteralViolations({
  repoRoot = REPO_ROOT,
  files,
  capabilities = platformCapabilities(repoRoot),
}) {
  if (capabilities.length === 0) {
    return [`${CAPABILITY_SOURCE}: PlatformCapability is unreadable, so this guard cannot run.`];
  }
  const literal = new RegExp(`['"\`](${capabilities.join('|')})['"\`]`, 'g');
  const violations = [];

  for (const relativePath of files) {
    if (!CLIENT_ROOTS.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    if (CAPABILITY_LITERAL_ALLOWLIST.has(relativePath)) continue;

    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    literal.lastIndex = 0;
    const distinct = new Set([...source.matchAll(literal)].map((match) => match[1]));
    if (distinct.size < MIN_DISTINCT_CAPABILITIES) continue;
    if (HANDSHAKE_CONSUMER_RE.test(source)) continue;

    violations.push(
      `${relativePath}: decides ${distinct.size} capabilities (${[...distinct].sort().slice(0, 4).join(', ')}) ` +
        `from string literals without reading the capability handshake. A client that infers its own ` +
        `plan, model, tool, policy or feature availability will disagree with the server the first ` +
        `time either changes.`,
    );
  }
  return violations;
}

// ---------------------------------------------------------------------------
// 3. Provider identity outside an adapter
// ---------------------------------------------------------------------------

export const PROVIDER_LOGIC_ROOTS = Object.freeze(['apps/web/app', 'apps/web/lib']);

/** Files whose job IS the provider boundary: the branch belongs to them. */
export const PROVIDER_ADAPTER_PATHS = new Map([
  ['apps/web/lib/services/provider-adapter-service.ts', 'builds the per-provider adapter'],
  [
    'apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts',
    'translates the canonical request into each vendor request shape',
  ],
  [
    'apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts',
    'translates each vendor stream into the canonical chunk union',
  ],
  [
    'apps/web/app/api/media/image/lib/image-generation-provider.ts',
    'the image-generation adapter itself',
  ],
  [
    'apps/web/lib/services/video-provider-output-service.ts',
    'normalizes each video vendor output shape',
  ],
  [
    'apps/web/lib/server/video-provider-release-policy.ts',
    'states the per-vendor release terms the router reads',
  ],
  [
    'apps/web/app/api/code/sessions/[sessionId]/provider-proxy/[...path]/route.ts',
    'the provider proxy, whose path segment is the provider',
  ],
  ['apps/web/lib/services/aggregator-routing.ts', 'aggregator identity is this module subject'],
]);

/**
 * Business logic that still branches on provider identity. Each entry is debt:
 * the branch belongs behind a ProviderTrait in provider-adapter.ts. The list
 * may only shrink, and the guard fails when an entry stops branching.
 */
export const PROVIDER_BRANCH_ALLOWLIST = new Map([
  [
    'apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts',
    'thinking, web-fetch and grounding decisions branch on vendor id; move each behind a ProviderTrait',
  ],
  [
    'apps/web/app/api/llm/v1/audio/transcriptions/route.ts',
    'the transcription route refuses a non-OpenAI default model instead of asking whether the adapter transcribes',
  ],
  [
    'apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts',
    'vendor display labels; belongs to the adapter label, not to error copy',
  ],
  [
    'apps/web/app/api/media/image/generate/route.ts',
    'narrows the request to two vendors by name rather than by declared image capability',
  ],
  [
    'apps/web/app/api/media/image/lib/image-job-executor.ts',
    'vendor display label inside the job executor',
  ],
  ['apps/web/app/api/media/video/generate/route.ts', 'video vendor branching in the route'],
  ['apps/web/app/api/media/video/cancel/route.ts', 'video vendor branching in the route'],
  ['apps/web/app/api/media/video/status/route.ts', 'video vendor branching in the route'],
  [
    'apps/web/lib/hooks/useMediaGeneration.ts',
    'the client narrows providers by name before calling the media route',
  ],
  [
    'apps/web/lib/server/container-files.ts',
    'file-reference handling branches on the vendor that issued the id',
  ],
  [
    'apps/web/lib/services/media-model-availability-service.ts',
    'availability is decided per vendor name rather than per declared capability',
  ],
  [
    'apps/web/lib/services/video-job-reconciliation-service.ts',
    'reconciliation branches on the vendor that owns the job',
  ],
]);

export function providerBranchPattern(providers) {
  const group = providers.join('|');
  return new RegExp(
    `\\b\\w*[Pp]rovider\\w*\\s*(?:===|!==)\\s*['"\`](?:${group})['"\`]` +
      `|['"\`](?:${group})['"\`]\\s*(?:===|!==)\\s*\\w*[Pp]rovider\\w*\\b`,
  );
}

export function providerIdentityViolations({
  repoRoot = REPO_ROOT,
  files,
  providers = providerIds(repoRoot),
}) {
  if (providers.length === 0) {
    return [`${PROVIDER_SOURCE}: Provider is unreadable, so this guard cannot run.`];
  }
  const pattern = providerBranchPattern(providers);
  const violations = [];
  const branching = new Set();

  for (const relativePath of files) {
    if (!PROVIDER_LOGIC_ROOTS.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;

    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    const lines = source.split('\n');
    const hits = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (isCommentLine(lines[index])) continue;
      if (pattern.test(lines[index])) hits.push(index + 1);
    }
    if (hits.length === 0) continue;
    branching.add(relativePath);

    if (PROVIDER_ADAPTER_PATHS.has(relativePath)) continue;
    if (PROVIDER_BRANCH_ALLOWLIST.has(relativePath)) continue;

    violations.push(
      `${relativePath}:${hits[0]}: business logic branches on provider identity ` +
        `(${hits.length} line(s)). Provider-specific behaviour belongs behind a ProviderTrait in ` +
        `packages/contracts/types/src/provider-adapter.ts: ask what the provider can do, not who it is. ` +
        `If this file IS the adapter boundary, add it to PROVIDER_ADAPTER_PATHS with the reason.`,
    );
  }

  for (const [relativePath] of PROVIDER_BRANCH_ALLOWLIST) {
    if (!branching.has(relativePath)) {
      violations.push(
        `${relativePath}: no longer branches on provider identity. Drop it from ` +
          `PROVIDER_BRANCH_ALLOWLIST, the tracked-debt list may only shrink.`,
      );
    }
  }
  return violations;
}

export function repositoryFiles(repoRoot = REPO_ROOT) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))].sort();
}

export function checkCapabilityBoundaries(repoRoot = REPO_ROOT) {
  const files = repositoryFiles(repoRoot);
  return [
    ...slashCommandViolations({ repoRoot, files }),
    ...capabilityLiteralViolations({ repoRoot, files }),
    ...providerIdentityViolations({ repoRoot, files }),
  ];
}

function main() {
  const errors = checkCapabilityBoundaries(REPO_ROOT);
  if (errors.length > 0) {
    console.error('✗ capability-boundary check failed:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log(
    `✓ capability boundaries: composer surfaces consume the slash registry, clients read the ` +
      `capability handshake, and provider identity stays inside adapters ` +
      `(${SLASH_COMMAND_ALLOWLIST.size} slash, ${CAPABILITY_LITERAL_ALLOWLIST.size} capability and ` +
      `${PROVIDER_BRANCH_ALLOWLIST.size} provider surface(s) allowlisted as tracked debt).`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
