import 'server-only';

import { createHash } from 'node:crypto';

import { evaluateFieldConditions } from '@/lib/automation/field-conditions';
import { assertResolvedPublicHostname, pinnedPublicFetch } from '@/lib/egress-policy';
import type { ScheduleCondition, ScheduleConditionState } from '@/lib/schedules/schedule-condition';

const WATCH_TIMEOUT_MS = 10_000;
const MAX_WATCH_BODY_BYTES = 1_048_576;

async function readBoundedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WATCH_BODY_BYTES) {
      await reader.cancel();
      throw new Error('Watched page is larger than the 1 MB a watch reads');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function evaluateScheduleCondition(
  condition: ScheduleCondition,
  previous: ScheduleConditionState | null,
  options: { now?: Date; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ScheduleConditionState> {
  const checkedAt = (options.now ?? new Date()).toISOString();
  const send = options.fetchImpl ?? pinnedPublicFetch;
  let status: number;
  let body: string;
  try {
    await assertResolvedPublicHostname(condition.url);
    const signals = [
      AbortSignal.timeout(WATCH_TIMEOUT_MS),
      ...(options.signal ? [options.signal] : []),
    ];
    const response = await send(condition.url, {
      method: 'GET',
      redirect: 'error',
      headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.5' },
      signal: AbortSignal.any(signals),
    });
    status = response.status;
    body = await readBoundedBody(response);
  } catch (error) {
    return {
      checkedAt,
      met: false,
      detail:
        `The watched URL could not be read: ${error instanceof Error ? error.message : String(error)}`.slice(
          0,
          500,
        ),
      contentSha256: previous?.contentSha256 ?? null,
    };
  }

  if (condition.kind === 'url_changed') {
    if (status < 200 || status >= 300) {
      return {
        checkedAt,
        met: false,
        detail: `The watched URL answered ${status}`,
        contentSha256: previous?.contentSha256 ?? null,
      };
    }
    const contentSha256 = createHash('sha256').update(body).digest('hex');
    const baseline = previous?.contentSha256 ?? null;
    if (baseline === null) {
      return {
        checkedAt,
        met: false,
        detail: 'Recorded the first version to compare against',
        contentSha256,
      };
    }
    const changed = baseline !== contentSha256;
    return {
      checkedAt,
      met: changed,
      detail: changed ? 'The watched page changed' : 'The watched page has not changed',
      contentSha256,
    };
  }

  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }
  const met = evaluateFieldConditions(condition.conditions, { status, body: parsed });
  return {
    checkedAt,
    met,
    detail: met
      ? 'The watched response matched every condition'
      : 'The watched response did not match',
    contentSha256: null,
  };
}
