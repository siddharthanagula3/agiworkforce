import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { creditsFromMicrousd } from '@agiworkforce/types';

import { createError } from '@/lib/errors';
import {
  COST_MICROUSD,
  OUT_TOKENS,
  SETTLED,
  TOKENS,
  USAGE_MAX_WINDOW_DAYS,
  num,
} from '@/lib/services/usage-aggregation';

export const USAGE_REPORT_DEFAULT_BUCKETS = 7;
export const USAGE_REPORT_MAX_BUCKETS = 31;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface UsageReportResult {
  userId: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  credits: number;
}

export interface UsageReportBucket {
  startingAt: string;
  endingAt: string;
  results: UsageReportResult[];
}

export interface UsageReportPage {
  data: UsageReportBucket[];
  hasMore: boolean;
  nextPage: string | null;
}

export interface UsageReportWindow {
  pageStart: Date;
  end: Date;
  limit: number;
}

interface MemberDayRow {
  day: string;
  user_id: string;
  requests: string | number | null;
  input_tokens: string | number | null;
  output_tokens: string | number | null;
  cost_microusd: string | number | null;
}

function parseInstant(value: string, name: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createError.validation(`${name} must be an ISO 8601 date or date-time.`);
  }
  return parsed;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function endOfUtcDay(value: Date): Date {
  const start = startOfUtcDay(value);
  return start.getTime() === value.getTime() ? start : new Date(start.getTime() + DAY_MS);
}

export function resolveUsageReportWindow(
  params: { from: string; to: string | null; page: string | null; limit: number },
  now: Date = new Date(),
): UsageReportWindow {
  const start = startOfUtcDay(parseInstant(params.from, 'from'));
  const requestedEnd = endOfUtcDay(params.to === null ? now : parseInstant(params.to, 'to'));
  const today = endOfUtcDay(now);
  const end = requestedEnd > today ? today : requestedEnd;
  if (start >= end) {
    throw createError.validation('from must be before to and not in the future.');
  }
  if (end.getTime() - start.getTime() > USAGE_MAX_WINDOW_DAYS * DAY_MS) {
    throw createError.validation(
      `A usage report covers at most ${USAGE_MAX_WINDOW_DAYS} days. Narrow from and to.`,
    );
  }

  if (params.page === null) {
    return { pageStart: start, end, limit: params.limit };
  }
  const pageStart = parseInstant(params.page, 'page');
  if (
    startOfUtcDay(pageStart).getTime() !== pageStart.getTime() ||
    pageStart < start ||
    pageStart >= end
  ) {
    throw createError.validation('page is not a page of this report. Pass nextPage unchanged.');
  }
  return { pageStart, end, limit: params.limit };
}

export async function readWorkspaceUsageReport(
  db: DatabaseAdapter,
  organizationId: string,
  window: UsageReportWindow,
): Promise<UsageReportPage> {
  const pageEnd = new Date(
    Math.min(window.pageStart.getTime() + window.limit * DAY_MS, window.end.getTime()),
  );
  const rows = await db.query<MemberDayRow>(
    `select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day,
            user_id,
            count(*)::int as requests,
            sum(${TOKENS})::bigint as input_tokens,
            sum(${OUT_TOKENS})::bigint as output_tokens,
            ${COST_MICROUSD} as cost_microusd
       from public.managed_usage_requests
      where organization_id = $1
        and ${SETTLED}
        and created_at >= $2
        and created_at < $3
      group by 1, 2
      order by 1 asc, cost_microusd desc, user_id asc`,
    [organizationId, window.pageStart.toISOString(), pageEnd.toISOString()],
  );

  const resultsByDay = new Map<string, UsageReportResult[]>();
  for (const row of rows) {
    const results = resultsByDay.get(row.day) ?? [];
    results.push({
      userId: row.user_id,
      requests: num(row.requests),
      inputTokens: num(row.input_tokens),
      outputTokens: num(row.output_tokens),
      credits: creditsFromMicrousd(num(row.cost_microusd)),
    });
    resultsByDay.set(row.day, results);
  }

  const data: UsageReportBucket[] = [];
  for (let at = window.pageStart.getTime(); at < pageEnd.getTime(); at += DAY_MS) {
    const startingAt = new Date(at).toISOString();
    data.push({
      startingAt,
      endingAt: new Date(at + DAY_MS).toISOString(),
      results: resultsByDay.get(startingAt.slice(0, 10)) ?? [],
    });
  }

  const hasMore = pageEnd < window.end;
  return { data, hasMore, nextPage: hasMore ? pageEnd.toISOString() : null };
}
