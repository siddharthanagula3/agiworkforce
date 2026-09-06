'use client';

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
} from '@agiworkforce/ui';
import { Camera, ImagePlus, MessageSquareText, X } from 'lucide-react';
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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const CAPTURE_SETTLE_MS = 350;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.readAsDataURL(file);
  });
}

async function captureScreenToDataUrl(): Promise<string> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => window.setTimeout(resolve, CAPTURE_SETTLE_MS));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not draw the capture');
    context.drawImage(video, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

export function ComposerFeedbackDialog({
  conversationId,
  messageId,
  runId,
  finishReason,
  variant = 'general',
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: ComposerFeedbackDialogProps) {
  const detailsId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [captureState, setCaptureState] = useState<'idle' | 'capturing'>('idle');
  const canCaptureScreen =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function';
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

  const attachFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!SCREENSHOT_TYPES.includes(file.type)) {
      setErrorMessage('Attach a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setErrorMessage('Screenshots are limited to 4 MiB.');
      return;
    }
    try {
      setScreenshot(await readFileAsDataUrl(file));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(toUserMessage(error, 'Could not read the image.'));
    }
  };

  const captureScreen = async () => {
    if (captureState === 'capturing') return;
    setCaptureState('capturing');
    try {
      setScreenshot(await captureScreenToDataUrl());
      setErrorMessage(null);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) {
        setErrorMessage(toUserMessage(error, 'Could not capture the screen.'));
      }
    } finally {
      setCaptureState('idle');
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
          ...(screenshot && !isSafetyAppeal ? { screenshot: { data_url: screenshot } } : {}),
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
      setScreenshot(null);
    } catch (error) {
      setSubmitState('error');
      setErrorMessage(toUserMessage(error, 'Could not send feedback. Please try again.'));
    }
  };

  return (
    <>
      {hideTrigger ? null : isTaskFeedback ? (
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
              ) : (
                <div className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Screenshot</span>
                  {screenshot ? (
                    <div className="relative overflow-hidden rounded-xl border border-border">
                      <img
                        src={screenshot}
                        alt="Screenshot attached to this feedback"
                        className="block max-h-48 w-full object-cover object-top"
                      />
                      <button
                        type="button"
                        onClick={() => setScreenshot(null)}
                        aria-label="Remove screenshot"
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/90 text-foreground"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {canCaptureScreen ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void captureScreen()}
                          isLoading={captureState === 'capturing'}
                        >
                          <Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          Capture screen
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Upload image
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={SCREENSHOT_TYPES.join(',')}
                        className="sr-only"
                        onChange={(event) => void attachFile(event)}
                      />
                    </div>
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Optional. A screenshot goes to the AGI team with your note; blur anything
                    private first.
                  </p>
                </div>
              )}

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
