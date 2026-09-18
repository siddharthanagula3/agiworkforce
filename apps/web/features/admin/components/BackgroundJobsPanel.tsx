'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { evaluateJobHealth, type JobHealthAlert } from '@/lib/server/slo/job-health';
import { formatCount, formatDateTime } from '../lib/operator-format';

const ENDPOINT = '/api/admin/background-jobs';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';
const ACTION_CLASS =
  'rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-foreground/40 disabled:opacity-50';

interface QueueStats {
  queue: string;
  queued: number;
  running: number;
  dead: number;
  maxConcurrency: number;
  oldestQueuedAt: string | null;
  oldestQueuedAgeMs: number;
  stuck: number;
}

interface DeadJob {
  id: string;
  queue: string;
  kind: string;
  userId: string | null;
  organizationId: string | null;
  attempts: number;
  maxAttempts: number;
  deadReason: string | null;
  lastError: string | null;
  deadLetteredAt: string | null;
}

export default function BackgroundJobsPanel() {
  const [queues, setQueues] = useState<QueueStats[] | null>(null);
  const [dead, setDead] = useState<DeadJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const unhealthy: JobHealthAlert[] = useMemo(
    () => (queues === null ? [] : evaluateJobHealth(queues)),
    [queues],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
      }
      const payload = body as { queues: QueueStats[]; dead: DeadJob[] };
      setQueues(payload.queues);
      setDead(payload.dead);
    } catch (loadError) {
      setError(toUserMessage(loadError, 'Could not read the background job queues.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(jobId: string) {
    setRetrying(jobId);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ jobId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
      }
      setNotice('Queued again. It runs on the next drain.');
      await load();
    } catch (retryError) {
      setError(toUserMessage(retryError, 'Could not queue that job again.'));
    } finally {
      setRetrying(null);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="background-jobs-title">
      <div>
        <h2 id="background-jobs-title" className="text-sm font-medium">
          Background jobs
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Notifications, email, SIEM deliveries, scheduled erasures, upload cleanup and event
          triggers. A job that exhausts its attempts stops here with the reason it gave up, and
          nothing retries it until someone does.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {unhealthy.length > 0 ? (
        <div role="alert" className={`${CARD_CLASS} border-danger`}>
          <h3 className="text-sm font-medium text-danger">Queues that are not draining</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {unhealthy.map((alert) => (
              <li key={alert.queue}>
                <span className="font-mono text-xs">{alert.queue}</span>
                {` (${alert.severity}): ${alert.reasons.join('; ')}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {queues === null ? (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading the queues…</span>
        </div>
      ) : (
        <div className={TABLE_WRAP_CLASS}>
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-card text-left">
              <tr>
                <th className="p-3 font-medium">Queue</th>
                <th className="p-3 font-medium">Queued</th>
                <th className="p-3 font-medium">Running</th>
                <th className="p-3 font-medium">Limit</th>
                <th className="p-3 font-medium">Dead</th>
                <th className="p-3 font-medium">Stuck</th>
                <th className="p-3 font-medium">Oldest waiting</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((queue) => (
                <tr key={queue.queue} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{queue.queue}</td>
                  <td className="p-3 tabular-nums">{formatCount(queue.queued)}</td>
                  <td className="p-3 tabular-nums">{formatCount(queue.running)}</td>
                  <td className="p-3 tabular-nums text-muted-foreground">
                    {formatCount(queue.maxConcurrency)}
                  </td>
                  <td className="p-3 tabular-nums">{formatCount(queue.dead)}</td>
                  <td
                    className={`p-3 tabular-nums${queue.stuck > 0 ? ' text-danger' : ' text-muted-foreground'}`}
                  >
                    {formatCount(queue.stuck)}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {queue.oldestQueuedAt
                      ? formatDateTime(queue.oldestQueuedAt)
                      : 'nothing waiting'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={CARD_CLASS}>
        <h3 className="text-sm font-medium">Dead letters</h3>
        {dead.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing has given up. A job appears here after it exhausts its attempts or fails in a
            way that cannot succeed on a retry.
          </p>
        ) : (
          <div className={`mt-4 ${TABLE_WRAP_CLASS}`}>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-card text-left">
                <tr>
                  <th className="p-3 font-medium">Kind</th>
                  <th className="p-3 font-medium">Account</th>
                  <th className="p-3 font-medium">Attempts</th>
                  <th className="p-3 font-medium">Gave up</th>
                  <th className="p-3 font-medium">Reason</th>
                  <th className="p-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {dead.map((job) => (
                  <tr key={job.id} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">{job.kind}</td>
                    <td className="p-3 font-mono text-xs">
                      {job.organizationId ?? job.userId ?? 'platform'}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatCount(job.attempts)}/{formatCount(job.maxAttempts)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {job.deadLetteredAt ? formatDateTime(job.deadLetteredAt) : 'unknown'}
                    </td>
                    <td className="max-w-sm p-3 text-xs text-muted-foreground">
                      {job.deadReason ?? job.lastError ?? 'no reason recorded'}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => void retry(job.id)}
                        disabled={retrying === job.id}
                        className={ACTION_CLASS}
                      >
                        {retrying === job.id ? 'Queueing…' : 'Run again'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
