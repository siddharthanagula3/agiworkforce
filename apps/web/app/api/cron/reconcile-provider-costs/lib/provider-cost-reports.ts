import 'server-only';

import { getOptionalEnv } from '@shared/utils/env';
import { MICROUSD_PER_CENT, MICROUSD_PER_USD } from '@agiworkforce/types';

import { providerApiUrl } from '@/lib/server/provider-endpoints';

const ANTHROPIC_VERSION = '2023-06-01';
const REPORT_TIMEOUT_MS = 20_000;
const SINGLE_BUCKET = '1';
const DAILY_BUCKET = '1d';
const MS_PER_SECOND = 1000;

export const OPENAI_ADMIN_KEY_ENV = 'OPENAI_ADMIN_API_KEY';
export const ANTHROPIC_ADMIN_KEY_ENV = 'ANTHROPIC_ADMIN_API_KEY';

export const OPENAI_COST_SOURCE = 'openai_costs_api';
export const ANTHROPIC_COST_SOURCE = 'anthropic_cost_report';

export interface DayWindow {
  day: string;
  start: Date;
  end: Date;
}

export type ProviderCostReport =
  | { status: 'reported'; provider: string; source: string; reportedMicrousd: number }
  | { status: 'not_configured'; provider: string; source: string; envKey: string }
  | { status: 'unknown'; provider: string; source: string; reason: string }
  | { status: 'failed'; provider: string; source: string; reason: string };

export interface ProviderCostReportClient {
  provider: string;
  source: string;
  fetchDay(window: DayWindow, fetchImpl?: typeof fetch): Promise<ProviderCostReport>;
}

export const CATCH_UP_DAYS = 6;

function windowEndingAt(end: Date): DayWindow {
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - 1);
  return { day: start.toISOString().slice(0, 10), start, end };
}

export function yesterdayWindow(now: Date): DayWindow {
  return windowEndingAt(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  );
}

export function catchUpWindows(now: Date, days: number = CATCH_UP_DAYS): DayWindow[] {
  const windows: DayWindow[] = [];
  let end = yesterdayWindow(now).start;
  for (let offset = 0; offset < days; offset += 1) {
    const window = windowEndingAt(end);
    windows.push(window);
    end = window.start;
  }
  return windows.reverse();
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJson(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buckets(payload: unknown): unknown[] {
  const data = payload && typeof payload === 'object' ? (payload as { data?: unknown }).data : null;
  if (!Array.isArray(data)) throw new Error('The cost report has no data array');
  return data;
}

function bucketResults(bucket: unknown): unknown[] {
  const results =
    bucket && typeof bucket === 'object' ? (bucket as { results?: unknown }).results : null;
  if (!Array.isArray(results)) throw new Error('A cost report bucket has no results array');
  return results;
}

function summedAmounts(payload: unknown, amountOf: (result: object) => unknown): number {
  let total = 0;
  for (const bucket of buckets(payload)) {
    for (const result of bucketResults(bucket)) {
      if (!result || typeof result !== 'object') {
        throw new Error('A cost report result is not an object');
      }
      const amount = numeric(amountOf(result));
      if (amount === null) throw new Error('A cost report result carries no readable amount');
      total += amount;
    }
  }
  return total;
}

const openaiClient: ProviderCostReportClient = {
  provider: 'openai',
  source: OPENAI_COST_SOURCE,
  async fetchDay(window, fetchImpl = fetch) {
    const key = getOptionalEnv(OPENAI_ADMIN_KEY_ENV)?.trim();
    if (!key) {
      return {
        status: 'not_configured',
        provider: this.provider,
        source: this.source,
        envKey: OPENAI_ADMIN_KEY_ENV,
      };
    }

    const url = new URL(providerApiUrl('openai', 'organization/costs'));
    url.searchParams.set('start_time', String(Math.floor(window.start.getTime() / MS_PER_SECOND)));
    url.searchParams.set('end_time', String(Math.floor(window.end.getTime() / MS_PER_SECOND)));
    url.searchParams.set('bucket_width', DAILY_BUCKET);
    url.searchParams.set('limit', SINGLE_BUCKET);

    try {
      const payload = await readJson(url.toString(), { Authorization: `Bearer ${key}` }, fetchImpl);
      const usd = summedAmounts(
        payload,
        (result) => (result as { amount?: { value?: unknown } }).amount?.value,
      );
      return {
        status: 'reported',
        provider: this.provider,
        source: this.source,
        reportedMicrousd: Math.round(usd * MICROUSD_PER_USD),
      };
    } catch (error) {
      return {
        status: 'failed',
        provider: this.provider,
        source: this.source,
        reason: reason(error),
      };
    }
  },
};

const anthropicClient: ProviderCostReportClient = {
  provider: 'anthropic',
  source: ANTHROPIC_COST_SOURCE,
  async fetchDay(window, fetchImpl = fetch) {
    const key = getOptionalEnv(ANTHROPIC_ADMIN_KEY_ENV)?.trim();
    if (!key) {
      return {
        status: 'not_configured',
        provider: this.provider,
        source: this.source,
        envKey: ANTHROPIC_ADMIN_KEY_ENV,
      };
    }

    const url = new URL(providerApiUrl('anthropic', 'organizations/cost_report'));
    url.searchParams.set('starting_at', window.start.toISOString());
    url.searchParams.set('ending_at', window.end.toISOString());
    url.searchParams.set('bucket_width', DAILY_BUCKET);
    url.searchParams.set('limit', SINGLE_BUCKET);

    try {
      const payload = await readJson(
        url.toString(),
        { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
        fetchImpl,
      );
      const cents = summedAmounts(payload, (result) => (result as { amount?: unknown }).amount);
      return {
        status: 'reported',
        provider: this.provider,
        source: this.source,
        reportedMicrousd: Math.round(cents * MICROUSD_PER_CENT),
      };
    } catch (error) {
      return {
        status: 'failed',
        provider: this.provider,
        source: this.source,
        reason: reason(error),
      };
    }
  },
};

export const UNREPORTED_PROVIDERS = ['openrouter', 'google', 'vercel', 'e2b'] as const;
const NO_COST_ENDPOINT = 'no_read_only_cost_endpoint_confirmed';

function unreportedClient(provider: string): ProviderCostReportClient {
  return {
    provider,
    source: 'unknown',
    fetchDay: async () => ({
      status: 'unknown',
      provider,
      source: 'unknown',
      reason: NO_COST_ENDPOINT,
    }),
  };
}

export const PROVIDER_COST_REPORT_CLIENTS: readonly ProviderCostReportClient[] = [
  openaiClient,
  anthropicClient,
  ...UNREPORTED_PROVIDERS.map(unreportedClient),
];
