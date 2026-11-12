import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEVELOPER_REQUEST_LOGS_PAGE_SIZE,
  type DeveloperRequestLog,
  type DeveloperRequestLogPage,
  type DeveloperRequestLogStep,
} from '@agiworkforce/cloud-contracts';
import { creditsFromMicrousd } from '@agiworkforce/types';
import {
  MICROSECOND_SORT_KEY_FORMAT,
  buildPage,
  decodeKeysetCursor,
  keysetSql,
} from '@/lib/identity/pagination';

interface RequestLogRow {
  id: string;
  created_at: string | Date;
  status: string;
  model: string;
  final_error_code: string | null;
  actual_cost_microusd: string | number | null;
  usage: Record<string, unknown> | null;
  provider_started_at: string | Date | null;
  provider_succeeded_at: string | Date | null;
  client_delivered_at: string | Date | null;
  finalized_at: string | Date | null;
  key_name: string | null;
  key_prefix: string | null;
  page_sort_key?: string;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function count(usage: Record<string, unknown>, key: string): number | null {
  const value = usage[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function codeExecutionRuns(usage: Record<string, unknown>): number | null {
  const evidence = usage['hostedCodeExecution'];
  if (!evidence || typeof evidence !== 'object') return null;
  return count(evidence as Record<string, unknown>, 'requests');
}

export function toDeveloperRequestLog(row: RequestLogRow): DeveloperRequestLog {
  const usage = row.usage ?? {};
  const steps: DeveloperRequestLogStep[] = (
    [
      ['received', row.created_at],
      ['provider_started', row.provider_started_at],
      ['provider_answered', row.provider_succeeded_at],
      ['delivered', row.client_delivered_at],
      ['settled', row.status === 'completed' ? row.finalized_at : null],
    ] as const
  ).flatMap(([name, at]) => {
    const when = iso(at);
    return when ? [{ name, at: when }] : [];
  });
  const servedModel = usage['servedModel'];
  return {
    id: row.id,
    createdAt: iso(row.created_at) ?? '',
    apiKeyName: row.key_name,
    apiKeyPrefix: row.key_prefix,
    status: row.status,
    model: row.model,
    servedModel: typeof servedModel === 'string' ? servedModel : null,
    errorCode: row.final_error_code,
    credits:
      row.actual_cost_microusd === null
        ? null
        : creditsFromMicrousd(Number(row.actual_cost_microusd)),
    inputTokens: count(usage, 'inputTokens'),
    outputTokens: count(usage, 'outputTokens'),
    reasoningTokens: count(usage, 'reasoningTokens'),
    cacheReadTokens: count(usage, 'cacheReadTokens'),
    webSearchRequests: count(usage, 'webSearchRequests'),
    webFetchRequests: count(usage, 'webFetchRequests'),
    codeExecutionRuns: codeExecutionRuns(usage),
    steps,
  };
}

export async function listDeveloperRequestLogs(
  db: DatabaseAdapter,
  userId: string,
  before: string | null,
): Promise<DeveloperRequestLogPage> {
  const cursor = decodeKeysetCursor(before);
  const params: unknown[] = [userId];
  const keyset = keysetSql({
    sortColumn: 'created_at',
    idColumn: 'id',
    ...(cursor ? { cursor } : {}),
    firstParamIndex: params.length + 1,
  });
  let startClause = '';
  if (keyset.where) {
    params.push(...keyset.params);
    startClause = `and ${keyset.where}`;
  } else if (before) {
    params.push(before);
    startClause = `and created_at < $${params.length}::timestamptz + interval '1 millisecond'`;
  }
  params.push(DEVELOPER_REQUEST_LOGS_PAGE_SIZE + 1);
  const rows = await db.query<RequestLogRow>(
    `select * from (
       select r.id, r.created_at, r.status, r.model, r.final_error_code, r.actual_cost_microusd,
              r.usage, r.provider_started_at, r.provider_succeeded_at, r.client_delivered_at,
              r.finalized_at, k.name as key_name, k.key_prefix,
              to_char(r.created_at at time zone 'utc', ${MICROSECOND_SORT_KEY_FORMAT}) as page_sort_key
         from public.managed_usage_requests r
         left join public.api_keys k
           on k.id = r.api_key_id
          and k.user_id = r.user_id
        where r.user_id = $1
          and r.api_key_id is not null
     ) logs
      where true
        ${startClause}
      ${keyset.orderBy}
      limit $${params.length}`,
    params,
  );
  const page = buildPage(rows, DEVELOPER_REQUEST_LOGS_PAGE_SIZE, (row) => ({
    sortValue: row.page_sort_key ?? '',
    id: row.id,
  }));
  return {
    logs: page.items.map(toDeveloperRequestLog),
    nextBefore: page.nextCursor,
  };
}
