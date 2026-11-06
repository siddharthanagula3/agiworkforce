'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from '@agiworkforce/ui';
import type { DeveloperRequestLog, DeveloperRequestLogStep } from '@agiworkforce/cloud-contracts';

import { useDeveloperRequestLogs, type RequestLogFetcher } from '../hooks/use-developer-request-logs';

export type { RequestLogFetcher } from '../hooks/use-developer-request-logs';

const STEP_LABELS: Record<DeveloperRequestLogStep['name'], string> = {
  received: 'Received',
  provider_started: 'Sent to the model',
  provider_answered: 'Model answered',
  delivered: 'Delivered to your client',
  settled: 'Billed',
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  released: 'Not billed',
  declined: 'Declined',
  outcome_unknown: 'Outcome unknown',
  reserving: 'In progress',
  reserved: 'In progress',
  provider_started: 'In progress',
};

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
}

function elapsedMs(from: string, to: string): number {
  return Math.max(0, new Date(to).getTime() - new Date(from).getTime());
}

function totalMs(log: DeveloperRequestLog): number | null {
  const first = log.steps[0];
  const last = log.steps.at(-1);
  return first && last && first !== last ? elapsedMs(first.at, last.at) : null;
}

function LogDetail({ log }: { log: DeveloperRequestLog }) {
  const facts: Array<[string, string]> = [
    ['Requested model', log.model],
    ...(log.servedModel && log.servedModel !== log.model
      ? ([['Served by', log.servedModel]] as Array<[string, string]>)
      : []),
    ...(log.errorCode ? ([['Error', log.errorCode]] as Array<[string, string]>) : []),
    ...(
      [
        ['Input tokens', log.inputTokens],
        ['Output tokens', log.outputTokens],
        ['Reasoning tokens', log.reasoningTokens],
        ['Cached input tokens', log.cacheReadTokens],
        ['Web searches', log.webSearchRequests],
        ['Pages fetched', log.webFetchRequests],
        ['Code runs', log.codeExecutionRuns],
      ] as Array<[string, number | null]>
    )
      .filter((entry): entry is [string, number] => entry[1] !== null && entry[1] > 0)
      .map(([label, value]) => [label, value.toLocaleString()] as [string, string]),
    ...(log.credits !== null
      ? ([['Credits', log.credits.toLocaleString()]] as Array<[string, string]>)
      : []),
  ];
  const start = log.steps[0]?.at;
  return (
    <div className="grid gap-4 border-t border-border px-3 py-3 sm:grid-cols-2">
      <div>
        <h4 className="text-xs font-medium text-muted-foreground">Timeline</h4>
        <ol className="mt-2 flex flex-col gap-1.5">
          {log.steps.map((step) => (
            <li key={step.name} className="flex justify-between gap-3 text-sm">
              <span className="text-foreground">{STEP_LABELS[step.name]}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {start ? `+${elapsedMs(start, step.at).toLocaleString()} ms` : ''}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all font-mono text-xs leading-5 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function RequestLogsPanel({
  fetchLogs,
}: {
  fetchLogs?: RequestLogFetcher;
}) {
  const history = useDeveloperRequestLogs(fetchLogs);
  const { logs, nextBefore, error, loadingMore } = history;
  const [expanded, setExpanded] = useState<{ viewKey: object; id: string | null } | null>(null);
  const openId = expanded?.viewKey === history.viewKey ? expanded.id : null;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">Request logs</CardTitle>
        <CardDescription>
          Every request your API keys made, newest first, with its timeline, tokens, server-side
          tool use and cost. Prompts and answers are not stored.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.isUnavailable ? (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-danger">
              {history.requiresReload
                ? 'Reload this page to confirm your workspace before loading request logs.'
                : 'Request logs are unavailable until your account and workspace are ready.'}
            </p>
            {!history.requiresReload ? (
              <Button variant="outline" size="sm" onClick={history.retry}>Try again</Button>
            ) : null}
          </div>
        ) : error ? (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={history.retry}>
              Try again
            </Button>
          </div>
        ) : logs === null ? (
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <span className="text-sm text-muted-foreground">Loading requests…</span>
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No API requests yet. Requests made with your API keys show up here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {logs.map((log) => {
              const open = openId === log.id;
              const total = totalMs(log);
              return (
                <li key={log.id}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setExpanded({ viewKey: history.viewKey, id: open ? null : log.id })}
                    className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3 py-2 text-start hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
                  >
                    <span className="truncate font-mono text-xs text-foreground">
                      {log.servedModel ?? log.model}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {STATUS_LABELS[log.status] ?? log.status}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {formatTime(log.createdAt)}
                      {log.apiKeyName ? ` · ${log.apiKeyName}` : ''}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {total !== null ? `${total.toLocaleString()} ms` : ''}
                    </span>
                  </button>
                  {open ? <LogDetail log={log} /> : null}
                </li>
              );
            })}
          </ul>
        )}
        {nextBefore && logs ? (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingMore}
              aria-busy={loadingMore}
              onClick={history.loadMore}
            >
              {loadingMore ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
              Show older
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
