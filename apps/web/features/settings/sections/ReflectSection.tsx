'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@agiworkforce/ui';
import {
  MANAGED_CLOUD_REFLECT_PATH,
  ManagedCloudReflectRecapSchema,
  type ManagedCloudReflectRange,
  type ManagedCloudReflectRecap,
} from '@agiworkforce/cloud-contracts';
import { RefreshCw } from 'lucide-react';
import { SettingsPageLink, SettingsSectionLink } from '../components/SettingsSectionLink';
import { toUserMessage } from '@/lib/user-error-message';

const RANGE_OPTIONS: ReadonlyArray<{ value: ManagedCloudReflectRange; label: string }> = [
  { value: '30d', label: 'Past 30 days' },
  { value: '90d', label: 'Past 3 months' },
  { value: '180d', label: 'Past 6 months' },
  { value: '365d', label: 'Past year' },
];

function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function formatDate(dateKey: string | null): string {
  if (!dateKey) return ', ';
  const date = new Date(`${dateKey}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function formatHour(hour: number | null): string {
  if (hour === null) return ', ';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2026, 0, 1, hour));
}

async function responseError(response: Response): Promise<{ code?: string; message: string }> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  return {
    code: body.error?.code,
    message: body.error?.message ?? 'Reflect could not load right now.',
  };
}

export function ReflectSection() {
  const timezone = useMemo(() => browserTimezone(), []);
  const [range, setRange] = useState<ManagedCloudReflectRange>('30d');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [recap, setRecap] = useState<ManagedCloudReflectRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [memoryRequired, setMemoryRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setRecap(null);
      setError(null);
      setMemoryRequired(false);
      try {
        const query = new URLSearchParams({ range, timezone });
        const response = await fetch(`${MANAGED_CLOUD_REFLECT_PATH}?${query}`, {
          credentials: 'include',
          signal,
        });
        if (!response.ok) {
          const failure = await responseError(response);
          if (response.status === 409 && failure.code === 'memory_required') {
            setRecap(null);
            setMemoryRequired(true);
            return;
          }
          throw new Error(failure.message);
        }
        setRecap(ManagedCloudReflectRecapSchema.parse(await response.json()));
      } catch (loadError) {
        if (signal.aborted) return;
        setRecap(null);
        setError(toUserMessage(loadError, 'Reflect could not load.'));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [range, timezone],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshVersion]);

  const visibleActivity = recap?.dailyActivity.slice(-60) ?? [];
  const maxDailyCount = Math.max(
    1,
    ...(recap?.dailyActivity.map((day) => day.conversationCount) ?? []),
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reflect</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            See patterns in how you use AGI, without scores or judgment. Your recap is built only
            when you open this page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Reflect range"
            value={range}
            disabled={loading}
            onChange={(event) => setRange(event.target.value as ManagedCloudReflectRange)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => setRefreshVersion((value) => value + 1)}
            aria-label="Refresh recap"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      {loading && !recap ? (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-8" role="status">
          <p className="text-sm font-medium text-foreground">Building your recap...</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reading eligible conversation activity for this account.
          </p>
        </div>
      ) : null}

      {memoryRequired ? (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-6">
          <h2 className="text-base font-semibold text-foreground">Memory is off</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Reflect uses the same account chat history controls as Memory. Turn on Memory and
            Generate from past chats to create a recap.
          </p>
          <SettingsSectionLink
            section="capabilities"
            className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
          >
            Open Capabilities settings
          </SettingsSectionLink>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6" role="alert">
          <h2 className="text-base font-semibold text-foreground">Reflect could not load</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setRefreshVersion((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {recap?.stats.totalConversations === 0 ? (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-8">
          <h2 className="text-lg font-semibold text-foreground">{recap.summary.headline}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{recap.summary.body}</p>
        </div>
      ) : null}

      {recap && recap.stats.totalConversations > 0 ? (
        <>
          <section className="rounded-xl border border-border/50 bg-muted/10 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {recap.period.label}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {recap.summary.headline}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{recap.summary.body}</p>
          </section>

          <section aria-labelledby="reflect-time-heading" className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="reflect-time-heading" className="text-lg font-semibold text-foreground">
                  Your time with AGI
                </h2>
                <p className="text-xs text-muted-foreground">
                  Conversation starts, not screen time.
                </p>
              </div>
              <SettingsSectionLink
                section="time-focus"
                className="inline-flex min-h-6 items-center text-sm text-primary hover:underline"
              >
                Set quiet hours and breaks
              </SettingsSectionLink>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border/50 p-4">
                <strong data-reflect-stat="conversations" className="text-2xl text-foreground">
                  {recap.stats.totalConversations}
                </strong>
                <p className="mt-1 text-xs text-muted-foreground">Conversations</p>
              </div>
              <div className="rounded-lg border border-border/50 p-4">
                <strong className="text-2xl text-foreground">{recap.stats.activeDays}</strong>
                <p className="mt-1 text-xs text-muted-foreground">Active days</p>
              </div>
              <div className="rounded-lg border border-border/50 p-4">
                <strong className="text-2xl text-foreground">
                  {formatDate(recap.stats.mostActiveDay)}
                </strong>
                <p className="mt-1 text-xs text-muted-foreground">Most active day</p>
              </div>
              <div className="rounded-lg border border-border/50 p-4">
                <strong className="text-2xl text-foreground">
                  {formatHour(recap.stats.peakHour)}
                </strong>
                <p className="mt-1 text-xs text-muted-foreground">Peak start time</p>
              </div>
            </div>
            {/* A bare div is role=generic, which PROHIBITS aria-label, every one
                of these bars was silently dropped by assistive tech. The chart
                is one image with a summary; the per-day figures stay reachable
                as text rather than as sixty separate announcements. */}
            <div
              role="img"
              aria-label={`Conversation activity across ${visibleActivity.length} active days, peaking at ${maxDailyCount} conversations in a day`}
              className="flex h-28 items-end gap-1 rounded-lg border border-border/50 p-3"
            >
              {visibleActivity.map((day) => (
                <div
                  key={day.date}
                  aria-hidden="true"
                  title={`${formatDate(day.date)}: ${day.conversationCount}`}
                  className="min-w-1 flex-1 rounded-t bg-primary/70"
                  style={{
                    height: `${Math.max(8, (day.conversationCount / maxDailyCount) * 100)}%`,
                  }}
                />
              ))}
            </div>
            <ul className="sr-only">
              {visibleActivity.map((day) => (
                <li key={day.date}>
                  {formatDate(day.date)}: {day.conversationCount} conversations
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="reflect-topics-heading" className="space-y-4">
            <h2 id="reflect-topics-heading" className="text-lg font-semibold text-foreground">
              What you spent time on
            </h2>
            <div>
              {recap.topics.map((topic, index) => (
                <div
                  key={topic.id}
                  className={`py-3 ${index === 0 ? '' : 'border-t border-border/50'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{topic.label}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{topic.description}</p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {topic.percentage}%
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${topic.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="reflect-insights-heading" className="space-y-4">
            <div>
              <h2 id="reflect-insights-heading" className="text-lg font-semibold text-foreground">
                Expanding your skills
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Observations and optional next steps, not a performance score.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {recap.insights.map((insight) => (
                <article key={insight.dimension} className="rounded-lg border border-border/50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {insight.dimension}
                  </p>
                  <h3 className="mt-2 text-sm font-semibold text-foreground">{insight.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{insight.observation}</p>
                  <p className="mt-3 text-sm text-foreground">{insight.nextStep}</p>
                  {insight.href ? (
                    <SettingsPageLink
                      href={insight.href}
                      className="mt-3 inline-flex text-xs text-primary hover:underline"
                    >
                      Open {insight.title}
                    </SettingsPageLink>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          {recap.sampled ? (
            <p className="text-xs text-muted-foreground" role="note">
              Activity, topic, and behavior patterns use the{' '}
              {recap.sampledConversationCount.toLocaleString()} most recent eligible conversations
              in this range. The conversation total is exact.
            </p>
          ) : null}
        </>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        Temporary Chats and AGI Work runs are excluded. Reflect returns activity statistics and
        broad topic labels to the browser, not message text, and viewing it does not use model
        quota.
      </p>
    </div>
  );
}
