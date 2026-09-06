'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import type { RouteBreakerState } from '@agiworkforce/routing';
import { toUserMessage } from '@/lib/user-error-message';
import type {
  RouteEconomicsReport,
  RouteEconomicsRow,
  RouteFreeStatus,
  RouteModality,
} from '../services/route-economics';
import BreakerStateBadge from './BreakerStateBadge';
import {
  formatCount,
  formatDateTime,
  formatLatencyMs,
  formatPercentPoints,
  formatRate,
  formatTokenCount,
  formatUnitPrice,
  NONE,
  UNKNOWN,
} from '../lib/operator-format';

const ROUTE_ECONOMICS_ENDPOINT = '/api/admin/route-economics';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const GHOST_BUTTON_CLASS =
  'rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50';
const CONTROL_LABEL_CLASS = 'flex flex-col gap-1 text-xs text-muted-foreground';
const TOGGLE_LABEL_CLASS =
  'flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs';
const CELL_CLASS = 'p-3 align-top';
const NUMERIC_CELL_CLASS = 'p-3 align-top tabular-nums';
const HEADER_CELL_CLASS = 'p-3 font-medium';

const ANY_OPTION = 'any';
const ROW_PAGE_SIZE = 200;
const COLUMN_COUNT = 13;

const FREE_ELIGIBLE: RouteFreeStatus = 'eligible';
const ZERO_RETENTION = 'zero_retention';

const ZDR_AVAILABILITIES: ReadonlySet<string> = new Set(['default', 'per_request_setting']);

const PRODUCTION_COMMERCIAL_STATUSES: ReadonlySet<string> = new Set([
  'agi_direct',
  'authorized_marketplace',
  'free_commercial',
]);

const FREE_STATUS_LABEL: Record<RouteFreeStatus, string> = {
  eligible: 'Eligible',
  not_verified: 'Not verified',
  expired: 'Expired',
  terms_incompatible: 'Terms incompatible',
  no_hard_stop: 'No hard stop',
  none: NONE,
};

const HEALTH_RANK: Record<RouteBreakerState, number> = {
  open: 0,
  degraded: 1,
  half_open: 2,
  closed: 3,
};

const MODALITY_FILTERS = [
  { value: 'text', label: 'Text in' },
  { value: 'vision', label: 'Vision in' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'image-out', label: 'Image out' },
] as const;

type ModalityFilter = (typeof MODALITY_FILTERS)[number]['value'];

const MODALITY_PREDICATE: Record<ModalityFilter, (modality: RouteModality) => boolean> = {
  text: (modality) => modality.textInput === true,
  vision: (modality) => modality.imageInput === true,
  audio: (modality) => modality.audioInput === true || modality.audioOutput === true,
  video: (modality) => modality.videoInput === true || modality.videoOutput === true,
  'image-out': (modality) => modality.imageOutput === true,
};

const MODALITY_INPUTS = [
  { key: 'textInput', label: 'Text' },
  { key: 'imageInput', label: 'Image' },
  { key: 'audioInput', label: 'Audio' },
  { key: 'videoInput', label: 'Video' },
] as const;

const MODALITY_OUTPUTS = [
  { key: 'textOutput', label: 'Text' },
  { key: 'imageOutput', label: 'Image' },
  { key: 'audioOutput', label: 'Audio' },
  { key: 'videoOutput', label: 'Video' },
] as const;

const TOGGLES = [
  { key: 'openWeight', label: 'Open weight' },
  { key: 'reasoning', label: 'Reasoning' },
  { key: 'tools', label: 'Tools' },
  { key: 'freeEligible', label: 'Free eligible' },
  { key: 'productionEligible', label: 'Production eligible' },
  { key: 'zeroRetention', label: 'Zero retention' },
  { key: 'configured', label: 'Credential configured' },
] as const;

type ToggleKey = (typeof TOGGLES)[number]['key'];

const TOGGLE_PREDICATE: Record<ToggleKey, (row: RouteEconomicsRow) => boolean> = {
  openWeight: (row) => row.openWeight === true,
  reasoning: (row) => row.reasoning === true,
  tools: (row) => row.functionCalling === true,
  freeEligible: (row) => row.free.status === FREE_ELIGIBLE,
  productionEligible: (row) => PRODUCTION_COMMERCIAL_STATUSES.has(row.commercialStatus),
  zeroRetention: (row) =>
    row.dataRetention === ZERO_RETENTION || ZDR_AVAILABILITIES.has(row.zeroDataRetention ?? ''),
  configured: (row) => row.credentialConfigured,
};

const SORTS = [
  { value: 'effective-input', label: 'Effective input price' },
  { value: 'effective-output', label: 'Effective output price' },
  { value: 'discount', label: 'Discount' },
  { value: 'health', label: 'Health' },
  { value: 'model', label: 'Model name' },
  { value: 'provider', label: 'Provider' },
] as const;

type SortKey = (typeof SORTS)[number]['value'];

function ascendingNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function descendingNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function healthRank(row: RouteEconomicsRow): number | null {
  return row.health === null ? null : HEALTH_RANK[row.health.state];
}

const COMPARATORS: Record<SortKey, (left: RouteEconomicsRow, right: RouteEconomicsRow) => number> =
  {
    'effective-input': (left, right) =>
      ascendingNumber(left.effectiveInputPerMillion, right.effectiveInputPerMillion),
    'effective-output': (left, right) =>
      ascendingNumber(left.effectiveOutputPerMillion, right.effectiveOutputPerMillion),
    discount: (left, right) => descendingNumber(left.discountPercent, right.discountPercent),
    health: (left, right) => ascendingNumber(healthRank(left), healthRank(right)),
    model: (left, right) => left.modelName.localeCompare(right.modelName),
    provider: (left, right) => left.providerLabel.localeCompare(right.providerLabel),
  };

function matchesQuery(row: RouteEconomicsRow, query: string): boolean {
  if (query === '') return true;
  return [
    row.modelName,
    row.modelKey,
    row.developerLabel ?? '',
    row.providerLabel,
    row.providerId,
    row.providerModelId,
    row.routeId,
  ].some((field) => field.toLowerCase().includes(query));
}

function modalitySummary(modality: RouteModality): string {
  const values = Object.values(modality);
  if (values.every((value) => value === null)) return UNKNOWN;
  const inputs = MODALITY_INPUTS.filter((entry) => modality[entry.key] === true).map(
    (entry) => entry.label,
  );
  const outputs = MODALITY_OUTPUTS.filter((entry) => modality[entry.key] === true).map(
    (entry) => entry.label,
  );
  if (inputs.length === 0 && outputs.length === 0) return NONE;
  return `${inputs.join('+') || NONE} → ${outputs.join('+') || NONE}`;
}

function booleanLabel(value: boolean | null, yes: string, no: string): string {
  if (value === null) return UNKNOWN;
  return value ? yes : no;
}

function textOrUnknown(value: string | null): string {
  return value === null || value === '' ? UNKNOWN : value;
}

function numberOrUnknown(
  value: number | null,
  format: (value: number) => string = formatCount,
): string {
  return value === null ? UNKNOWN : format(value);
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xs">{value}</dd>
    </div>
  );
}

function RouteDetails({ row }: { row: RouteEconomicsRow }) {
  return (
    <dl className="grid gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
      <DetailItem label="Route" value={row.routeId} />
      <DetailItem label="Provider model id" value={row.providerModelId} />
      <DetailItem label="Harness" value={row.harnessId} />
      <DetailItem label="Trust modes" value={row.trustModes.join(', ') || NONE} />
      <DetailItem label="Availability" value={row.availability} />
      <DetailItem label="Selectable" value={booleanLabel(row.selectable, 'Yes', 'No')} />
      <DetailItem label="Default route" value={booleanLabel(row.isDefault, 'Yes', 'No')} />
      <DetailItem label="Lifecycle stage" value={textOrUnknown(row.lifecycleStage)} />
      <DetailItem label="Commercial status" value={row.commercialStatus} />
      <DetailItem label="Cache class" value={textOrUnknown(row.cacheClass)} />
      <DetailItem label="Pricing unit" value={textOrUnknown(row.unit)} />
      <DetailItem label="Currency" value={textOrUnknown(row.currency)} />
      <DetailItem label="List input / 1M" value={formatUnitPrice(row.listInputPerMillion)} />
      <DetailItem label="List output / 1M" value={formatUnitPrice(row.listOutputPerMillion)} />
      <DetailItem label="Cache write / 1M" value={formatUnitPrice(row.cacheWritePerMillion)} />
      <DetailItem label="Tools" value={booleanLabel(row.functionCalling, 'Yes', 'No')} />
      <DetailItem
        label="Structured output"
        value={booleanLabel(row.structuredOutput, 'Yes', 'No')}
      />
      <DetailItem label="Reasoning" value={booleanLabel(row.reasoning, 'Yes', 'No')} />
      <DetailItem label="Streaming" value={booleanLabel(row.streaming, 'Yes', 'No')} />
      <DetailItem label="Open weight" value={booleanLabel(row.openWeight, 'Yes', 'No')} />
      <DetailItem label="License" value={textOrUnknown(row.license)} />
      <DetailItem label="Data retention" value={row.dataRetention} />
      <DetailItem label="Zero data retention" value={textOrUnknown(row.zeroDataRetention)} />
      <DetailItem label="Trains on inputs" value={textOrUnknown(row.trainsOnInputs)} />
      <DetailItem
        label="Regions"
        value={row.residencyRegions === null ? UNKNOWN : row.residencyRegions.join(', ') || UNKNOWN}
      />
      <DetailItem label="Governance verified on" value={textOrUnknown(row.governanceVerifiedOn)} />
      <DetailItem label="Free pool" value={textOrUnknown(row.free.poolId)} />
      <DetailItem
        label="Free allowance"
        value={
          row.free.limit === null
            ? UNKNOWN
            : `${formatCount(row.free.limit)} ${row.free.unit ?? UNKNOWN} per ${row.free.window ?? UNKNOWN}`
        }
      />
      <DetailItem
        label="Free hard stop"
        value={booleanLabel(row.free.hardStopsBeforePaid, 'Yes', 'No')}
      />
      <DetailItem label="Free verification expires" value={formatDateTime(row.free.expiresAt)} />
      <DetailItem
        label="Health samples"
        value={numberOrUnknown(row.health?.observations.sampleCount ?? null)}
      />
      <DetailItem
        label="TTFT p50"
        value={numberOrUnknown(row.health?.observations.ttftP50Ms ?? null, formatLatencyMs)}
      />
      <DetailItem
        label="Throughput, tokens per second"
        value={numberOrUnknown(row.health?.observations.throughputTokensPerSecond ?? null)}
      />
      <DetailItem
        label="Consecutive failures"
        value={numberOrUnknown(row.health?.observations.consecutiveFailures ?? null)}
      />
    </dl>
  );
}

export default function RouteEconomicsPanel() {
  const [report, setReport] = useState<RouteEconomicsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [developer, setDeveloper] = useState<string>(ANY_OPTION);
  const [provider, setProvider] = useState<string>(ANY_OPTION);
  const [modality, setModality] = useState<string>(ANY_OPTION);
  const [sort, setSort] = useState<SortKey>('effective-input');
  const [toggles, setToggles] = useState<Readonly<Record<string, boolean>>>({});
  const [visibleCount, setVisibleCount] = useState(ROW_PAGE_SIZE);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await readJson<RouteEconomicsReport>(ROUTE_ECONOMICS_ENDPOINT));
    } catch (loadError) {
      setError(toUserMessage(loadError, 'Could not read route economics.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => report?.routes ?? [], [report]);

  const developerOptions = useMemo(() => {
    const labels = new Map<string, string>();
    for (const row of rows) {
      if (row.developerId !== null)
        labels.set(row.developerId, row.developerLabel ?? row.developerId);
    }
    return [...labels.entries()].sort(([, left], [, right]) => left.localeCompare(right));
  }, [rows]);

  const providerOptions = useMemo(() => {
    const labels = new Map<string, string>();
    for (const row of rows) labels.set(row.providerId, row.providerLabel);
    return [...labels.entries()].sort(([, left], [, right]) => left.localeCompare(right));
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const activeToggles = TOGGLES.filter((toggle) => toggles[toggle.key] === true);
    const filtered = rows.filter((row) => {
      if (!matchesQuery(row, needle)) return false;
      if (developer !== ANY_OPTION && row.developerId !== developer) return false;
      if (provider !== ANY_OPTION && row.providerId !== provider) return false;
      if (
        modality !== ANY_OPTION &&
        !MODALITY_PREDICATE[modality as ModalityFilter](row.modality)
      ) {
        return false;
      }
      return activeToggles.every((toggle) => TOGGLE_PREDICATE[toggle.key](row));
    });
    return filtered.sort(COMPARATORS[sort]);
  }, [rows, query, developer, provider, modality, toggles, sort]);

  useEffect(() => {
    setVisibleCount(ROW_PAGE_SIZE);
  }, [query, developer, provider, modality, toggles, sort]);

  function toggleExpanded(routeId: string) {
    setExpanded((current) => (current === routeId ? null : routeId));
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="route-economics-title">
      <div>
        <h2 id="route-economics-title" className="text-sm font-medium">
          Routes
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every route the registry declares, with what it lists, what it actually costs after a
          negotiated discount, what it is allowed to serve, and whether a managed credential exists
          for it. A field the registry does not answer reads Unknown rather than a default.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : report === null ? (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading route economics…</span>
        </div>
      ) : (
        <>
          <div className={`${CARD_CLASS} flex flex-col gap-4`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className={CONTROL_LABEL_CLASS}>
                Search
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Model, developer, provider, route"
                  className={FIELD_CLASS}
                />
              </label>
              <label className={CONTROL_LABEL_CLASS}>
                Developer
                <select
                  value={developer}
                  onChange={(event) => setDeveloper(event.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value={ANY_OPTION}>All developers</option>
                  {developerOptions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={CONTROL_LABEL_CLASS}>
                Provider
                <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value={ANY_OPTION}>All providers</option>
                  {providerOptions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={CONTROL_LABEL_CLASS}>
                Modality
                <select
                  value={modality}
                  onChange={(event) => setModality(event.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value={ANY_OPTION}>Any modality</option>
                  {MODALITY_FILTERS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={CONTROL_LABEL_CLASS}>
                Sort by
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className={FIELD_CLASS}
                >
                  {SORTS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {TOGGLES.map((toggle) => (
                <label key={toggle.key} className={TOGGLE_LABEL_CLASS}>
                  <input
                    type="checkbox"
                    checked={toggles[toggle.key] === true}
                    onChange={(event) =>
                      setToggles((current) => ({ ...current, [toggle.key]: event.target.checked }))
                    }
                  />
                  {toggle.label}
                </label>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {formatCount(visible.length)} of {formatCount(rows.length)} routes match. Showing{' '}
              {formatCount(Math.min(visibleCount, visible.length))}.
            </p>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No route matches these filters.</p>
          ) : (
            <div className={TABLE_WRAP_CLASS}>
              <table className="w-full min-w-[1200px] text-sm">
                <caption className="sr-only">
                  Provider route economics, filtered and sorted by the controls above
                </caption>
                <thead className="bg-card text-left">
                  <tr>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Model
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Developer
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Provider
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      In / 1M
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Out / 1M
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Cache read
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Discount
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Context
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Modality
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Health
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Free
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Credential
                    </th>
                    <th scope="col" className={HEADER_CELL_CLASS}>
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, visibleCount).map((row) => (
                    <Fragment key={row.routeId}>
                      <tr className="border-t border-border">
                        <td className={CELL_CLASS}>
                          <div>{row.modelName}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {row.routeId}
                          </div>
                        </td>
                        <td className={CELL_CLASS}>{textOrUnknown(row.developerLabel)}</td>
                        <td className={CELL_CLASS}>{row.providerLabel}</td>
                        <td className={NUMERIC_CELL_CLASS}>
                          {formatUnitPrice(row.effectiveInputPerMillion)}
                          {row.discountPercent === null ? null : (
                            <div className="text-xs text-muted-foreground line-through">
                              {formatUnitPrice(row.listInputPerMillion)}
                            </div>
                          )}
                        </td>
                        <td className={NUMERIC_CELL_CLASS}>
                          {formatUnitPrice(row.effectiveOutputPerMillion)}
                          {row.discountPercent === null ? null : (
                            <div className="text-xs text-muted-foreground line-through">
                              {formatUnitPrice(row.listOutputPerMillion)}
                            </div>
                          )}
                        </td>
                        <td className={NUMERIC_CELL_CLASS}>
                          {formatUnitPrice(row.cacheReadPerMillion)}
                        </td>
                        <td className={NUMERIC_CELL_CLASS}>
                          {row.discountPercent === null
                            ? NONE
                            : formatPercentPoints(row.discountPercent)}
                        </td>
                        <td className={NUMERIC_CELL_CLASS}>
                          {formatTokenCount(row.contextTokens)}
                        </td>
                        <td className={`${CELL_CLASS} text-xs`}>{modalitySummary(row.modality)}</td>
                        <td className={CELL_CLASS}>
                          {row.health === null ? (
                            UNKNOWN
                          ) : (
                            <div className="flex flex-col items-start gap-1">
                              <BreakerStateBadge state={row.health.state} />
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {numberOrUnknown(row.health.observations.successRate, formatRate)}
                                {' · '}
                                {numberOrUnknown(
                                  row.health.observations.ttftP50Ms,
                                  formatLatencyMs,
                                )}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className={`${CELL_CLASS} text-xs`}>
                          {FREE_STATUS_LABEL[row.free.status]}
                          {row.free.expiresAt === null ? null : (
                            <div className="text-muted-foreground">
                              {formatDateTime(row.free.expiresAt)}
                            </div>
                          )}
                        </td>
                        <td className={`${CELL_CLASS} text-xs`}>
                          {row.credentialConfigured ? (
                            'Configured'
                          ) : (
                            <span className="text-muted-foreground">Not configured</span>
                          )}
                        </td>
                        <td className={CELL_CLASS}>
                          <button
                            type="button"
                            aria-expanded={expanded === row.routeId}
                            onClick={() => toggleExpanded(row.routeId)}
                            className={GHOST_BUTTON_CLASS}
                          >
                            {expanded === row.routeId ? 'Hide' : 'Show'}
                            <span className="sr-only"> details for {row.modelName}</span>
                          </button>
                        </td>
                      </tr>
                      {expanded === row.routeId ? (
                        <tr className="border-t border-border">
                          <td colSpan={COLUMN_COUNT} className="bg-muted">
                            <RouteDetails row={row} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {visibleCount < visible.length ? (
            <div>
              <button
                type="button"
                onClick={() => setVisibleCount((current) => current + ROW_PAGE_SIZE)}
                className={GHOST_BUTTON_CLASS}
              >
                Show more
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
