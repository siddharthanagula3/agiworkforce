// A cache key must fold in the tenant, user, plan version and toolset before hashing,
// or two workspaces served through one upstream account share a cache namespace.
// No Node builtins: the types barrel is imported by browser code; adapters hash the material.

import type { ChatRequest, EphemeralCacheControl, ToolDef } from './provider-adapter';

/**
 * How much of a turn may survive it.
 *
 * `standard` is an ordinary conversation. `temporary` is a Temporary Chat,
 * which promises nothing outlives the turn. `zero_retention` is a workspace or
 * route under a zero-retention obligation. Only the first may be cached.
 */
export type PromptCachePrivacyClass = 'standard' | 'temporary' | 'zero_retention';

export type PromptCacheRetention = 'short' | 'long' | 'none';

export type PromptCacheSkipReason =
  'temporary_chat' | 'zero_data_retention' | 'no_stable_prefix' | 'unscoped_tenant';

/**
 * Who is asking. Supplied by the surface that knows, never inferred from the
 * prompt: a request that carries none of these identifiers is unscoped, and an
 * unscoped request gets no shared cache key.
 */
export interface PromptCacheScope {
  organizationId?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  privacyClass?: PromptCachePrivacyClass;
  /** The prompt manifest version this turn serves, when the surface pins one. */
  promptVersion?: string | null;
}

export interface PromptCachePlan {
  /** Whether this turn's content may be cached at all. */
  cacheable: boolean;
  privacyClass: PromptCachePrivacyClass;
  /** Why this plan carries no `keyMaterial`; absent when it carries one. */
  skipReason?: PromptCacheSkipReason;
  /**
   * The canonical, tenant-scoped material a provider hashes into its cache
   * key. Absent whenever the turn may not be cached or the caller named no
   * tenant, which is why an unscoped request can never collide with another.
   */
  keyMaterial?: string;
  retention: PromptCacheRetention;
  ttl: EphemeralCacheControl['ttl'];
  /** Anthropic refuses more than this many `cache_control` breakpoints. */
  maxBreakpoints: number;
}

export interface PromptCachePlanOptions {
  /**
   * The part of the system prompt that is stable across turns, already split
   * on the cache boundary by the caller that owns that marker.
   */
  stablePrefix?: string | undefined;
}

const PROMPT_CACHE_PLAN_VERSION = 'v1';
const PROMPT_CACHE_MAX_BREAKPOINTS = 4;
const PROMPT_CACHE_TTL_LONG = '1h' as const;

/**
 * A toolset is part of the cached prefix on every provider that caches at all,
 * so two turns with different tools must not share a key. Sorted so tool order
 * alone never invalidates a cache.
 */
function toolsetVersion(tools: readonly ToolDef[] | undefined, rawVendorToolCount: number): string {
  const named = (tools ?? [])
    .map((tool) => `${tool.name}${tool.strict ? '!' : ''}`)
    .sort()
    .join(',');
  return `${named}#${rawVendorToolCount}`;
}

/**
 * Length-prefixed so no value can impersonate a delimiter and shift the
 * meaning of the fields after it.
 */
function segment(label: string, value: string): string {
  return `${label}:${value.length}:${value}`;
}

function resolvePrivacyClass(req: ChatRequest): PromptCachePrivacyClass {
  const declared = req.promptCache?.privacyClass;
  if (declared && declared !== 'standard') return declared;
  if (req.zeroDataRetentionOnly) return 'zero_retention';
  return declared ?? 'standard';
}

// Temporary Chat promises nothing outlives the turn, so it outranks zero retention.
export function resolvePromptCachePrivacyClass(input: {
  temporaryChat?: boolean;
  zeroDataRetentionOnly?: boolean;
}): PromptCachePrivacyClass {
  if (input.temporaryChat) return 'temporary';
  if (input.zeroDataRetentionOnly) return 'zero_retention';
  return 'standard';
}

function scopeIdentifiers(scope: PromptCacheScope | undefined): {
  organizationId: string;
  userId: string;
  workspaceId: string;
} | null {
  const organizationId = scope?.organizationId ?? '';
  const userId = scope?.userId ?? '';
  const workspaceId = scope?.workspaceId ?? '';
  if (!organizationId && !userId && !workspaceId) return null;
  return { organizationId, userId, workspaceId };
}

function skipReasonFor(privacyClass: PromptCachePrivacyClass): PromptCacheSkipReason {
  return privacyClass === 'temporary' ? 'temporary_chat' : 'zero_data_retention';
}

function unusablePlan(
  privacyClass: PromptCachePrivacyClass,
  skipReason: PromptCacheSkipReason,
): PromptCachePlan {
  return {
    cacheable: false,
    privacyClass,
    skipReason,
    retention: 'none',
    ttl: undefined,
    maxBreakpoints: 0,
  };
}

/**
 * The cache plan for one turn.
 *
 * `cacheable` answers the content-addressed caches (Anthropic's
 * `cache_control`), which are already scoped to the upstream account and only
 * need the privacy class. `keyMaterial` answers the caches that take an
 * explicit namespace key (OpenAI's `prompt_cache_key`), which additionally
 * need the tenant, and is withheld when the caller named none.
 */
export function buildPromptCachePlan(
  req: ChatRequest,
  options: PromptCachePlanOptions = {},
): PromptCachePlan {
  const privacyClass = resolvePrivacyClass(req);
  if (privacyClass !== 'standard') {
    return unusablePlan(privacyClass, skipReasonFor(privacyClass));
  }

  const hasTools = (req.tools?.length ?? 0) + (req.rawVendorTools?.length ?? 0) > 0;
  const retention: PromptCacheRetention = hasTools ? 'long' : 'short';
  const ttl = retention === 'long' ? PROMPT_CACHE_TTL_LONG : undefined;
  const base = {
    cacheable: true as const,
    privacyClass,
    retention,
    ttl,
    maxBreakpoints: PROMPT_CACHE_MAX_BREAKPOINTS,
  };

  const stablePrefix = options.stablePrefix;
  if (!stablePrefix) return { ...base, skipReason: 'no_stable_prefix' };

  const identifiers = scopeIdentifiers(req.promptCache);
  if (!identifiers) return { ...base, skipReason: 'unscoped_tenant' };

  return {
    ...base,
    keyMaterial: [
      segment('v', PROMPT_CACHE_PLAN_VERSION),
      segment('org', identifiers.organizationId),
      segment('user', identifiers.userId),
      segment('ws', identifiers.workspaceId),
      segment('pv', req.promptCache?.promptVersion ?? ''),
      segment('tv', toolsetVersion(req.tools, req.rawVendorTools?.length ?? 0)),
      segment('sp', stablePrefix),
    ].join('|'),
  };
}

export { PROMPT_CACHE_MAX_BREAKPOINTS, PROMPT_CACHE_PLAN_VERSION };
