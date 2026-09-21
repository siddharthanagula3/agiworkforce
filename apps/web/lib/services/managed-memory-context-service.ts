import { createHash } from 'node:crypto';
import {
  classifyMemoryCategory,
  memoryConflictTopic,
  memoryConsolidationKey,
} from '@agiworkforce/agent-core';
import {
  contextFenceTag,
  contextSource,
  contextSourceClassPolicy,
  prohibitedMemoryCategory,
  prohibitedMemoryMessage,
  provenanceRecord,
  type ContextSource,
  type ContextSourceClass,
  type ProvenanceRecord,
} from '@agiworkforce/context';
import {
  CLOSED_ORGANIZATION_CONTEXT_POLICY,
  OPEN_ORGANIZATION_CONTEXT_POLICY,
  type ContextCandidate,
  type ContextSourceLoader,
  type OrganizationContextPolicy,
} from '@agiworkforce/context-engine';
import type { PrivacyMode } from '@agiworkforce/types';
import { fenceUntrustedMemoryContent } from '@agiworkforce/utils';
import { withSpan } from '@/lib/observability/span';
import { logger } from '@/lib/logger';
import type { ChatCompletionRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';

export interface ManagedMemoryContextDb {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface ManagedMemoryContextItem {
  content: string;
  category: string | null;
  pinned: boolean;
}

export interface ManagedMemoryContextSource extends ManagedMemoryContextItem {
  source: ContextSource;
}

export interface ManagedMemoryPolicy {
  enabled: boolean;
  generateFromHistory: boolean;
  allowToolAssistedGeneration: boolean;
  searchPastChats: boolean;
}

export const DISABLED_MANAGED_MEMORY_POLICY: ManagedMemoryPolicy = {
  enabled: false,
  generateFromHistory: false,
  allowToolAssistedGeneration: false,
  searchPastChats: false,
};

const MAX_MEMORIES = 30;
const MAX_MEMORY_CHARS = 1_000;
const MAX_TOTAL_MEMORY_CHARS = 8_000;
const MAX_AUTO_MEMORIES_PER_TURN = 5;

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 1))}…` : value;
}

function isoTimestamp(value: string | Date | null): string | null {
  if (value instanceof Date) return value.toISOString();
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * Whether the caller's active organization has turned memory on for its
 * members. Absent a policy row, or one this read failed to reach, memory
 * stays off: D9 gates workspace memory closed until an owner or admin
 * explicitly enables it, and a read failure must not silently open that
 * gate for every member.
 */
export interface OrganizationMemoryPolicy {
  allowMemory: boolean;
  /** The workspace's recorded retention window; only a control when enforced. */
  retentionDays: number | null;
  retentionEnforced: boolean;
}

export const CLOSED_ORGANIZATION_MEMORY_POLICY: OrganizationMemoryPolicy = {
  allowMemory: false,
  retentionDays: null,
  retentionEnforced: false,
};

export const UNGOVERNED_MEMORY_POLICY: OrganizationMemoryPolicy = {
  allowMemory: true,
  retentionDays: null,
  retentionEnforced: false,
};

export async function loadOrganizationMemoryPolicy(
  db: ManagedMemoryContextDb,
  organizationId: string | null | undefined,
): Promise<OrganizationMemoryPolicy> {
  if (!organizationId) return UNGOVERNED_MEMORY_POLICY;
  try {
    const [row] = await db.query<{
      allow_memory: boolean;
      retention_days: number | null;
      retention_enforced: boolean;
    }>(
      `select allow_memory, retention_days, retention_enforced
         from organization_admin_policies
        where organization_id = $1
        limit 1`,
      [organizationId],
    );
    if (!row) return CLOSED_ORGANIZATION_MEMORY_POLICY;
    return {
      allowMemory: row.allow_memory === true,
      retentionDays:
        typeof row.retention_days === 'number' && row.retention_days > 0
          ? row.retention_days
          : null,
      retentionEnforced: row.retention_enforced === true,
    };
  } catch (error) {
    logger.error(
      { error, organizationId },
      '[managed-memory] organization policy read failed; memory disabled for this organization',
    );
    return CLOSED_ORGANIZATION_MEMORY_POLICY;
  }
}

export async function organizationAllowsMemory(
  db: ManagedMemoryContextDb,
  organizationId: string,
): Promise<boolean> {
  return (await loadOrganizationMemoryPolicy(db, organizationId)).allowMemory;
}

/**
 * The workspace's say over every context source class, read from the one policy
 * row that has gated Memory since 0164. A read failure closes every class for
 * the same reason it closes Memory: a policy nobody could read is not consent.
 */
export async function loadOrganizationContextPolicy(
  db: ManagedMemoryContextDb,
  organizationId: string | null | undefined,
): Promise<OrganizationContextPolicy> {
  if (!organizationId) return OPEN_ORGANIZATION_CONTEXT_POLICY;
  try {
    const [row] = await db.query<{
      allow_memory: boolean;
      allow_connector_context: boolean;
      allow_web_result_context: boolean;
    }>(
      `select allow_memory, allow_connector_context, allow_web_result_context
         from organization_admin_policies
        where organization_id = $1
        limit 1`,
      [organizationId],
    );
    if (!row) return CLOSED_ORGANIZATION_CONTEXT_POLICY;
    return {
      allowMemory: row.allow_memory === true,
      allowPastChats: row.allow_memory === true,
      allowConnectorResults: row.allow_connector_context === true,
      allowWebResults: row.allow_web_result_context === true,
    };
  } catch (error) {
    logger.error(
      { error, organizationId },
      '[managed-memory] organization context policy read failed; every source class closed',
    );
    return CLOSED_ORGANIZATION_CONTEXT_POLICY;
  }
}

export async function organizationMemoryGate(
  db: ManagedMemoryContextDb,
  organizationId: string | null | undefined,
): Promise<boolean> {
  if (!organizationId) return true;
  return organizationAllowsMemory(db, organizationId);
}

export async function loadManagedMemoryPolicy(
  db: ManagedMemoryContextDb,
  params: { userId: string; organizationId?: string | null },
): Promise<ManagedMemoryPolicy> {
  if (params.organizationId && !(await organizationAllowsMemory(db, params.organizationId))) {
    return DISABLED_MANAGED_MEMORY_POLICY;
  }
  return readUserMemoryCapabilities(db, params.userId);
}

/**
 * The member's own switches, without re-reading the workspace policy a caller
 * may already hold. `loadMemoryWritePolicies` reads each of the two once.
 */
export async function readUserMemoryCapabilities(
  db: ManagedMemoryContextDb,
  userId: string,
): Promise<ManagedMemoryPolicy> {
  const [row] = await db.query<{ capabilities: unknown }>(
    `select coalesce(settings -> 'capabilities', '{}'::jsonb) as capabilities
       from user_settings
      where user_id = $1
      limit 1`,
    [userId],
  );
  const capabilities =
    row?.capabilities && typeof row.capabilities === 'object' && !Array.isArray(row.capabilities)
      ? (row.capabilities as Record<string, unknown>)
      : {};
  return {
    enabled: capabilities['memory'] === true,
    generateFromHistory:
      capabilities['memory'] === true && capabilities['generateFromHistory'] !== false,
    allowToolAssistedGeneration: capabilities['allowToolAssistedGeneration'] === true,
    searchPastChats: capabilities['searchPastChats'] === true,
  };
}

export const MAX_MEMORY_EXCLUSIONS = 50;
export const MIN_MEMORY_EXCLUSION_LENGTH = 3;

export function normalizeMemoryExclusions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const term = entry.trim().toLowerCase();
    if (term.length < MIN_MEMORY_EXCLUSION_LENGTH) continue;
    seen.add(term);
    if (seen.size >= MAX_MEMORY_EXCLUSIONS) break;
  }
  return [...seen];
}

export async function loadMemoryExclusions(
  db: ManagedMemoryContextDb,
  params: { userId: string },
): Promise<string[]> {
  const [row] = await db.query<{ memory: unknown }>(
    `select coalesce(settings -> 'memory', '{}'::jsonb) as memory
       from user_settings
      where user_id = $1
      limit 1`,
    [params.userId],
  );
  const memory =
    row?.memory && typeof row.memory === 'object' && !Array.isArray(row.memory)
      ? (row.memory as Record<string, unknown>)
      : {};
  return normalizeMemoryExclusions(memory['excludedTerms']);
}

export const MEMORY_SOURCES = ['mobile', 'desktop', 'web', 'auto'] as const;

export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const AUTO_MEMORY_SOURCE: MemorySource = 'auto';

export function normalizeSuppressedMemorySources(value: unknown): MemorySource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<MemorySource>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const source = entry.trim().toLowerCase();
    const known = MEMORY_SOURCES.find((candidate) => candidate === source);
    if (known) seen.add(known);
  }
  return [...seen];
}

export async function loadSuppressedMemorySources(
  db: ManagedMemoryContextDb,
  params: { userId: string },
): Promise<MemorySource[]> {
  const [row] = await db.query<{ memory: unknown }>(
    `select coalesce(settings -> 'memory', '{}'::jsonb) as memory
       from user_settings
      where user_id = $1
      limit 1`,
    [params.userId],
  );
  const memory =
    row?.memory && typeof row.memory === 'object' && !Array.isArray(row.memory)
      ? (row.memory as Record<string, unknown>)
      : {};
  return normalizeSuppressedMemorySources(memory['suppressedSources']);
}

export function matchedMemoryExclusion(
  content: string,
  exclusions: readonly string[],
): string | null {
  if (exclusions.length === 0) return null;
  const haystack = content.toLowerCase();
  return exclusions.find((term) => haystack.includes(term)) ?? null;
}

export function isMemoryExcluded(content: string, exclusions: readonly string[]): boolean {
  return matchedMemoryExclusion(content, exclusions) !== null;
}

export interface MemoryScope {
  /** Project the conversation belongs to, or null for a loose chat. */
  projectId: string | null;
  /** False when the project is set to draw only on its own memories. */
  usesGlobalMemory: boolean;
}

export const GLOBAL_MEMORY_SCOPE: MemoryScope = { projectId: null, usesGlobalMemory: true };

/**
 * Which memories a conversation may see.
 *
 * Outside a project only global rows (`project_id is null`) are visible, a
 * memory confined to a project must never surface anywhere else, or the
 * confinement means nothing. Inside a project the project's own rows are always
 * visible, and global rows join them unless the project opted out.
 */
export function activeMemoryPredicate(alias = ''): string {
  return `${alias}is_deleted = false and ${alias}superseded_by is null and (${alias}expires_at is null or ${alias}expires_at > now())`;
}

export function unexpiredMemoryPredicate(alias = ''): string {
  return `${alias}is_deleted = false and (${alias}expires_at is null or ${alias}expires_at > now())`;
}

export function workspaceMemoryPredicate(paramIndex: number, alias = ''): string {
  return `${alias}organization_id is not distinct from $${paramIndex}::uuid`;
}

function memoryContentKeySql(expression: string): string {
  return `btrim(regexp_replace(lower(${expression}), '[^[:alnum:]]+', ' ', 'g'))`;
}

function memoryRankSql(alias: string): string {
  return `case when ${alias}pinned then 2 when coalesce(${alias}source, 'web') = 'auto' then 0 else 1 end`;
}

export const MAX_MEMORY_EXPIRY_DAYS = 3650;

const DAY_MS = 86_400_000;

export type MemoryExpiryParse =
  { ok: true; expiresAt: string | null | undefined } | { ok: false; message: string };

export function parseMemoryExpiry(value: unknown, nowMs = Date.now()): MemoryExpiryParse {
  if (value === undefined) return { ok: true, expiresAt: undefined };
  if (value === null) return { ok: true, expiresAt: null };
  if (typeof value !== 'string') return { ok: false, message: 'expiresAt must be a date string' };
  const parsedMs = Date.parse(value);
  if (!Number.isFinite(parsedMs)) return { ok: false, message: 'expiresAt must be a valid date' };
  if (parsedMs <= nowMs) return { ok: false, message: 'expiresAt must be in the future' };
  if (parsedMs > nowMs + MAX_MEMORY_EXPIRY_DAYS * DAY_MS) {
    return {
      ok: false,
      message: `expiresAt must be within ${MAX_MEMORY_EXPIRY_DAYS} days`,
    };
  }
  return { ok: true, expiresAt: new Date(parsedMs).toISOString() };
}

export interface ConsolidatedMemoryRow {
  outcome: 'inserted' | 'merged';
  id: string;
  content: string;
  category: string | null;
  source: string | null;
  pinned: boolean;
  project_id: string | null;
  expires_at: string | null;
  superseded_by: string | null;
  superseded_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ConsolidatedMemoryWrite {
  userId: string;
  id?: string | null;
  content: string;
  category: string | null;
  source: string;
  pinned?: boolean;
  projectId?: string | null;
  organizationId?: string | null;
  expiresAt?: string | null;
  /** Which class of context the fact was taken from. Defaults to `past_chat`. */
  sourceClass?: ContextSourceClass;
  /** Trust boundary the turn ran under. Defaults to `managed`. */
  trustMode?: PrivacyMode;
  /** A turn under the temporary boundary never leaves a durable memory behind. */
  temporaryChat?: boolean;
  /** The conversation and turn the fact was learned in, when it was learned at all. */
  sourceConversationId?: string | null;
  sourceTurnId?: string | null;
  /** Set when an unattended run produced the fact. */
  agentId?: string | null;
}

/**
 * Where a memory came from, in the shape the canonical provenance model
 * declares. A memory the user typed in Settings was learned nowhere and has
 * none, which is itself the answer to "where did this come from".
 */
export function memoryProvenance(input: {
  userId: string;
  conversationId: string;
  turnId: string;
  agentId?: string | null;
  trustMode?: PrivacyMode;
  createdAt?: string;
}): ProvenanceRecord {
  return provenanceRecord('memory', {
    creatorAccountId: input.userId,
    sourceConversationId: input.conversationId,
    sourceTurnId: input.turnId,
    agentId: input.agentId ?? null,
    trustMode: input.trustMode ?? 'managed',
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
}

function memoryWriteProvenance(write: ConsolidatedMemoryWrite): ProvenanceRecord | null {
  const conversationId = write.sourceConversationId?.trim();
  const turnId = write.sourceTurnId?.trim();
  if (!conversationId || !turnId) return null;
  return memoryProvenance({
    userId: write.userId,
    conversationId,
    turnId,
    agentId: write.agentId ?? null,
    ...(write.trustMode ? { trustMode: write.trustMode } : {}),
  });
}

export const MEMORY_RETENTION_CLASSES = [
  'account',
  'project_scoped',
  'long_running_project_context',
] as const;

export type MemoryRetentionClass = (typeof MEMORY_RETENTION_CLASSES)[number];

/**
 * A project's durable narrative, the decisions and standing context a long
 * project accumulates, as opposed to an ordinary fact that merely happens to
 * have been stated inside it.
 */
const LONG_RUNNING_PROJECT_CATEGORIES = new Set(['context', 'decision', 'summary']);

export function memoryRetentionClass(write: {
  projectId?: string | null;
  category: string | null;
}): MemoryRetentionClass {
  if (!write.projectId) return 'account';
  const category = write.category?.trim().toLowerCase() ?? '';
  return LONG_RUNNING_PROJECT_CATEGORIES.has(category)
    ? 'long_running_project_context'
    : 'project_scoped';
}

export const MEMORY_INELIGIBILITY_REASONS = [
  'prohibited_content_category',
  'temporary_chat',
  'user_memory_disabled',
  'organization_memory_disabled',
  'source_class_cannot_generate_memory',
  'trust_mode_outside_managed_storage',
] as const;

export type MemoryIneligibilityReason = (typeof MEMORY_INELIGIBILITY_REASONS)[number];

export class MemoryIneligibleError extends Error {
  readonly reason: MemoryIneligibilityReason;

  constructor(reason: MemoryIneligibilityReason, message: string) {
    super(message);
    this.name = 'MemoryIneligibleError';
    this.reason = reason;
  }
}

export type MemoryEligibilityDecision =
  | { eligible: true; retentionClass: MemoryRetentionClass; expiresAt: string | null | undefined }
  | { eligible: false; reason: MemoryIneligibilityReason; message: string };

const DEFAULT_MEMORY_SOURCE_CLASS: ContextSourceClass = 'past_chat';

/**
 * What a write is refused for before anything is read: a credential or a
 * special-category fact is never storable, and a temporary turn never saves.
 */
export function memoryContentRefusal(
  write: ConsolidatedMemoryWrite,
): MemoryEligibilityDecision | null {
  const prohibited = prohibitedMemoryCategory(write.content);
  if (prohibited) {
    return {
      eligible: false,
      reason: 'prohibited_content_category',
      message: prohibitedMemoryMessage(prohibited),
    };
  }
  if (write.temporaryChat) {
    return {
      eligible: false,
      reason: 'temporary_chat',
      message: 'This is a temporary chat, so nothing from it is saved to Memory.',
    };
  }
  return null;
}

/**
 * The one place a fact is judged fit to enter managed memory, across all three
 * axes the product governs: who the workspace lets remember, what kind of
 * context the fact came from, and which trust boundary produced it.
 */
export function memoryEligibilityGate(input: {
  write: ConsolidatedMemoryWrite;
  organizationPolicy: OrganizationMemoryPolicy;
  userPolicy?: ManagedMemoryPolicy;
  nowMs?: number;
}): MemoryEligibilityDecision {
  const { write, organizationPolicy } = input;

  const refusedOnSight = memoryContentRefusal(write);
  if (refusedOnSight) return refusedOnSight;

  if (!organizationPolicy.allowMemory) {
    return {
      eligible: false,
      reason: 'organization_memory_disabled',
      message: 'This workspace has memory turned off for its members.',
    };
  }

  if (input.userPolicy && !input.userPolicy.enabled) {
    return {
      eligible: false,
      reason: 'user_memory_disabled',
      message: 'Memory is turned off in your settings, so I did not save that.',
    };
  }

  const sourceClass = write.sourceClass ?? DEFAULT_MEMORY_SOURCE_CLASS;
  if (!contextSourceClassPolicy(sourceClass).canGenerateMemory) {
    return {
      eligible: false,
      reason: 'source_class_cannot_generate_memory',
      message: `Content from ${sourceClass} cannot be turned into a memory.`,
    };
  }

  // The suite's trust boundary puts local work on local_device storage and BYOK
  // work on the user's own provider; user_memories is managed storage, so
  // neither may be persisted here.
  const trustMode = write.trustMode ?? 'managed';
  if (trustMode !== 'managed') {
    return {
      eligible: false,
      reason: 'trust_mode_outside_managed_storage',
      message: `A ${trustMode} turn keeps its content outside AGI-managed storage.`,
    };
  }

  return {
    eligible: true,
    retentionClass: memoryRetentionClass(write),
    expiresAt: clampMemoryExpiryToRetention(
      write.expiresAt,
      organizationPolicy,
      input.nowMs ?? Date.now(),
    ),
  };
}

/**
 * Retention is a recorded position until the workspace enforces it (migration
 * 0138), so an unenforced window never shortens a memory's life.
 */
export function clampMemoryExpiryToRetention(
  requested: string | null | undefined,
  policy: OrganizationMemoryPolicy,
  nowMs: number,
): string | null | undefined {
  if (!policy.retentionEnforced || policy.retentionDays === null) return requested;
  const ceilingMs = nowMs + policy.retentionDays * DAY_MS;
  if (requested === null || requested === undefined) return new Date(ceilingMs).toISOString();
  const requestedMs = Date.parse(requested);
  if (!Number.isFinite(requestedMs)) return new Date(ceilingMs).toISOString();
  return new Date(Math.min(requestedMs, ceilingMs)).toISOString();
}

function memoryWriteRank(write: ConsolidatedMemoryWrite): number {
  if (write.pinned) return 2;
  return write.source === AUTO_MEMORY_SOURCE ? 0 : 1;
}

const CONSOLIDATED_MEMORY_COLUMNS = (alias: string, outcome: string) =>
  `'${outcome}'::text as outcome, ${alias}.id::text as id, ${alias}.content, ${alias}.category,
   ${alias}.source, ${alias}.pinned, ${alias}.project_id::text as project_id, ${alias}.expires_at,
   ${alias}.superseded_by::text as superseded_by, ${alias}.created_at, ${alias}.updated_at`;

export interface MemoryWritePolicies {
  organization: OrganizationMemoryPolicy;
  user: ManagedMemoryPolicy;
}

/**
 * Both halves of the answer to "may this account remember anything here", read
 * once. A workspace with memory off settles it without a second query.
 */
export async function loadMemoryWritePolicies(
  db: ManagedMemoryContextDb,
  params: { userId: string; organizationId?: string | null },
): Promise<MemoryWritePolicies> {
  const organization = await loadOrganizationMemoryPolicy(db, params.organizationId);
  if (!organization.allowMemory) return { organization, user: DISABLED_MANAGED_MEMORY_POLICY };
  return { organization, user: await readUserMemoryCapabilities(db, params.userId) };
}

/**
 * The one admission decision for every path that puts new memory text in front
 * of the user, including the ones that write their own SQL. Callers that also
 * persist through `writeConsolidatedMemory` get it applied again there, which
 * costs a policy read and removes any way to skip it.
 */
export async function memoryWriteAdmission(
  db: ManagedMemoryContextDb,
  write: ConsolidatedMemoryWrite,
  options: { policies?: MemoryWritePolicies } = {},
): Promise<MemoryEligibilityDecision> {
  const refusedOnSight = memoryContentRefusal(write);
  if (refusedOnSight) return refusedOnSight;

  const policies =
    options.policies ??
    (await loadMemoryWritePolicies(db, {
      userId: write.userId,
      organizationId: write.organizationId ?? null,
    }));
  return memoryEligibilityGate({
    write,
    organizationPolicy: policies.organization,
    userPolicy: policies.user,
  });
}

export async function writeConsolidatedMemory(
  db: ManagedMemoryContextDb,
  write: ConsolidatedMemoryWrite,
  options: { policies?: MemoryWritePolicies } = {},
): Promise<ConsolidatedMemoryRow | null> {
  const decision = await memoryWriteAdmission(db, write, options);
  if (!decision.eligible) {
    logger.warn(
      { userId: write.userId, reason: decision.reason },
      '[managed-memory] write refused by the eligibility gate',
    );
    throw new MemoryIneligibleError(decision.reason, decision.message);
  }

  const topic = memoryConflictTopic(write.content);
  const topicPatterns = topic ? topic.prefixes.map((prefix) => `${prefix} %`) : [];
  const [row] = await db.query<ConsolidatedMemoryRow>(
    `with incoming as materialized (
       select coalesce($2::uuid, gen_random_uuid()) as id,
              $5::text as content,
              ${memoryContentKeySql('$5::text')} as content_key,
              $9::timestamptz as expires_at,
              $10::text[] as topic_patterns,
              $11::int as rank
     ), duplicate as materialized (
       select existing.id
         from user_memories as existing, incoming
        where existing.user_id = $1
          and ${activeMemoryPredicate('existing.')}
          and existing.project_id is not distinct from $3::uuid
          and ${workspaceMemoryPredicate(4, 'existing.')}
          and ${memoryContentKeySql('existing.content')} = incoming.content_key
        order by existing.pinned desc, existing.updated_at desc
        limit 1
     ), merged as (
       update user_memories as existing
          set pinned = existing.pinned or $8::boolean,
              expires_at = case
                when existing.expires_at is null or incoming.expires_at is null then null
                else greatest(existing.expires_at, incoming.expires_at)
              end,
              updated_at = now()
         from duplicate, incoming
        where existing.user_id = $1 and existing.id = duplicate.id
       returning ${CONSOLIDATED_MEMORY_COLUMNS('existing', 'merged')}
     ), rivals as materialized (
       select existing.id, ${memoryRankSql('existing.')} as rank, existing.updated_at
         from user_memories as existing, incoming
        where not exists (select 1 from duplicate)
          and cardinality(incoming.topic_patterns) > 0
          and existing.user_id = $1
          and existing.id <> incoming.id
          and ${activeMemoryPredicate('existing.')}
          and existing.project_id is not distinct from $3::uuid
          and ${workspaceMemoryPredicate(4, 'existing.')}
          and ${memoryContentKeySql('existing.content')} like any(incoming.topic_patterns)
     ), keeper as materialized (
       select rivals.id
         from rivals, incoming
        where rivals.rank > incoming.rank
        order by rivals.rank desc, rivals.updated_at desc
        limit 1
     ), inserted as (
       insert into user_memories as stored
         (id, user_id, content, category, source, pinned, project_id, organization_id,
          expires_at, superseded_by, superseded_at,
          source_conversation_id, source_turn_id, provenance)
       select incoming.id, $1, incoming.content, $6, $7, $8::boolean, $3::uuid, $4::uuid,
              incoming.expires_at,
              (select keeper.id from keeper),
              case when exists (select 1 from keeper) then now() end,
              $12::uuid, $13::text, $14::jsonb
         from incoming
        where not exists (select 1 from duplicate)
       on conflict (user_id, id) do update
          set content = excluded.content,
              category = excluded.category,
              source = excluded.source,
              pinned = stored.pinned or excluded.pinned,
              expires_at = excluded.expires_at,
              superseded_by = excluded.superseded_by,
              superseded_at = excluded.superseded_at,
              source_conversation_id = excluded.source_conversation_id,
              source_turn_id = excluded.source_turn_id,
              provenance = excluded.provenance,
              updated_at = now()
        where stored.is_deleted = false
          and (stored.superseded_by is not null
               or (stored.expires_at is not null and stored.expires_at <= now()))
          and stored.project_id is not distinct from excluded.project_id
          and stored.organization_id is not distinct from excluded.organization_id
       returning ${CONSOLIDATED_MEMORY_COLUMNS('stored', 'inserted')}
     ), superseded as (
       update user_memories as existing
          set superseded_by = inserted.id::uuid, superseded_at = now(), updated_at = now()
         from inserted, rivals
        where inserted.superseded_by is null
          and existing.user_id = $1
          and existing.id = rivals.id
       returning existing.id::text as id
     )
     select written.*,
            coalesce((select array_agg(superseded.id) from superseded), array[]::text[])
              as superseded_ids
       from (select * from merged union all select * from inserted) as written`,
    [
      write.userId,
      write.id ?? null,
      write.projectId ?? null,
      write.organizationId ?? null,
      write.content,
      write.category,
      write.source,
      write.pinned === true,
      decision.expiresAt ?? null,
      topicPatterns,
      memoryWriteRank(write),
      write.sourceConversationId ?? null,
      write.sourceTurnId ?? null,
      JSON.stringify(memoryWriteProvenance(write) ?? {}),
    ],
  );
  return row ?? null;
}

export interface ExpiredMemorySweep {
  expired: number;
  remaining: boolean;
}

export async function sweepExpiredMemories(
  db: ManagedMemoryContextDb,
  options: { batchSize?: number; maxBatches?: number; budgetMs?: number } = {},
): Promise<ExpiredMemorySweep> {
  const batchSize = options.batchSize ?? 500;
  const maxBatches = options.maxBatches ?? 200;
  const budgetMs = options.budgetMs ?? 240_000;
  const startedAtMs = Date.now();
  let expired = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    if (Date.now() - startedAtMs > budgetMs) return { expired, remaining: true };
    const [row] = await db.query<{ count: number }>(
      `with due as (
         select user_id, id
           from user_memories
          where is_deleted = false
            and expires_at is not null
            and expires_at <= now()
          order by expires_at
          limit $1
       ), expired as (
         update user_memories as memory
            set is_deleted = true, content = '', category = null, updated_at = now()
           from due
          where memory.user_id = due.user_id and memory.id = due.id
         returning memory.id
       )
       select count(*)::int as count from expired`,
      [batchSize],
    );
    const count = row?.count ?? 0;
    expired += count;
    if (count < batchSize) return { expired, remaining: false };
  }
  return { expired, remaining: true };
}

function scopePredicate(scope: MemoryScope, projectParamIndex: number): string {
  if (!scope.projectId) return 'and project_id is null';
  if (!scope.usesGlobalMemory) return `and project_id = $${projectParamIndex}::uuid`;
  return `and (project_id is null or project_id = $${projectParamIndex}::uuid)`;
}

export async function loadManagedMemoryContext(
  db: ManagedMemoryContextDb,
  params: {
    userId: string;
    organizationId?: string | null;
    suppressedSources?: readonly MemorySource[];
    scope?: MemoryScope;
    policy?: ManagedMemoryPolicy;
  },
): Promise<ManagedMemoryContextSource[]> {
  return withSpan(
    'memory.context.load',
    { domain: 'retrieval', attributes: { 'retrieval.source': 'user_memories' } },
    async (span) => {
      // The contract: turning memory off stops the product READING existing
      // memories, not only writing new ones. A caller holding the policy hands
      // it in and gets that enforced here rather than at its own call site.
      if (params.policy && !params.policy.enabled) {
        span.setAttributes({ 'retrieval.result_count': 0, 'retrieval.skipped': 'memory_disabled' });
        return [];
      }

      const scope = params.scope ?? GLOBAL_MEMORY_SCOPE;
      const suppressed = normalizeSuppressedMemorySources(params.suppressedSources ?? []);

      const values: unknown[] = [params.userId];
      const sourceFilter = suppressed.length
        ? `and coalesce(source, 'web') <> all($${values.push(suppressed)}::text[])`
        : '';
      const projectFilter = scopePredicate(
        scope,
        scope.projectId ? values.push(scope.projectId) : 0,
      );
      const workspaceFilter = workspaceMemoryPredicate(values.push(params.organizationId ?? null));

      const rows = await db.query<{
        id: string;
        content: string;
        category: string | null;
        pinned: boolean;
        updated_at: string | Date | null;
      }>(
        `select id,
            content,
            category,
            coalesce((to_jsonb(user_memories)->>'pinned')::boolean, false) as pinned,
            updated_at
       from user_memories
      where user_id = $1 and ${activeMemoryPredicate()} ${sourceFilter} ${projectFilter}
        and ${workspaceFilter}
      order by pinned desc, updated_at desc
      limit ${MAX_MEMORIES}`,
        values,
      );

      span.setAttributes({
        'retrieval.result_count': rows.length,
        'retrieval.scope': scope.projectId
          ? scope.usesGlobalMemory
            ? 'project+global'
            : 'project-only'
          : 'global',
      });
      return rows.map((row) => ({
        content: row.content,
        category: row.category,
        pinned: row.pinned,
        source: contextSource({
          sourceClass: 'account_memory',
          locator: `user_memories/${row.id}`,
          recordId: row.id,
          ownerUserId: params.userId,
          organizationId: params.organizationId ?? null,
          projectId: scope.projectId,
          capturedAt: isoTimestamp(row.updated_at),
        }),
      }));
    },
  );
}

export interface ManagedMemoryContextLoader extends ContextSourceLoader {
  itemFor(sourceId: string): ManagedMemoryContextItem | undefined;
}

/**
 * Memory as one source the Context Resolution Engine resolves, rather than a
 * call each surface makes for itself. The engine applies the permission, policy
 * and budget checks; this only produces candidates.
 */
export function managedMemoryContextLoader(
  db: ManagedMemoryContextDb,
  params: {
    userId: string;
    organizationId?: string | null;
    suppressedSources?: readonly MemorySource[];
    scope?: MemoryScope;
    policy?: ManagedMemoryPolicy;
  },
): ManagedMemoryContextLoader {
  const items = new Map<string, ManagedMemoryContextItem>();
  return {
    sourceClass: 'account_memory',
    budgetChars: MAX_TOTAL_MEMORY_CHARS,
    async load(): Promise<ContextCandidate[]> {
      items.clear();
      const loaded = await loadManagedMemoryContext(db, params);
      return loaded.map((memory) => {
        items.set(memory.source.id, {
          content: memory.content,
          category: memory.category,
          pinned: memory.pinned,
        });
        return { source: memory.source, text: memory.content };
      });
    },
    itemFor: (sourceId) => items.get(sourceId),
  };
}

/**
 * Reads a project's memory posture. A project that cannot be read falls back to
 * global-only rather than to the project's memories: guessing "this project
 * exists" would surface rows the caller may not be entitled to.
 */
export async function loadProjectMemoryScope(
  db: ManagedMemoryContextDb,
  params: { userId: string; projectId: string | null },
): Promise<MemoryScope> {
  if (!params.projectId) return GLOBAL_MEMORY_SCOPE;
  const [row] = await db.query<{ uses_global_memory: boolean }>(
    `select coalesce((to_jsonb(user_projects)->>'uses_global_memory')::boolean, true)
              as uses_global_memory
       from user_projects
      where id = $1::uuid and user_id = $2 and deleted_at is null
      limit 1`,
    [params.projectId, params.userId],
  );
  if (!row) return GLOBAL_MEMORY_SCOPE;
  return { projectId: params.projectId, usesGlobalMemory: row.uses_global_memory !== false };
}

export function formatManagedMemorySystemPrompt(
  memories: readonly ManagedMemoryContextItem[],
): string | null {
  let remainingChars = MAX_TOTAL_MEMORY_CHARS;
  const bounded: Array<{ category: string | null; content: string }> = [];

  for (const memory of memories.slice(0, MAX_MEMORIES)) {
    const content = memory.content.trim();
    if (!content || remainingChars <= 0) continue;

    const boundedContent = truncate(content, Math.min(MAX_MEMORY_CHARS, remainingChars));
    bounded.push({
      category: memory.category?.trim() || null,
      content: boundedContent,
    });
    remainingChars -= boundedContent.length;
  }

  if (bounded.length === 0) return null;

  return fenceUntrustedMemoryContent(JSON.stringify(bounded), contextFenceTag('account_memory'));
}

export function applyManagedMemoryContext(
  chatRequest: ChatCompletionRequest,
  prompt: string,
): void {
  chatRequest.messages.unshift({ role: 'system', content: prompt });
}

// Idempotency only, and only within one account: migration 0189 made the row
// key (user_id, id), so this value collides with nothing another tenant holds.
// It exists so two concurrent turns extracting the same fact insert one row,
// which the not-exists check below cannot guarantee on its own.
function deterministicAutoMemoryId(userId: string, normalizedKey: string): string {
  const hex = createHash('sha256')
    .update(`agi-managed-auto-memory-v1\0${userId}\0${normalizedKey}`)
    .digest('hex')
    .slice(0, 32);
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const uuidHex = `${hex.slice(0, 12)}5${hex.slice(13, 16)}${variant}${hex.slice(17)}`;
  return `${uuidHex.slice(0, 8)}-${uuidHex.slice(8, 12)}-${uuidHex.slice(12, 16)}-${uuidHex.slice(16, 20)}-${uuidHex.slice(20)}`;
}

export interface ManagedAutoMemoryResult {
  extracted: number;
  inserted: number;
  excluded: number;
}

// organization_id is written explicitly: the durable settle runs on an unscoped adapter where the column default is NULL.
export async function persistManagedAutoMemoryFacts(
  db: ManagedMemoryContextDb,
  params: {
    userId: string;
    candidates: readonly string[];
    projectId?: string | null;
    organizationId?: string | null;
    sourceClass?: ContextSourceClass;
    trustMode?: PrivacyMode;
    sourceConversationId?: string | null;
    sourceTurnId?: string | null;
    agentId?: string | null;
    temporaryChat?: boolean;
  },
): Promise<ManagedAutoMemoryResult> {
  const extracted = params.candidates.length;
  if (extracted === 0) return { extracted: 0, inserted: 0, excluded: 0 };

  const [row] = await db.query<{ memory: unknown }>(
    `select coalesce(settings -> 'memory', '{}'::jsonb) as memory
       from user_settings
      where user_id = $1
      limit 1`,
    [params.userId],
  );
  const memorySettings =
    row?.memory && typeof row.memory === 'object' && !Array.isArray(row.memory)
      ? (row.memory as Record<string, unknown>)
      : {};
  const exclusions = normalizeMemoryExclusions(memorySettings['excludedTerms']);
  if (
    normalizeSuppressedMemorySources(memorySettings['suppressedSources']).includes(
      AUTO_MEMORY_SOURCE,
    )
  ) {
    return { extracted, inserted: 0, excluded: extracted };
  }

  const seen = new Set<string>();
  const batch: Array<{ id: string; content: string; category: string }> = [];
  let excluded = 0;
  for (const candidate of params.candidates) {
    const consolidationKey = memoryConsolidationKey(candidate);
    if (!consolidationKey || seen.has(consolidationKey)) continue;
    seen.add(consolidationKey);
    const content = candidate.trim();
    if (isMemoryExcluded(content, exclusions)) {
      excluded += 1;
      continue;
    }
    const scopeSeed = params.organizationId
      ? `${params.organizationId}::${params.projectId ?? ''}`
      : (params.projectId ?? '');
    batch.push({
      id: deterministicAutoMemoryId(params.userId, `${scopeSeed}::${consolidationKey}`),
      content,
      category: classifyMemoryCategory(content),
    });
    if (batch.length >= MAX_AUTO_MEMORIES_PER_TURN) break;
  }
  if (batch.length === 0) return { extracted, inserted: 0, excluded };

  const policies = await loadMemoryWritePolicies(db, {
    userId: params.userId,
    organizationId: params.organizationId ?? null,
  });
  let inserted = 0;
  for (const item of batch) {
    try {
      const row = await writeConsolidatedMemory(
        db,
        {
          userId: params.userId,
          id: item.id,
          content: item.content,
          category: item.category,
          source: AUTO_MEMORY_SOURCE,
          projectId: params.projectId ?? null,
          organizationId: params.organizationId ?? null,
          sourceClass: params.sourceClass ?? DEFAULT_MEMORY_SOURCE_CLASS,
          trustMode: params.trustMode ?? 'managed',
          sourceConversationId: params.sourceConversationId ?? null,
          sourceTurnId: params.sourceTurnId ?? null,
          agentId: params.agentId ?? null,
          temporaryChat: params.temporaryChat === true,
        },
        { policies },
      );
      if (row && row.outcome !== 'merged') inserted += 1;
    } catch (error) {
      if (!(error instanceof MemoryIneligibleError)) throw error;
      excluded += 1;
    }
  }

  return { extracted, inserted, excluded };
}
