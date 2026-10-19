import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEVELOPER_REQUEST_LOGS_PAGE_SIZE,
  type DeveloperRequestLog,
  type DeveloperRequestLogPage,
  type DeveloperRequestLogStep,
} from '@agiworkforce/cloud-contracts';
import { creditsFromMicrousd } from '@agiworkforce/types';

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
      ['settled', row.finalized_at],
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
  const rows = await db.query<RequestLogRow>(
    `select r.id, r.created_at, r.status, r.model, r.final_error_code, r.actual_cost_microusd,
            r.usage, r.provider_started_at, r.provider_succeeded_at, r.client_delivered_at,
            r.finalized_at, k.name as key_name, k.key_prefix
       from public.managed_usage_requests r
       left join public.api_keys k
         on k.id = r.api_key_id
        and k.user_id = r.user_id
      where r.user_id = $1
        and r.api_key_id is not null
        and ($2::timestamptz is null or r.created_at < $2::timestamptz)
      order by r.created_at desc
      limit $3`,
    [userId, before, DEVELOPER_REQUEST_LOGS_PAGE_SIZE + 1],
  );
  const logs = rows.slice(0, DEVELOPER_REQUEST_LOGS_PAGE_SIZE).map(toDeveloperRequestLog);
  return {
    logs,
    nextBefore:
      rows.length > DEVELOPER_REQUEST_LOGS_PAGE_SIZE ? (logs.at(-1)?.createdAt ?? null) : null,
  };
}
