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
function scopePredicate(scope: MemoryScope, projectParamIndex: number): string {
  if (!scope.projectId) return 'and project_id is null';
  if (!scope.usesGlobalMemory) return `and project_id = $${projectParamIndex}::uuid`;
  return `and (project_id is null or project_id = $${projectParamIndex}::uuid)`;
}

export async function loadManagedMemoryContext(
  db: ManagedMemoryContextDb,
  params: {
    userId: string;
    suppressedSources?: readonly MemorySource[];
    scope?: MemoryScope;
  },
): Promise<ManagedMemoryContextItem[]> {
  return withSpan(
    'memory.context.load',
    { domain: 'retrieval', attributes: { 'retrieval.source': 'user_memories' } },
    async (span) => {
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

      const rows = await db.query<{
        content: string;
        category: string | null;
        pinned: boolean;
      }>(
        `select content,
            category,
            coalesce((to_jsonb(user_memories)->>'pinned')::boolean, false) as pinned
       from user_memories
      where user_id = $1 and is_deleted = false ${sourceFilter} ${projectFilter}
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
      return rows;
    },
  );
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
      where id = $1::uuid and user_id = $2
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

  return fenceUntrustedMemoryContent(JSON.stringify(bounded), 'account_memories');
}

export function applyManagedMemoryContext(
  chatRequest: ChatCompletionRequest,
  prompt: string,
): void {
  chatRequest.messages.unshift({ role: 'system', content: prompt });
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
  params: { userId: string; candidates: readonly string[]; projectId?: string | null },
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
      id: deterministicAutoMemoryId(params.userId, `${params.projectId ?? ''}::${normalizedKey}`),
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
     insert into user_memories (id, user_id, content, category, source, project_id)
     select incoming.id::uuid, $1, incoming.content, incoming.category, 'auto', $3::uuid
       from incoming
      where not exists (
        select 1
          from user_memories as existing
         where existing.user_id = $1
           and existing.is_deleted = false
           and existing.project_id is not distinct from $3::uuid
           and lower(regexp_replace(btrim(existing.content), '\\s+', ' ', 'g')) =
               incoming.normalized_key
      )
     on conflict (id) do nothing
     returning id::text`,
    [params.userId, JSON.stringify(batch), params.projectId ?? null],
  );

  return { extracted, inserted: inserted.length, excluded };
}
