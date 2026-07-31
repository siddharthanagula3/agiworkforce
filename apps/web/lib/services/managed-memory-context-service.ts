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
  if (extracted === 0) return { extracted: 0, inserted: 0 };

  const seen = new Set<string>();
  const batch: Array<{
    id: string;
    content: string;
    category: string;
    normalizedKey: string;
  }> = [];
  for (const candidate of params.candidates) {
    const normalizedKey = normalizeMemoryKey(candidate);
    if (!normalizedKey || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    const content = candidate.trim();
    batch.push({
      id: deterministicAutoMemoryId(params.userId, normalizedKey),
      content,
      category: classifyMemoryCategory(content),
      normalizedKey,
    });
    if (batch.length >= MAX_AUTO_MEMORIES_PER_TURN) break;
  }
  if (batch.length === 0) return { extracted, inserted: 0 };

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

  return { extracted, inserted: inserted.length };
}
