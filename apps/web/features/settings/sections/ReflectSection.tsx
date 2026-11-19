'use client';

import { useMemo, useState } from 'react';
import { AgiMark, Button, translateUiPlural } from '@agiworkforce/ui';
import { type ManagedCloudReflectRange } from '@agiworkforce/cloud-contracts';
import { RefreshCw } from 'lucide-react';
import { SettingsPageLink, SettingsSectionLink } from '../components/SettingsSectionLink';
import { useReflectRecap } from '../hooks/use-reflect-recap';
import { conversationHref } from '@/shared/components/layout/sidebar-session-actions';

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
  if (!dateKey) return 'None';
  const date = new Date(`${dateKey}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function describeOngoingWork(item: {
  projectName: string | null;
  spanDays: number;
  followUps: number;
  lastActiveAt: string;
}): string {
  const span = item.spanDays > 1 ? `Active over ${item.spanDays} days` : 'Active on one day';
  const followUps = translateUiPlural('settings', 'counts.followUps', item.followUps, {
    one: '{{count}} follow-up',
    other: '{{count}} follow-ups',
  });
  const lastActive = new Date(item.lastActiveAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return [item.projectName, span, followUps, `last active ${lastActive}`]
    .filter(Boolean)
    .join(' · ');
}

const TOPIC_SHADES = [
  'bg-foreground',
  'bg-foreground/75',
  'bg-foreground/55',
  'bg-foreground/40',
  'bg-foreground/30',
  'bg-foreground/20',
  'bg-foreground/15',
  'bg-foreground/10',
] as const;

function topicShade(index: number): string {
  return TOPIC_SHADES[Math.min(index, TOPIC_SHADES.length - 1)] ?? '';
}

function formatHour(hour: number | null): string {
  if (hour === null) return 'None';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2026, 0, 1, hour));
}

export function ReflectSection({ active = true }: { active?: boolean } = {}) {
  const timezone = useMemo(() => browserTimezone(), []);
  const [range, setRange] = useState<ManagedCloudReflectRange>('30d');
  const { recap, loading, memoryRequired, error, refresh, canRefresh } = useReflectRecap(
    range,
    timezone,
    active,
  );

  const topicsByShare = useMemo(
    () => (recap?.topics ?? []).slice().sort((left, right) => right.percentage - left.percentage),
    [recap],
  );
  const visibleActivity = recap?.dailyActivity.slice(-60) ?? [];
  const maxDailyCount = Math.max(1, ...visibleActivity.map((day) => day.conversationCount));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground max-md:font-medium">Reflect</h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Patterns in how you use AGI, without scores. Built only when you open this page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Reflect range"
            value={range}
            disabled={loading || !canRefresh}
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
            disabled={loading || !canRefresh}
            onClick={refresh}
            aria-label="Refresh recap"
          >
            {loading ? (
              <AgiMark spinning className="me-2 h-4 w-4" aria-hidden="true" />
            ) : (
              <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
            )}
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
          <h2 className="text-h4 text-foreground">Memory is off</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Turn on Memory and Save memories from chats to create a recap.
          </p>
          <SettingsSectionLink
            section="personalization"
            className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
          >
            Open Personalization settings
          </SettingsSectionLink>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6" role="alert">
          <h2 className="text-h4 text-foreground">Reflect could not load</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          {canRefresh ? (
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={refresh}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}

      {recap?.stats.totalConversations === 0 ? (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-8">
          <h2 className="text-h3 text-foreground">{recap.summary.headline}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{recap.summary.body}</p>
        </div>
      ) : null}

      {recap && recap.stats.totalConversations > 0 ? (
        <>
          <section className="rounded-xl border border-border/50 bg-muted/10 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {recap.period.label}
            </p>
            <h2 className="mt-2 text-h1 text-foreground">{recap.summary.headline}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{recap.summary.body}</p>
          </section>

          <section aria-labelledby="reflect-time-heading" className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="reflect-time-heading" className="text-h3 text-foreground">
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
                  className="min-w-1 flex-1 rounded-t-compact bg-primary/70"
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
            <h2 id="reflect-topics-heading" className="text-h3 text-foreground">
              What you spent time on
            </h2>
            <div
              role="img"
              aria-label={`Share of conversations by topic: ${topicsByShare
                .map((topic) => `${topic.label} ${topic.percentage}%`)
                .join(', ')}`}
              className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
            >
              {topicsByShare.map((topic, index) => (
                <div
                  key={topic.id}
                  aria-hidden="true"
                  data-reflect-topic-segment={topic.id}
                  className={`h-full min-w-1 ${topicShade(index)}`}
                  style={{ flexGrow: topic.percentage, flexBasis: 0 }}
                />
              ))}
            </div>
            <ul aria-label="Topics by share">
              {topicsByShare.map((topic, index) => (
                <li
                  key={topic.id}
                  className={`flex items-start gap-3 py-3 ${index === 0 ? '' : 'border-t border-border/50'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${topicShade(index)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-foreground">{topic.label}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{topic.description}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {topic.percentage}%
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {recap.ongoingWork && recap.ongoingWork.length > 0 ? (
            <section aria-labelledby="reflect-ongoing-heading" className="space-y-4">
              <h2 id="reflect-ongoing-heading" className="text-h3 text-foreground">
                Work in progress
              </h2>
              <ul>
                {recap.ongoingWork.map((item, index) => (
                  <li
                    key={item.conversationId}
                    className={`py-3 ${index === 0 ? '' : 'border-t border-border/50'}`}
                  >
                    <SettingsPageLink
                      href={conversationHref(item.conversationId)}
                      className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {item.title}
                    </SettingsPageLink>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {describeOngoingWork(item)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="reflect-insights-heading" className="space-y-4">
            <div>
              <h2 id="reflect-insights-heading" className="text-h3 text-foreground">
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
                  <h3 className="mt-2 text-h5 text-foreground">{insight.title}</h3>
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
        Excludes Temporary Chats and Work runs. Shows stats, topics and chat titles, never message
        text, and uses no quota.
      </p>
    </div>
  );
}
