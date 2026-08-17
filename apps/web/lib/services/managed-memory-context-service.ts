import { createHash } from 'node:crypto';
import { classifyMemoryCategory, normalizeMemoryKey } from '@agiworkforce/agent-core';
import { fenceUntrustedMemoryContent } from '@agiworkforce/utils';
import { withSpan } from '@/lib/observability/span';
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
    generateFromHistory:
      capabilities['memory'] === true && capabilities['generateFromHistory'] !== false,
    allowToolAssistedGeneration: capabilities['allowToolAssistedGeneration'] === true,
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

export function isMemoryExcluded(content: string, exclusions: readonly string[]): boolean {
  if (exclusions.length === 0) return false;
  const haystack = content.toLowerCase();
  return exclusions.some((term) => haystack.includes(term));
}

export async function loadManagedMemoryContext(
  db: ManagedMemoryContextDb,
  params: { userId: string; suppressedSources?: readonly MemorySource[] },
): Promise<ManagedMemoryContextItem[]> {
  return withSpan(
    'memory.context.load',
    { domain: 'retrieval', attributes: { 'retrieval.source': 'user_memories' } },
    async (span) => {
      const suppressed = normalizeSuppressedMemorySources(params.suppressedSources ?? []);
      const sourceFilter = suppressed.length
        ? "and coalesce(source, 'web') <> all($2::text[])"
        : '';
      const rows = await db.query<{
        content: string;
        category: string | null;
        pinned: boolean;
      }>(
        `select content,
            category,
            coalesce((to_jsonb(user_memories)->>'pinned')::boolean, false) as pinned
       from user_memories
      where user_id = $1 and is_deleted = false ${sourceFilter}
      order by pinned desc, updated_at desc
      limit ${MAX_MEMORIES}`,
        suppressed.length ? [params.userId, suppressed] : [params.userId],
      );

      span.setAttributes({ 'retrieval.result_count': rows.length });
      return rows;
    },
  );
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

  return fenceUntrustedMemoryContent(JSON.stringify(bounded), 'account_memories');
}

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
  excluded: number;
}

export async function persistManagedAutoMemoryFacts(
  db: ManagedMemoryContextDb,
  params: { userId: string; candidates: readonly string[] },
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
