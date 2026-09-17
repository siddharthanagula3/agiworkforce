import {
  FieldConditionError,
  normalizeFieldConditions,
  type FieldCondition,
} from '@/lib/automation/field-conditions';

export type ScheduleCondition =
  | { kind: 'url_changed'; url: string }
  | { kind: 'url_matches'; url: string; conditions: FieldCondition[] };

export interface ScheduleConditionState {
  checkedAt: string;
  met: boolean;
  detail: string;
  contentSha256?: string | null;
}

const MAX_URL_LENGTH = 2_000;

function normalizeWatchUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FieldConditionError('A condition watch needs a URL');
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_URL_LENGTH) throw new FieldConditionError('Watch URL is too long');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new FieldConditionError('Watch URL is not a valid URL');
  }
  if (url.protocol !== 'https:') throw new FieldConditionError('Watch URL must use https');
  if (url.username || url.password) {
    throw new FieldConditionError('Watch URL must not carry credentials');
  }
  return url.toString();
}

export function normalizeScheduleCondition(value: unknown): ScheduleCondition | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new FieldConditionError('Condition must be an object');
  }
  const record = value as Record<string, unknown>;
  const kind = record['kind'];
  if (kind === 'url_changed') {
    const unknownKeys = Object.keys(record).filter((key) => !['kind', 'url'].includes(key));
    if (unknownKeys.length > 0) {
      throw new FieldConditionError(`Unknown condition field: ${unknownKeys.join(', ')}`);
    }
    return { kind, url: normalizeWatchUrl(record['url']) };
  }
  if (kind === 'url_matches') {
    const unknownKeys = Object.keys(record).filter(
      (key) => !['kind', 'url', 'conditions'].includes(key),
    );
    if (unknownKeys.length > 0) {
      throw new FieldConditionError(`Unknown condition field: ${unknownKeys.join(', ')}`);
    }
    const conditions = normalizeFieldConditions(record['conditions']);
    if (conditions.length === 0) {
      throw new FieldConditionError('A URL match watch needs at least one condition');
    }
    return { kind, url: normalizeWatchUrl(record['url']), conditions };
  }
  throw new FieldConditionError('Condition kind must be url_changed or url_matches');
}
