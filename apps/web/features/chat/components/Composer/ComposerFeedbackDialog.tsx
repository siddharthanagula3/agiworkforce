'use client';

import { useId, useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
} from '@agiworkforce/ui';
import { MessageSquareText } from 'lucide-react';
import { getCsrfToken } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { AGI_WORK_FEEDBACK_LABEL, AGI_WORK_LABEL } from '../../lib/agi-work';

type FeedbackKind = 'bug' | 'feature' | 'general';
type SubmitState = 'idle' | 'submitting' | 'success' | 'error';
type FeedbackVariant = 'general' | 'safety-appeal' | 'task';

const FEEDBACK_KINDS: Array<{ value: FeedbackKind; label: string }> = [
  { value: 'general', label: 'General feedback' },
  { value: 'bug', label: 'Something is broken' },
  { value: 'feature', label: 'Feature request' },
];

interface ComposerFeedbackDialogProps {
  conversationId?: string | null;
  messageId?: string | null;
  runId?: string | null;
  finishReason?: 'refusal' | 'content_filter' | null;
  variant?: FeedbackVariant;
  triggerClassName?: string;
}

export function ComposerFeedbackDialog({
  conversationId,
  messageId,
  runId,
  finishReason,
  variant = 'general',
  triggerClassName,
}: ComposerFeedbackDialogProps) {
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('general');
  const [message, setMessage] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSafetyAppeal = variant === 'safety-appeal';
  const isTaskFeedback = variant === 'task';

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setSubmitState('idle');
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || submitState === 'submitting') return;

    setSubmitState('submitting');
    setErrorMessage(null);

    try {
      const csrfToken = await getCsrfToken();
      const selectedKind = isSafetyAppeal
        ? 'Incorrect safety refusal'
        : isTaskFeedback
          ? `${AGI_WORK_LABEL} task`
          : (FEEDBACK_KINDS.find((option) => option.value === kind)?.label ?? 'Feedback');
      const response = await fetch('/api/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          subject: `${selectedKind} · Web chat`,
          message: trimmedMessage,
          metadata: {
            source: 'web',
            platform: 'web',
            version: process.env['NEXT_PUBLIC_APP_VERSION'] ?? 'unknown',
            user_agent: navigator.userAgent,
            page_path: window.location.pathname,
            ...(conversationId ? { conversation_id: conversationId } : {}),
            ...(isSafetyAppeal ? { feedback_context: 'safety_refusal' } : {}),
            ...(isTaskFeedback ? { feedback_context: 'task_feedback' } : {}),
            ...(isTaskFeedback && runId ? { run_id: runId } : {}),
            ...((isSafetyAppeal || isTaskFeedback) && messageId ? { message_id: messageId } : {}),
            ...(isSafetyAppeal && finishReason ? { finish_reason: finishReason } : {}),
          },
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string } | string;
          message?: string;
        } | null;
        const serverMessage =
          typeof body?.error === 'string'
            ? body.error
            : (body?.error?.message ?? body?.message ?? null);
        throw new Error(serverMessage || 'Could not send feedback. Please try again.');
      }

      setSubmitState('success');
      setMessage('');
    } catch (error) {
      setSubmitState('error');
      setErrorMessage(toUserMessage(error, 'Could not send feedback. Please try again.'));
    }
  };

  return (
    <>
      {isTaskFeedback ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={AGI_WORK_FEEDBACK_LABEL}
          title={AGI_WORK_FEEDBACK_LABEL}
          className={triggerClassName}
        >
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-inline-link="true"
          className="underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isSafetyAppeal ? 'Report issue' : 'Feedback'}
        </button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="w-[min(94vw,30rem)] border-border/70 bg-background sm:rounded-2xl"
          closeLabel="Close feedback dialog"
        >
          <DialogHeader>
            <DialogTitle>
              {isSafetyAppeal
                ? 'Report an incorrect refusal'
                : isTaskFeedback
                  ? AGI_WORK_FEEDBACK_LABEL
                  : 'Share feedback'}
            </DialogTitle>
            <DialogDescription>
              {isSafetyAppeal
                ? 'Tell us why this request should have been allowed. Your report helps us improve safety decisions.'
                : isTaskFeedback
                  ? `Tell us how this ${AGI_WORK_LABEL} task went, what it got right, and where it went wrong.`
                  : 'Tell us what worked, what did not, or what you would like AGI to do next.'}
            </DialogDescription>
          </DialogHeader>

          {submitState === 'success' ? (
            <div className="space-y-4 py-2">
              <p role="status" className="text-sm text-foreground">
                {isSafetyAppeal
                  ? 'Thanks, your report was recorded.'
                  : 'Thanks, your feedback was sent.'}
              </p>
              <div className="flex justify-end">
                <Button type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              {!isSafetyAppeal ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-foreground">Feedback type</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {FEEDBACK_KINDS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={kind === option.value}
                        onClick={() => setKind(option.value)}
                        className={
                          kind === option.value
                            ? 'rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-left text-xs font-medium text-foreground'
                            : 'rounded-lg border border-border bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground'
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {isSafetyAppeal ? (
                <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  We attach only technical identifiers for this refusal. Your prompt and response
                  are not included.
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor={detailsId}>Details</Label>
                <textarea
                  id={detailsId}
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  required
                  maxLength={10_000}
                  rows={6}
                  autoFocus
                  placeholder={
                    isSafetyAppeal
                      ? 'Explain why this request was appropriate and what response you expected.'
                      : 'What happened, what did you expect, or what should we build?'
                  }
                  className="w-full resize-y rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {isSafetyAppeal
                    ? 'We include your app version, browser type, current AGI page, and refusal identifiers. Conversation content is not attached.'
                    : isTaskFeedback
                      ? 'We include your app version, browser type, current AGI page, and the identifiers for this task run so we can trace it. Your prompt and conversation content are not attached.'
                      : 'We include your app version, browser type, and current AGI page so we can diagnose the report. Your prompt and conversation content are not attached.'}
                </p>
              </div>

              {errorMessage ? (
                <p role="alert" className="text-sm text-danger">
                  {errorMessage}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!message.trim() || submitState === 'submitting'}
                  isLoading={submitState === 'submitting'}
                >
                  {isSafetyAppeal ? 'Submit report' : 'Send feedback'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
