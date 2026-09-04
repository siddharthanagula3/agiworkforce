/**
 * What a Code session can run in: a coding harness, or a plain image.
 *
 * A harness is an E2B template with a coding agent's CLI already installed.
 * you cannot code in a browser without a sandbox, so the sandbox is where the
 * agent lives. E2B publishes one per agent and documents them under
 * https://docs.e2b.dev/agents.
 *
 * The harnesses are declared rather than discovered because E2B has no endpoint
 * that lists public templates: `GET /templates` returns only the team's own,
 * and `/templates/aliases/{alias}` answers 403 for a public name. Spawning one
 * by name works regardless, which is how they are reachable at all.
 *
 * Every entry below was verified by spawning it on 2026-08-31 and locating the
 * binary inside; the paths in `agentCommand` are the observed ones, not
 * documentation's word. Do not add an entry that has not been spawned.
 *
 * The team's own templates are read live on top, so a template published in the
 * E2B console appears without a release. The merged list is also the allowlist:
 * a client may only name something it contains.
 *
 * Fails soft, unlike the executor: if the live read fails the harnesses still
 * stand, and a session with no choice uses the SDK's default image.
 */
import 'server-only';

import { z } from 'zod';
import type { CloudCodeRuntime } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { E2B_API_KEY_ENV, e2bExecutionEnabled } from './gate';

const E2B_DOMAIN_ENV = 'E2B_DOMAIN';
const E2B_API_URL_ENV = 'E2B_API_URL';
const DEFAULT_E2B_DOMAIN = 'e2b.app';
const CATALOGUE_TTL_MS = 5 * 60_000;
const CATALOGUE_TIMEOUT_MS = 5_000;

/**
 * Only `ready` builds can be spawned; offering any other status produces a
 * session that fails at create time with nothing the user can act on.
 */
const READY_BUILD_STATUS = 'ready';

const TemplateSchema = z.looseObject({
  templateID: z.string().min(1),
  names: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  buildStatus: z.string().optional(),
  public: z.boolean().optional(),
  cpuCount: z.number().optional(),
  memoryMB: z.number().optional(),
  diskSizeMB: z.number().optional(),
  spawnCount: z.number().optional(),
});

/**
 * Coding agents E2B ships a template for, each verified to spawn and to carry
 * the binary named here.
 */
const CODING_HARNESSES: readonly CloudCodeRuntime[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    kind: 'harness',
    summary: 'Anthropic’s agentic CLI, ready to run.',
    agentCommand: 'claude',
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
  },
  {
    id: 'codex',
    name: 'Codex',
    kind: 'harness',
    summary: 'OpenAI’s coding agent CLI.',
    agentCommand: 'codex',
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
  },
  {
    id: 'droid',
    name: 'Droid',
    kind: 'harness',
    summary: 'Factory’s software engineering agent.',
    agentCommand: 'droid',
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
  },
  {
    id: 'amp',
    name: 'Amp',
    kind: 'harness',
    summary: 'Sourcegraph’s coding agent.',
    agentCommand: 'amp',
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    kind: 'harness',
    summary: 'Open-source terminal coding agent.',
    agentCommand: 'opencode',
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
  },
  {
    id: 'grok',
    name: 'Grok CLI',
    kind: 'harness',
    summary: 'xAI’s coding agent CLI.',
    agentCommand: 'grok',
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    kind: 'harness',
    summary: 'Open-source agent harness.',
    agentCommand: 'openclaw',
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
  },
  {
    id: 'code-interpreter-v1',
    name: 'Code Interpreter',
    kind: 'image',
    summary: 'Python with Jupyter, pandas, numpy and plotting.',
    agentCommand: null,
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
  },
  {
    id: 'k3s',
    name: 'Kubernetes (k3s)',
    kind: 'image',
    summary: 'A single-node cluster with kubectl.',
    agentCommand: null,
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
  },
];

export interface HarnessCredentialSpec {
  readonly envVar: string;
  readonly providerId: string;
}

/**
 * Which sandbox env var each harness CLI reads for its credential, and which
 * of `buildServerProviderAdapter`'s provider ids resolves the value it gets.
 * `opencode` auto-detects among several, so it lists every candidate the
 * caller may have configured rather than one.
 */
const HARNESS_CREDENTIAL_SPECS: Readonly<Record<string, readonly HarnessCredentialSpec[]>> = {
  claude: [{ envVar: 'ANTHROPIC_API_KEY', providerId: 'anthropic' }],
  codex: [{ envVar: 'CODEX_API_KEY', providerId: 'openai' }],
  droid: [{ envVar: 'FACTORY_API_KEY', providerId: 'factory' }],
  grok: [{ envVar: 'XAI_API_KEY', providerId: 'xai' }],
  amp: [{ envVar: 'AMP_API_KEY', providerId: 'amp' }],
  opencode: [
    { envVar: 'ANTHROPIC_API_KEY', providerId: 'anthropic' },
    { envVar: 'OPENAI_API_KEY', providerId: 'openai' },
    { envVar: 'GEMINI_API_KEY', providerId: 'google' },
  ],
};

export function harnessCredentialSpecs(harnessId: string): readonly HarnessCredentialSpec[] {
  return HARNESS_CREDENTIAL_SPECS[harnessId] ?? [];
}

/**
 * Which sandbox env var a harness CLI honours to redirect its API traffic to a
 * custom base URL, verified against the CLI's own docs rather than assumed by
 * symmetry with `HARNESS_CREDENTIAL_SPECS`. Confirmed 2026-09-04:
 *   - claude: https://code.claude.com/docs/en/env-vars documents ANTHROPIC_BASE_URL.
 * Checked and NOT added because no such env var is documented:
 *   - codex: base URL is config.toml-only (`model_providers.<id>.base_url`).
 *   - droid: base URL is `~/.factory/settings.json`-only (`baseUrl`).
 *   - amp: no documented endpoint override of any kind.
 *   - opencode: base URL is `opencode.json`-only (`provider.<id>.options.baseURL`).
 *   - grok: base URL is `~/.grok/config.toml`-only (`base_url`).
 * A harness without a verified env var keeps receiving its managed key
 * directly rather than being silently left uncovered by network-policy.ts.
 */
const HARNESS_PROXIED_BASE_URL_ENV: Readonly<Partial<Record<string, string>>> = {
  claude: 'ANTHROPIC_BASE_URL',
};

export function harnessProxyBaseUrlEnv(harnessId: string): string | undefined {
  return HARNESS_PROXIED_BASE_URL_ENV[harnessId];
}

/**
 * A harness is proxy-covered only when it has exactly one credential spec and
 * a verified base-URL env var: the proxy forwards to one provider per
 * session, so a harness like opencode that can auto-detect several providers
 * cannot be safely routed without knowing at mint time which one it will use.
 */
export function harnessIsProxyCovered(harnessId: string): boolean {
  return (
    harnessCredentialSpecs(harnessId).length === 1 &&
    harnessProxyBaseUrlEnv(harnessId) !== undefined
  );
}

export function knownHarnessCommandIds(): ReadonlySet<string> {
  return new Set(
    CODING_HARNESSES.filter(
      (harness): harness is CloudCodeRuntime & { agentCommand: string } =>
        harness.kind === 'harness' && typeof harness.agentCommand === 'string',
    ).map((harness) => harness.agentCommand),
  );
}

function apiBaseUrl(): string {
  const explicit = process.env[E2B_API_URL_ENV]?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const domain = process.env[E2B_DOMAIN_ENV]?.trim() || DEFAULT_E2B_DOMAIN;
  return `https://api.${domain}`;
}

/**
 * `names` is the namespaced display name and `aliases` the legacy one; the id
 * is the only field guaranteed present, so it is the last resort rather than
 * the label of choice.
 */
function templateLabel(template: z.infer<typeof TemplateSchema>): string {
  return template.names?.[0]?.trim() || template.aliases?.[0]?.trim() || template.templateID;
}

let cache: { at: number; runtimes: CloudCodeRuntime[] } | null = null;

export function clearCloudCodeRuntimeCache(): void {
  cache = null;
}

async function fetchTemplates(apiKey: string): Promise<CloudCodeRuntime[]> {
  const response = await fetch(`${apiBaseUrl()}/templates`, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) {
    logger.warn({ status: response.status }, '[e2b] template catalogue unavailable');
    return [];
  }
  const parsed = z.array(TemplateSchema).safeParse(await response.json());
  if (!parsed.success) {
    logger.warn('[e2b] template catalogue did not match the expected shape');
    return [];
  }
  return parsed.data
    .filter((template) => (template.buildStatus ?? READY_BUILD_STATUS) === READY_BUILD_STATUS)
    .map((template) => ({
      id: template.templateID,
      name: templateLabel(template),
      kind: 'image' as const,
      summary: 'Published by this team in the E2B console.',
      agentCommand: null,
      cpuCount: template.cpuCount ?? 0,
      memoryMB: template.memoryMB ?? 0,
      diskSizeMB: template.diskSizeMB ?? 0,
      isPublic: template.public === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Team templates win on a name collision, their own build is the one they mean. */
function merge(teamTemplates: readonly CloudCodeRuntime[]): CloudCodeRuntime[] {
  const claimed = new Set(teamTemplates.map((runtime) => runtime.id));
  return [...CODING_HARNESSES.filter((harness) => !claimed.has(harness.id)), ...teamTemplates];
}

export async function listCloudCodeRuntimes(): Promise<CloudCodeRuntime[]> {
  const apiKey = process.env[E2B_API_KEY_ENV]?.trim();
  // Without a key nothing can be spawned at all, so offering a harness would be
  // a promise the deployment cannot keep.
  if (!apiKey || !e2bExecutionEnabled()) return [];

  const now = Date.now();
  if (cache && now - cache.at < CATALOGUE_TTL_MS) return cache.runtimes;

  try {
    const runtimes = merge(await fetchTemplates(apiKey));
    cache = { at: now, runtimes };
    return runtimes;
  } catch (err) {
    logger.warn({ err }, '[e2b] could not read the team template catalogue');
    // The harnesses are public and do not depend on that read, so a transient
    // E2B outage costs the team's own templates and nothing else.
    return cache?.runtimes ?? merge([]);
  }
}

export function harnessTemplates(): readonly { id: string; name: string; summary: string }[] {
  return CODING_HARNESSES.filter((template) => template.kind === 'harness').map((template) => ({
    id: template.id,
    name: template.name,
    summary: template.summary,
  }));
}
