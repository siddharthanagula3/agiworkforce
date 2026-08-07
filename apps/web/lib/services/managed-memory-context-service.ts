/**
 * Server-owned account-memory context for Managed Cloud chat.
 *
 * The completion route owns the policy of whether memory is allowed for a
 * turn (notably, Temporary Chats opt out). This service only owns the reusable
 * owner-scoped loading, prompt bounding, and request-merging mechanics.
 */

import { createHash } from 'node:crypto';
import { classifyMemoryCategory, normalizeMemoryKey } from '@agiworkforce/agent-core';
import { fenceUntrustedMemoryContent } from '@agiworkforce/utils';
import type { ChatCompletionRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';

export interface ManagedMemoryContextDb {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface ManagedMemoryContextItem {
  content: string;
  category: string | null;
  pinned: boolean;
}

export interface ManagedMemoryPolicy {
  enabled: boolean;
  generateFromHistory: boolean;
  allowToolAssistedGeneration: boolean;
}

export const DISABLED_MANAGED_MEMORY_POLICY: ManagedMemoryPolicy = {
  enabled: false,
  generateFromHistory: false,
  allowToolAssistedGeneration: false,
};

const MAX_MEMORIES = 30;
const MAX_MEMORY_CHARS = 1_000;
const MAX_TOTAL_MEMORY_CHARS = 8_000;
const MAX_AUTO_MEMORIES_PER_TURN = 5;

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 1))}…` : value;
}

/**
 * Read the same account-scoped `capabilities` namespace written by Web and
 * synchronized to Desktop Managed Cloud. Missing, malformed, or absent values
 * are disabled so a settings outage can never disclose memory to a prompt.
 */
export async function loadManagedMemoryPolicy(
  db: ManagedMemoryContextDb,
  params: { userId: string },
): Promise<ManagedMemoryPolicy> {
  const [row] = await db.query<{ capabilities: unknown }>(
    `select coalesce(settings -> 'capabilities', '{}'::jsonb) as capabilities
       from user_settings
      where user_id = $1
      limit 1`,
    [params.userId],
  );
  const capabilities =
    row?.capabilities && typeof row.capabilities === 'object' && !Array.isArray(row.capabilities)
      ? (row.capabilities as Record<string, unknown>)
      : {};
  return {
    enabled: capabilities['memory'] === true,
    // Preserve the pre-toggle behavior for accounts that opted into Memory
    // before this key existed. An explicit false is the only off value.
    generateFromHistory:
      capabilities['memory'] === true && capabilities['generateFromHistory'] !== false,
    allowToolAssistedGeneration: capabilities['allowToolAssistedGeneration'] === true,
  };
}

/** Upper bound on stored exclusion terms — a settings list, not a rules engine. */
export const MAX_MEMORY_EXCLUSIONS = 50;
/** Terms shorter than this match almost everything and would disable memory wholesale. */
export const MIN_MEMORY_EXCLUSION_LENGTH = 3;

/**
 * Normalize an exclusion list from stored settings.
 *
 * Deliberately plain case-insensitive SUBSTRINGS, not regexes: a user-supplied
 * regex is both a footgun (a stray `.*` silently excludes everything) and a
 * ReDoS surface on a server-side path that runs per chat turn.
 *
 * Anything unusable is dropped rather than rejected — this runs on the write
 * path, and a malformed settings blob must not stop the filter applying to the
 * terms that ARE valid.
 */
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

/**
 * Terms this account has asked never to be remembered.
 *
 * Read from the same `user_settings` row as the memory policy. Absent or
 * malformed settings yield an empty list: an exclusion that fails open is a
 * privacy claim the product does not honor, so this is paired with a write-path
 * filter that runs on every candidate, NOT with client-side filtering.
 */
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

/** True when `content` contains any excluded term (case-insensitive). */
export function isMemoryExcluded(content: string, exclusions: readonly string[]): boolean {
  if (exclusions.length === 0) return false;
  const haystack = content.toLowerCase();
  return exclusions.some((term) => haystack.includes(term));
}

/** Load bounded, active account memories through an owner-scoped DB handle. */
export async function loadManagedMemoryContext(
  db: ManagedMemoryContextDb,
  params: { userId: string },
): Promise<ManagedMemoryContextItem[]> {
  const rows = await db.query<{
    content: string;
    category: string | null;
    pinned: boolean;
  }>(
    `select content,
            category,
            coalesce((to_jsonb(user_memories)->>'pinned')::boolean, false) as pinned
       from user_memories
      where user_id = $1 and is_deleted = false
      order by pinned desc, updated_at desc
      limit ${MAX_MEMORIES}`,
    [params.userId],
  );

  return rows;
}

/**
 * Render memory facts as serialized, explicitly untrusted data. The model may
 * use relevant facts but cannot treat text saved in memory as higher-priority
 * instructions.
 */
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

  return fenceUntrustedMemoryContent(JSON.stringify(bounded), 'account_memories');
}

/** Merge the bounded memory block into the request's leading system context. */
export function applyManagedMemoryContext(
  chatRequest: ChatCompletionRequest,
  prompt: string,
): void {
  const firstMessage = chatRequest.messages[0];
  if (firstMessage?.role === 'system' && typeof firstMessage.content === 'string') {
    firstMessage.content = `${prompt}\n\n${firstMessage.content}`;
  } else {
    chatRequest.messages.unshift({ role: 'system', content: prompt });
  }
}

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
  /** Candidates dropped by the account's sensitive-data exclusions. */
  excluded: number;
}

/**
 * Persist already-extracted facts in one bounded, idempotent statement.
 * Deterministic UUIDs prevent concurrent/retried auto turns from duplicating
 * one fact; the normalized owner-scoped NOT EXISTS check also reuses an
 * equivalent memory the user previously saved by hand.
 */
export async function persistManagedAutoMemoryFacts(
  db: ManagedMemoryContextDb,
  params: { userId: string; candidates: readonly string[] },
): Promise<ManagedAutoMemoryResult> {
  const extracted = params.candidates.length;
  if (extracted === 0) return { extracted: 0, inserted: 0, excluded: 0 };

  // Sensitive-data exclusions are enforced HERE, on the write path, before any
  // candidate reaches the table. Filtering in the UI would leave the fact
  // stored and merely hidden, which is the false-privacy-claim shape: the user
  // is told it was excluded while it sits in the database and keeps being fed
  // to the model. `excluded` is reported so the caller can log the drop.
  const exclusions = await loadMemoryExclusions(db, { userId: params.userId });

  const seen = new Set<string>();
  const batch: Array<{
    id: string;
    content: string;
    category: string;
    normalizedKey: string;
  }> = [];
  let excluded = 0;
  for (const candidate of params.candidates) {
    const normalizedKey = normalizeMemoryKey(candidate);
    if (!normalizedKey || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    const content = candidate.trim();
    if (isMemoryExcluded(content, exclusions)) {
      excluded += 1;
      continue;
    }
    batch.push({
      id: deterministicAutoMemoryId(params.userId, normalizedKey),
      content,
      category: classifyMemoryCategory(content),
      normalizedKey,
    });
    if (batch.length >= MAX_AUTO_MEMORIES_PER_TURN) break;
  }
  if (batch.length === 0) return { extracted, inserted: 0, excluded };

  const inserted = await db.query<{ id: string }>(
    `with incoming as materialized (
       select item ->> 'id' as id,
              item ->> 'content' as content,
              item ->> 'category' as category,
              item ->> 'normalizedKey' as normalized_key
         from jsonb_array_elements($2::jsonb) as source(item)
     )
     insert into user_memories (id, user_id, content, category, source)
     select incoming.id::uuid, $1, incoming.content, incoming.category, 'auto'
       from incoming
      where not exists (
        select 1
          from user_memories as existing
         where existing.user_id = $1
           and existing.is_deleted = false
           and lower(regexp_replace(btrim(existing.content), '\\s+', ' ', 'g')) =
               incoming.normalized_key
      )
     on conflict (id) do nothing
     returning id::text`,
    [params.userId, JSON.stringify(batch)],
  );

  return { extracted, inserted: inserted.length, excluded };
}
