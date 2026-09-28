import { useId, useState, type FormEvent } from 'react';
import {
  MAX_CLOUD_AGENT_RUN_STEER_LENGTH,
  isCloudAgentRunSteerable,
  type CloudAgentRun,
} from '@agiworkforce/cloud-contracts';
import { Button, Spinner } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import { toUserMessageWithStatus } from '../../lib/network-error';
import { isLiveTaskState, runWorkState } from './task-display';

export interface TaskSteerSectionProps {
  run: CloudAgentRun;
  onSteer?(message: string): Promise<void>;
}

export function TaskSteerSection({ run, onSteer }: TaskSteerSectionProps) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queued = run.pendingSteers ?? [];
  const steerable = Boolean(onSteer) && isCloudAgentRunSteerable(run);
  if (!steerable && queued.length === 0) return null;
  const live = isLiveTaskState(runWorkState(run));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !onSteer || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSteer(message);
      setDraft('');
    } catch (err) {
      setError(
        toUserMessageWithStatus(
          err,
          'Your message was not sent. The task keeps working without it.',
        ),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      data-testid="task-steer"
      aria-label="Message the agent"
      className={cn('border-t bg-card p-4', steerable && 'sticky bottom-0 z-[var(--z-control)]')}
    >
      {queued.length > 0 ? (
        <ul aria-label="Queued messages" className="mb-2 flex flex-col gap-1.5">
          {queued.map((steer) => (
            <li
              key={steer.id}
              className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5"
            >
              <p className="whitespace-pre-wrap break-words text-xs text-foreground">
                {steer.text}
              </p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                {live
                  ? 'Queued. The agent reads it at its next step.'
                  : 'The task stopped before the agent read this.'}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {steerable ? (
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor={inputId} className="sr-only">
            Message for the agent
          </label>
          <textarea
            id={inputId}
            data-testid="task-steer-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            disabled={sending}
            rows={2}
            maxLength={MAX_CLOUD_AGENT_RUN_STEER_LENGTH}
            placeholder="Message the agent to add instructions or change course"
            className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-caption text-muted-foreground">
              It reads your message at its next step and keeps its progress.
            </p>
            <Button
              type="submit"
              size="sm"
              className="h-7 shrink-0 text-xs"
              disabled={sending || draft.trim().length === 0}
            >
              {sending ? <Spinner size="sm" aria-label="Sending your message" /> : null}
              Send
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mt-1.5 text-xs text-danger-text">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
