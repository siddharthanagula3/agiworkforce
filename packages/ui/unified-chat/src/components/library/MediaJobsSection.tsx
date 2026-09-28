import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, RotateCcw, X } from 'lucide-react';
import { MediaJobListResponseSchema, type MediaJobEntry } from '@agiworkforce/cloud-contracts';
import { Button, Spinner } from '@agiworkforce/ui';
import { httpStatusMessage } from '../../lib/network-error';

export interface MediaJobsTransport {
  listMediaJobs(): Promise<Response>;
  cancelMediaJob(job: MediaJobEntry): Promise<Response>;
  retryMediaJob(job: MediaJobEntry): Promise<Response>;
  openConversation?: (conversationId: string) => void;
}

const POLL_INTERVAL_MS = 5_000;
const HEADING = 'Generations';
const LOAD_FAILED_COPY = 'Your generations could not be loaded.';
const ACTION_FAILED_COPY = 'That did not go through. Try again.';

const STATUS_LABEL: Record<MediaJobEntry['status'], string> = {
  queued: 'Queued',
  running: 'Generating',
  failed: 'Failed',
  done: 'Done',
  cancelled: 'Cancelled',
};

const KIND_LABEL: Record<MediaJobEntry['kind'], string> = { image: 'Image', video: 'Video' };

const STATUS_CLASS: Record<MediaJobEntry['status'], string> = {
  queued: 'text-[var(--chat-text-secondary)]',
  running: 'text-[var(--chat-text-secondary)]',
  failed: 'text-[var(--chat-destructive-text)]',
  done: 'text-[var(--chat-text-secondary)]',
  cancelled: 'text-[var(--chat-text-muted)]',
};

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function inFlight(job: MediaJobEntry): boolean {
  return job.status === 'queued' || job.status === 'running';
}

function statusText(job: MediaJobEntry): string {
  return job.status === 'running' && job.progress !== null
    ? `${STATUS_LABEL.running} ${job.progress}%`
    : STATUS_LABEL[job.status];
}

export function MediaJobsSection({ transport }: { transport: MediaJobsTransport }) {
  const [jobs, setJobs] = useState<MediaJobEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await transport.listMediaJobs();
      if (!response.ok) {
        setError(httpStatusMessage(response.status) ?? LOAD_FAILED_COPY);
        return;
      }
      const parsed = MediaJobListResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        setError(LOAD_FAILED_COPY);
        return;
      }
      setJobs(parsed.data.jobs);
      setError(null);
    } catch {
      setError(LOAD_FAILED_COPY);
    }
  }, [transport]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = jobs?.some(inFlight) === true;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  const act = useCallback(
    async (job: MediaJobEntry, run: (job: MediaJobEntry) => Promise<Response>) => {
      setBusyId(job.id);
      try {
        const response = await run(job);
        if (!response.ok) setError(httpStatusMessage(response.status) ?? ACTION_FAILED_COPY);
        await load();
      } catch {
        setError(ACTION_FAILED_COPY);
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const shown = (jobs ?? []).filter((job) => job.status !== 'done');
  if (shown.length === 0 && error === null) return null;

  return (
    <section
      aria-labelledby="library-media-jobs-heading"
      data-testid="library-media-jobs"
      className="flex flex-col gap-2"
    >
      <h2
        id="library-media-jobs-heading"
        className="text-sm font-medium text-[var(--chat-text-primary)]"
      >
        {HEADING}
      </h2>
      {error ? (
        <p role="status" className="text-xs text-[var(--chat-destructive-text)]">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-[var(--chat-border-subtle)] rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]">
        {shown.map((job) => {
          const conversationId = job.conversation_id;
          return (
            <li key={job.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="line-clamp-2 text-sm text-[var(--chat-text-primary)]">{job.prompt}</p>
                <p className="text-xs text-[var(--chat-text-muted)]">
                  {KIND_LABEL[job.kind]} · {job.model} ·{' '}
                  {DATE_FORMAT.format(new Date(job.created_at))}
                </p>
                {job.error ? (
                  <p className="text-xs text-[var(--chat-destructive-text)]">{job.error}</p>
                ) : null}
              </div>
              <span
                className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${STATUS_CLASS[job.status]}`}
              >
                {inFlight(job) ? <Spinner size="sm" className="h-3.5 w-3.5" /> : null}
                {statusText(job)}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {conversationId && transport.openConversation ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => transport.openConversation?.(conversationId)}
                  >
                    <MessageSquare className="me-1.5 h-3.5 w-3.5" aria-hidden />
                    Open chat
                  </Button>
                ) : null}
                {job.retryable ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === job.id}
                    onClick={() => void act(job, transport.retryMediaJob)}
                  >
                    <RotateCcw className="me-1.5 h-3.5 w-3.5" aria-hidden />
                    Try again
                  </Button>
                ) : null}
                {job.cancellable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === job.id}
                    onClick={() => void act(job, transport.cancelMediaJob)}
                  >
                    <X className="me-1.5 h-3.5 w-3.5" aria-hidden />
                    Cancel
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
