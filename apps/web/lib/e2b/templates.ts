/**
 * The account's E2B template catalogue — the images a Code session may build in.
 *
 * Read from E2B rather than declared here: the team's templates change in the
 * E2B console, and a hardcoded list would drift the moment one is added,
 * renamed, or rebuilt. It is also the allowlist — a session may only name a
 * template this returns, so a client cannot reach an arbitrary image id.
 *
 * Fails soft, unlike the executor: an unreadable catalogue means the picker is
 * empty and every session uses the SDK's default image, which is exactly the
 * behaviour before the runtime was selectable.
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
      cpuCount: template.cpuCount ?? 0,
      memoryMB: template.memoryMB ?? 0,
      diskSizeMB: template.diskSizeMB ?? 0,
      isPublic: template.public === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCloudCodeRuntimes(): Promise<CloudCodeRuntime[]> {
  const apiKey = process.env[E2B_API_KEY_ENV]?.trim();
  if (!apiKey || !e2bExecutionEnabled()) return [];

  const now = Date.now();
  if (cache && now - cache.at < CATALOGUE_TTL_MS) return cache.runtimes;

  try {
    const runtimes = await fetchTemplates(apiKey);
    cache = { at: now, runtimes };
    return runtimes;
  } catch (err) {
    logger.warn({ err }, '[e2b] could not read the template catalogue');
    // Serve a stale catalogue over none: the picker keeps working through a
    // transient E2B outage, and a template that has since been deleted fails
    // at create time with an explicit error rather than silently vanishing.
    return cache?.runtimes ?? [];
  }
}
