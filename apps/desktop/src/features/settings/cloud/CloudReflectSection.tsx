
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ManagedCloudReflectRange,
  ManagedCloudReflectRecap,
} from '@agiworkforce/cloud-contracts';

import {
  CloudReflectMemoryRequiredError,
  fetchCloudReflectRecap,
} from '../../../api/cloudAccountSettings';
import { SECONDARY_BUTTON, SectionError, SectionHeading, SectionLoading } from './sectionChrome';

const RANGE_OPTIONS: ReadonlyArray<{ value: ManagedCloudReflectRange; label: string }> = [
  { value: '30d', label: 'Past 30 days' },
  { value: '90d', label: 'Past 3 months' },
  { value: '180d', label: 'Past 6 months' },
  { value: '365d', label: 'Past year' },
];

function browserTimezone(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function formatDateKey(dateKey: string | null): string {
  if (!dateKey) return '—';
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function formatHour(hour: number | null): string {
  if (hour === null) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2026, 0, 1, hour));
}

export function CloudReflectSection() {
  const timezone = useMemo(() => browserTimezone(), []);
  const [range, setRange] = useState<ManagedCloudReflectRange>('30d');
  const [recap, setRecap] = useState<ManagedCloudReflectRecap | null>(null);
  const [memoryRequired, setMemoryRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(
    async (nextRange: ManagedCloudReflectRange) => {
      const current = ++generation.current;
      setLoading(true);
      setError(null);
      setMemoryRequired(false);
      setRecap(null);
      try {
        const next = await fetchCloudReflectRecap(nextRange, timezone);
        if (generation.current === current) setRecap(next);
      } catch (caught) {
        if (generation.current !== current) return;
        if (caught instanceof CloudReflectMemoryRequiredError) {
          setMemoryRequired(true);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Reflect could not load.');
      } finally {
        if (generation.current === current) setLoading(false);
      }
    },
    [timezone],
  );

  useEffect(() => {
    void load(range);
    return () => {
      generation.current += 1;
    };
  }, [load, range]);

  const maxDailyCount = Math.max(
    1,
    ...(recap?.dailyActivity.map((day) => day.conversationCount) ?? []),
  );

  return (
    <div className="flex flex-col gap-6" data-testid="cloud-reflect">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          title="Reflect"
          description="Patterns in how you use AGI Cloud, without scores or judgment. The recap is built only when you open this section."
        />
        <div className="flex shrink-0 items-center gap-2">
          <select
            aria-label="Reflect range"
            value={range}
            disabled={loading}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            onChange={(event) => setRange(event.target.value as ManagedCloudReflectRange)}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={loading}
            onClick={() => void load(range)}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? <SectionLoading label="Building your recap…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void load(range)} /> : null}

      {memoryRequired ? (
        <div className="rounded-lg border border-border bg-card/40 p-5" role="status">
          <p className="text-sm font-medium text-foreground">Memory is off</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Reflect uses the same account chat-history controls as Memory. Turn on Memory and
            &ldquo;Generate from past chats&rdquo; in Capabilities to create a recap.
          </p>
        </div>
      ) : null}

      {recap && recap.stats.totalConversations === 0 ? (
        <div className="rounded-lg border border-border bg-card/40 p-5">
          <p className="text-sm font-semibold text-foreground">{recap.summary.headline}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{recap.summary.body}</p>
        </div>
      ) : null}

      {recap && recap.stats.totalConversations > 0 ? (
        <>
          <div className="rounded-lg border border-border bg-card/40 p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {recap.period.label}
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">{recap.summary.headline}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{recap.summary.body}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Conversations', String(recap.stats.totalConversations)],
              ['Active days', String(recap.stats.activeDays)],
              ['Most active day', formatDateKey(recap.stats.mostActiveDay)],
              ['Peak start time', formatHour(recap.stats.peakHour)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-card/40 p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div
            className="flex h-24 items-end gap-1 rounded-lg border border-border bg-card/40 p-3"
            aria-label="Conversation activity by active day"
          >
            {recap.dailyActivity.slice(-60).map((day) => (
              <div
                key={day.date}
                title={`${formatDateKey(day.date)}: ${day.conversationCount}`}
                aria-label={`${day.date}: ${day.conversationCount} conversations`}
                className="min-w-[2px] flex-1 rounded-t bg-primary/70"
                style={{
                  height: `${Math.max(8, (day.conversationCount / maxDailyCount) * 100)}%`,
                }}
              />
            ))}
          </div>

          {recap.topics.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-foreground">What you spent time on</h3>
              <ul className="mt-3 flex flex-col gap-3">
                {recap.topics.map((topic) => (
                  <li key={topic.id} className="rounded-lg border border-border bg-card/40 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{topic.label}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {topic.description}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-foreground">
                        {topic.percentage}%
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${topic.percentage}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {recap.insights.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-foreground">Expanding your skills</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Observations and optional next steps — not a performance score.
              </p>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {recap.insights.map((insight) => (
                  <li
                    key={insight.dimension}
                    className="rounded-lg border border-border bg-card/40 p-4"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {insight.dimension}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{insight.title}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {insight.observation}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-foreground">{insight.nextStep}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {recap.sampled ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Activity, topic, and behavior patterns use the{' '}
              {recap.sampledConversationCount.toLocaleString()} most recent eligible conversations
              in this range. The conversation total is exact.
            </p>
          ) : null}
        </>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        Temporary Chats and AGI Work runs are excluded. Reflect reads Managed Cloud activity only —
        Local Mode chats on this device are never part of a recap.
      </p>
    </div>
  );
}
