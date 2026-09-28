export const MANAGED_MEMORY_MAX_CONTENT_CHARS = 10_000;
export const MANAGED_MEMORY_MAX_CATEGORY_CHARS = 200;
export const MANAGED_MEMORY_MAX_PAGE_SIZE = 100;
export const MANAGED_MEMORY_COMMAND_MAX_CHARS = 4_000;
export const MANAGED_MEMORY_SEARCH_MAX_QUERY_CHARS = 500;

export const MANAGED_MEMORY_SOURCES = ['web', 'mobile', 'desktop', 'auto'] as const;
export type ManagedMemorySource = (typeof MANAGED_MEMORY_SOURCES)[number];

export function isManagedMemorySource(value: unknown): value is ManagedMemorySource {
  return typeof value === 'string' && (MANAGED_MEMORY_SOURCES as readonly string[]).includes(value);
}

export interface ManagedMemoryRecord {
  id: string;
  content: string;
  category: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  projectId?: string | null;
  projectName?: string | null;
  sourceConversationId?: string | null;
  sourceConversationTitle?: string | null;
  expiresAt?: string | null;
  supersededBy?: string | null;
}

export interface ManagedMemoryListResponse {
  memories: ManagedMemoryRecord[];
  hasMore: boolean;
}

export interface ManagedMemoryItemResponse {
  memory: ManagedMemoryRecord;
}

export interface ManagedMemoryWriteResponse {
  memory: ManagedMemoryRecord;
  merged: boolean;
  supersededIds: string[];
  supersededBy: string | null;
}

export interface ManagedMemoryDeleteResponse {
  success: true;
}

export interface ManagedMemoryDeleteAllResponse {
  deleted: number;
}

export interface ManagedMemoryRestoreResponse {
  restoredId: string;
  replacedId: string;
}

export interface ManagedMemorySearchResponse {
  memories: ManagedMemoryRecord[];
  query: string;
}

export interface ManagedMemoryConflict {
  id: string;
  content: string;
  replacedAt: string | null;
  kept: { id: string; content: string; pinned: boolean; source: string | null };
}

export interface ManagedMemoryConflictsResponse {
  conflicts: ManagedMemoryConflict[];
}

export interface ManagedMemoryCreateRequest {
  content: string;
  category?: string | null;
  source?: ManagedMemorySource;
  pinned?: boolean;
  expiresAt?: string | null;
  projectId?: string | null;
}

export interface ManagedMemoryUpdateRequest {
  content?: string;
  pinned?: boolean;
  expiresAt?: string | null;
}

export const MANAGED_MEMORY_COMMAND_STATUSES = [
  'stored',
  'already_known',
  'refused',
  'forgotten',
  'nothing_to_forget',
  'confirmation_required',
] as const;
export type ManagedMemoryCommandStatus = (typeof MANAGED_MEMORY_COMMAND_STATUSES)[number];

export interface ManagedMemoryCommandRequest {
  message: string;
  confirmed?: boolean;
  projectId?: string | null;
  conversationId?: string | null;
}

export interface ManagedMemoryCommandMatch {
  id: string;
  content: string;
}

export interface ManagedMemoryCommandResponse {
  command: { kind: 'remember' | 'forget'; subject: string } | null;
  status?: ManagedMemoryCommandStatus;
  message?: string;
  requiresConfirmation?: boolean;
  memories?: ManagedMemoryCommandMatch[];
}

export interface ManagedMemoryImportRequest {
  mode: 'dry-run' | 'commit';
  text?: string;
  items?: string[];
  sourceName?: string;
}

export interface ManagedMemoryImportPreviewItem {
  content: string;
  normalizedKey: string;
  duplicate: boolean;
}

export interface ManagedMemoryImportPreviewResponse {
  mode: 'dry-run';
  sourceName: string;
  sourceValue: string;
  format: 'json' | 'text';
  items: ManagedMemoryImportPreviewItem[];
  totalCandidates: number;
  itemsTruncated: boolean;
}

export interface ManagedMemoryImportCommitResponse {
  mode: 'commit';
  sourceName: string;
  sourceValue: string;
  insertedCount: number;
  skippedDuplicateCount: number;
  blockedCount: number;
  excludedCount: number;
  memories: ManagedMemoryRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function countOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function optionalField<K extends keyof ManagedMemoryRecord>(
  key: K,
  value: unknown,
  accepts: (candidate: unknown) => boolean,
): Partial<ManagedMemoryRecord> {
  return accepts(value) ? ({ [key]: value } as Partial<ManagedMemoryRecord>) : {};
}

const isNullableString = (value: unknown): boolean => value === null || typeof value === 'string';

export function parseManagedMemoryRecord(value: unknown): ManagedMemoryRecord | null {
  if (!isRecord(value)) return null;
  const { id, content, createdAt, updatedAt } = value;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof content !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof updatedAt !== 'string'
  ) {
    return null;
  }
  return {
    id,
    content,
    category: stringOrNull(value['category']),
    source: stringOrNull(value['source']),
    createdAt,
    updatedAt,
    ...optionalField('pinned', value['pinned'], (candidate) => typeof candidate === 'boolean'),
    ...optionalField('projectId', value['projectId'], isNullableString),
    ...optionalField('projectName', value['projectName'], isNullableString),
    ...optionalField('sourceConversationId', value['sourceConversationId'], isNullableString),
    ...optionalField('sourceConversationTitle', value['sourceConversationTitle'], isNullableString),
    ...optionalField('expiresAt', value['expiresAt'], isNullableString),
    ...optionalField('supersededBy', value['supersededBy'], isNullableString),
  };
}

function parseRecords(value: unknown): ManagedMemoryRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = parseManagedMemoryRecord(entry);
    return record ? [record] : [];
  });
}

export function parseManagedMemoryListResponse(value: unknown): ManagedMemoryListResponse | null {
  if (!isRecord(value) || !Array.isArray(value['memories'])) return null;
  return { memories: parseRecords(value['memories']), hasMore: value['hasMore'] === true };
}

export function parseManagedMemoryItemResponse(value: unknown): ManagedMemoryItemResponse | null {
  if (!isRecord(value)) return null;
  const memory = parseManagedMemoryRecord(value['memory']);
  return memory ? { memory } : null;
}

export function parseManagedMemoryWriteResponse(value: unknown): ManagedMemoryWriteResponse | null {
  if (!isRecord(value)) return null;
  const memory = parseManagedMemoryRecord(value['memory']);
  if (!memory) return null;
  const supersededIds = Array.isArray(value['supersededIds'])
    ? value['supersededIds'].filter((id): id is string => typeof id === 'string')
    : [];
  return {
    memory,
    merged: value['merged'] === true,
    supersededIds,
    supersededBy: stringOrNull(value['supersededBy']),
  };
}

export function parseManagedMemoryRestoreResponse(
  value: unknown,
): ManagedMemoryRestoreResponse | null {
  if (!isRecord(value)) return null;
  const { restoredId, replacedId } = value;
  return typeof restoredId === 'string' && typeof replacedId === 'string'
    ? { restoredId, replacedId }
    : null;
}

export function parseManagedMemoryConflictsResponse(
  value: unknown,
): ManagedMemoryConflictsResponse | null {
  if (!isRecord(value) || !Array.isArray(value['conflicts'])) return null;
  return {
    conflicts: value['conflicts'].flatMap((entry) => {
      if (!isRecord(entry) || !isRecord(entry['kept'])) return [];
      const { id, content } = entry;
      const kept = entry['kept'];
      if (
        typeof id !== 'string' ||
        typeof content !== 'string' ||
        typeof kept['id'] !== 'string' ||
        typeof kept['content'] !== 'string'
      ) {
        return [];
      }
      return [
        {
          id,
          content,
          replacedAt: stringOrNull(entry['replacedAt']),
          kept: {
            id: kept['id'],
            content: kept['content'],
            pinned: kept['pinned'] === true,
            source: stringOrNull(kept['source']),
          },
        },
      ];
    }),
  };
}

function isCommandStatus(value: unknown): value is ManagedMemoryCommandStatus {
  return (
    typeof value === 'string' &&
    (MANAGED_MEMORY_COMMAND_STATUSES as readonly string[]).includes(value)
  );
}

export function parseManagedMemoryCommandResponse(
  value: unknown,
): ManagedMemoryCommandResponse | null {
  if (!isRecord(value) || !('command' in value)) return null;
  const rawCommand = value['command'];
  if (rawCommand === null) return { command: null };
  if (
    !isRecord(rawCommand) ||
    (rawCommand['kind'] !== 'remember' && rawCommand['kind'] !== 'forget') ||
    typeof rawCommand['subject'] !== 'string'
  ) {
    return null;
  }
  const memories = Array.isArray(value['memories'])
    ? value['memories'].flatMap((entry) =>
        isRecord(entry) && typeof entry['id'] === 'string' && typeof entry['content'] === 'string'
          ? [{ id: entry['id'], content: entry['content'] }]
          : [],
      )
    : undefined;
  return {
    command: { kind: rawCommand['kind'], subject: rawCommand['subject'] },
    ...(isCommandStatus(value['status']) ? { status: value['status'] } : {}),
    ...(typeof value['message'] === 'string' ? { message: value['message'] } : {}),
    ...(typeof value['requiresConfirmation'] === 'boolean'
      ? { requiresConfirmation: value['requiresConfirmation'] }
      : {}),
    ...(memories ? { memories } : {}),
  };
}

export function parseManagedMemoryImportPreviewResponse(
  value: unknown,
): ManagedMemoryImportPreviewResponse | null {
  if (!isRecord(value) || value['mode'] !== 'dry-run' || !Array.isArray(value['items'])) {
    return null;
  }
  return {
    mode: 'dry-run',
    sourceName: typeof value['sourceName'] === 'string' ? value['sourceName'] : '',
    sourceValue: typeof value['sourceValue'] === 'string' ? value['sourceValue'] : '',
    format: value['format'] === 'json' ? 'json' : 'text',
    items: value['items'].flatMap((item) =>
      isRecord(item) &&
      typeof item['content'] === 'string' &&
      typeof item['normalizedKey'] === 'string'
        ? [
            {
              content: item['content'],
              normalizedKey: item['normalizedKey'],
              duplicate: item['duplicate'] === true,
            },
          ]
        : [],
    ),
    totalCandidates: countOf(value['totalCandidates']),
    itemsTruncated: value['itemsTruncated'] === true,
  };
}

export function parseManagedMemoryImportCommitResponse(
  value: unknown,
): ManagedMemoryImportCommitResponse | null {
  if (!isRecord(value) || value['mode'] !== 'commit') return null;
  return {
    mode: 'commit',
    sourceName: typeof value['sourceName'] === 'string' ? value['sourceName'] : '',
    sourceValue: typeof value['sourceValue'] === 'string' ? value['sourceValue'] : '',
    insertedCount: countOf(value['insertedCount']),
    skippedDuplicateCount: countOf(value['skippedDuplicateCount']),
    blockedCount: countOf(value['blockedCount']),
    excludedCount: countOf(value['excludedCount']),
    memories: parseRecords(value['memories']),
  };
}
