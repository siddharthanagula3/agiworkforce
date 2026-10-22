'use client';

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Video } from '@agiworkforce/icons';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import {
  SKILL_CAPTURE_LIMITS,
  getHostBridge,
  type SkillCaptureRecording,
  type SkillCaptureStatus,
} from '@agiworkforce/local-runtime-contract';
import {
  PRODUCT_NAMES,
  getPlanMaxAttachmentsPerMessage,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { toUserMessage } from '@/lib/user-error-message';
import {
  applyRecorderStatus,
  holdRecording,
  mountRecorder,
  refreshRecorder,
  setRecorderView,
  useRecorderState,
} from '../lib/recorder-store';
import {
  discardSkillCapture,
  openScreenRecordingSettings,
  saveSkillCapture,
  startSkillCapture,
  stopSkillCapture,
} from '../lib/skill-capture-client';
import {
  defaultSelection,
  formatClock,
  frameDataUrl,
  recordingFiles,
} from '../lib/recording-files';

export const RECORD_SKILL_TITLE = 'Record a skill';
export const SKILL_CAPTURE_CONSENT_TEXT = `${PRODUCT_NAMES.desktop} takes a screenshot every few seconds until you stop. Clicks, typing and audio are not recorded. Screenshots stay on this device until you save or discard the recording.`;
const LIMITS_NOTE = `Recording stops after ${SKILL_CAPTURE_LIMITS.maxDurationMs / 60_000} minutes or ${SKILL_CAPTURE_LIMITS.maxFrames} screenshots.`;
const START_LABEL = 'Start recording';
const STARTING_LABEL = 'Waiting for your answer';
const CANCEL_LABEL = 'Cancel';
const OPEN_SETTINGS_LABEL = 'Open System Settings';
const RECORDING_LABEL = 'Recording';
const STOPPED_LABEL = 'Recording stopped';
const DONE_LABEL = 'Done';
const DISCARD_LABEL = 'Discard';
const REVIEW_LABEL = 'Review';
const CLOSE_LABEL = 'Close';
const CHOOSE_LABEL = 'Choose screenshots';
const DRAFT_LABEL = 'Draft a skill';
const SUMMARY_TITLE = 'Your recording';
const REVIEW_TITLE = 'Choose screenshots';
const NOTHING_CAPTURED = 'Nothing was captured, so there is nothing to keep.';
const ACTION_FAILED = 'The desktop app did not respond.';
const DISCARD_TITLE = 'Discard this recording?';
const CAPTURE_BAR_LABEL = 'Skill recording';
const ELAPSED_TICK_MS = 1_000;

const STOP_REASON: Partial<Record<NonNullable<SkillCaptureStatus['stoppedBy']>, string>> = {
  limit: 'It reached the recording limit.',
  'screen-locked': 'It stopped when the screen locked or the computer slept.',
};

const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

function screenshotCount(count: number): string {
  return `${count} ${count === 1 ? 'screenshot' : 'screenshots'}`;
}

function discardTime(discardsAt: number): string {
  return new Date(discardsAt).toLocaleTimeString(undefined, TIME_FORMAT);
}

export function retentionNote(discardsAt: number | null): string | null {
  if (discardsAt === null) return null;
  return `If you do not save it, it is deleted at ${discardTime(discardsAt)}.`;
}

function stopReason(status: SkillCaptureStatus): string | null {
  if (status.failure) return status.failure;
  return status.stoppedBy ? (STOP_REASON[status.stoppedBy] ?? null) : null;
}

function skippedNote(skips: number): string | null {
  if (skips === 0) return null;
  return `${screenshotCount(skips)} skipped while a password field was active.`;
}

function discardDescription(count: number): string {
  return `The ${screenshotCount(count)} in this recording will be deleted from this device. This cannot be undone.`;
}

function hostIsMac(): boolean {
  return getHostBridge()?.platform.includes('darwin') === true;
}

export interface SkillRecorderProps {
  id: string;
  onDraftSkill: (files: File[]) => void;
  draftBlockedReason: string | null;
}

export function SkillRecorder({ id, onDraftSkill, draftBlockedReason }: SkillRecorderProps) {
  const recorder = useRecorderState();
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => mountRecorder(id), [id]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(toUserMessage(cause, ACTION_FAILED));
    } finally {
      setBusy(false);
    }
  }, []);

  const discard = useCallback(
    () =>
      run(async () => {
        applyRecorderStatus(await discardSkillCapture());
        holdRecording(null);
      }),
    [run],
  );

  const confirmDiscard = useCallback(
    (count: number) => {
      if (count === 0) {
        void discard();
        return;
      }
      confirm({
        title: DISCARD_TITLE,
        description: discardDescription(count),
        confirmLabel: DISCARD_LABEL,
        destructive: true,
        onConfirm: discard,
      });
    },
    [confirm, discard],
  );

  if (recorder.presenter !== id) return null;

  const status = recorder.status;
  const frameCount = recorder.recording?.frames.length ?? status?.frameCount ?? 0;

  return (
    <>
      <ConsentDialog
        open={recorder.view === 'consent'}
        onClose={() => {
          setError(null);
          setRecorderView('none');
        }}
      />
      {status && status.phase !== 'idle' && recorder.view === 'none' && !recorder.recording && (
        <CaptureBar
          status={status}
          busy={busy}
          error={error}
          onDone={() => void run(async () => applyRecorderStatus(await stopSkillCapture()))}
          onReview={() => {
            setError(null);
            setRecorderView('summary');
          }}
          onDiscard={() => confirmDiscard(status.frameCount)}
        />
      )}
      {status && (
        <SummaryDialog
          open={recorder.view === 'summary' && status.phase === 'stopped'}
          status={status}
          busy={busy}
          error={error}
          onClose={() => {
            setError(null);
            setRecorderView('none');
          }}
          onChoose={() =>
            void run(async () => {
              const recording = await saveSkillCapture();
              holdRecording(recording);
              await refreshRecorder();
            })
          }
          onDiscard={() => confirmDiscard(status.frameCount)}
        />
      )}
      {recorder.recording && (
        <ReviewDialog
          open={recorder.view === 'review'}
          recording={recorder.recording}
          draftBlockedReason={draftBlockedReason}
          onDiscard={() =>
            confirm({
              title: DISCARD_TITLE,
              description: discardDescription(frameCount),
              confirmLabel: DISCARD_LABEL,
              destructive: true,
              onConfirm: () => holdRecording(null),
            })
          }
          onDraft={(indexes) => {
            const recording = recorder.recording;
            if (!recording) return;
            onDraftSkill(recordingFiles(recording, indexes));
            holdRecording(null);
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}

function ConsentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [starting, setStarting] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; permission: boolean } | null>(null);

  useEffect(() => {
    if (open) setRefusal(null);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (starting) return;
    setStarting(true);
    setRefusal(null);
    try {
      const outcome = await startSkillCapture();
      if (outcome.started) {
        applyRecorderStatus(outcome.status);
        return;
      }
      applyRecorderStatus(outcome.status);
      if (outcome.reason === 'declined') {
        onClose();
        return;
      }
      setRefusal({ message: outcome.message, permission: outcome.reason === 'permission' });
    } catch (cause) {
      setRefusal({ message: toUserMessage(cause, ACTION_FAILED), permission: false });
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !starting) onClose();
      }}
    >
      <DialogContent className="w-[min(92vw,30rem)]" closeLabel={CLOSE_LABEL}>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 shrink-0" aria-hidden="true" />
              {RECORD_SKILL_TITLE}
            </DialogTitle>
            <DialogDescription>{SKILL_CAPTURE_CONSENT_TEXT}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{LIMITS_NOTE}</p>
          {refusal && (
            <div role="alert" className="grid gap-2 text-sm text-danger">
              <p>{refusal.message}</p>
              {refusal.permission && hostIsMac() && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start rounded-full"
                  onClick={() => void openScreenRecordingSettings().catch(() => undefined)}
                >
                  {OPEN_SETTINGS_LABEL}
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              className="rounded-full"
              disabled={starting}
              onClick={onClose}
            >
              {CANCEL_LABEL}
            </Button>
            <Button type="submit" className="rounded-full" disabled={starting} autoFocus>
              {starting && <Spinner size="sm" />}
              {starting ? STARTING_LABEL : START_LABEL}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useElapsed(status: SkillCaptureStatus): number {
  const [now, setNow] = useState(() => Date.now());
  const running = status.phase === 'recording';
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, [running]);
  if (!running || status.startedAt === null) return status.durationMs;
  return Math.max(status.durationMs, now - status.startedAt);
}

function CaptureBar({
  status,
  busy,
  error,
  onDone,
  onReview,
  onDiscard,
}: {
  status: SkillCaptureStatus;
  busy: boolean;
  error: string | null;
  onDone: () => void;
  onReview: () => void;
  onDiscard: () => void;
}) {
  const elapsed = useElapsed(status);
  const recording = status.phase === 'recording';
  const retention = retentionNote(status.discardsAt);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <aside
      aria-label={CAPTURE_BAR_LABEL}
      className="fixed bottom-6 left-1/2 z-[var(--z-popover)] flex w-[min(92vw,34rem)] -translate-x-1/2 flex-col gap-1 rounded-full border border-border bg-popover px-4 py-2 text-popover-foreground shadow-e4"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'h-2.5 w-2.5 shrink-0 rounded-full',
            recording ? 'bg-danger motion-safe:animate-pulse' : 'bg-muted-foreground',
          )}
        />
        <p role="status" aria-live="polite" className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">{recording ? RECORDING_LABEL : STOPPED_LABEL}</span>
          <span className="text-muted-foreground">
            {' '}
            · {screenshotCount(status.frameCount)} · {formatClock(elapsed)}
          </span>
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-full"
          disabled={busy}
          onClick={onDiscard}
        >
          {DISCARD_LABEL}
        </Button>
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          disabled={busy}
          onClick={recording ? onDone : onReview}
        >
          {recording ? DONE_LABEL : REVIEW_LABEL}
        </Button>
      </div>
      {!recording && retention && <p className="px-5 text-sm text-muted-foreground">{retention}</p>}
      {error && (
        <p role="alert" className="px-5 text-sm text-danger">
          {error}
        </p>
      )}
    </aside>,
    document.body,
  );
}

function SummaryDialog({
  open,
  status,
  busy,
  error,
  onClose,
  onChoose,
  onDiscard,
}: {
  open: boolean;
  status: SkillCaptureStatus;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onChoose: () => void;
  onDiscard: () => void;
}) {
  const empty = status.frameCount === 0;
  const reason = stopReason(status);
  const skipped = skippedNote(status.secureInputSkips);
  const retention = retentionNote(status.discardsAt);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="w-[min(92vw,30rem)]" closeLabel={CLOSE_LABEL}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 shrink-0" aria-hidden="true" />
            {SUMMARY_TITLE}
          </DialogTitle>
          <DialogDescription>
            {empty
              ? NOTHING_CAPTURED
              : `${screenshotCount(status.frameCount)} over ${formatClock(status.durationMs)}.`}
          </DialogDescription>
        </DialogHeader>
        {(reason || skipped || (!empty && retention)) && (
          <div className="grid gap-1 text-sm text-muted-foreground">
            {reason && <p>{reason}</p>}
            {skipped && <p>{skipped}</p>}
            {!empty && retention && <p>{retention}</p>}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          {empty ? (
            <Button type="button" className="rounded-full" disabled={busy} onClick={onDiscard}>
              {CLOSE_LABEL}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                className="rounded-full"
                disabled={busy}
                onClick={onDiscard}
              >
                {DISCARD_LABEL}
              </Button>
              <Button type="button" className="rounded-full" disabled={busy} onClick={onChoose}>
                {busy && <Spinner size="sm" />}
                {CHOOSE_LABEL}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  open,
  recording,
  draftBlockedReason,
  onDiscard,
  onDraft,
}: {
  open: boolean;
  recording: SkillCaptureRecording;
  draftBlockedReason: string | null;
  onDiscard: () => void;
  onDraft: (indexes: number[]) => void;
}) {
  const tier = useBillingStore((store) => normalizeBillingPlanTier(store.subscription?.tier));
  const limit = getPlanMaxAttachmentsPerMessage(tier);
  const frameCount = recording.frames.length;
  const initial = useMemo(() => defaultSelection(frameCount, limit), [frameCount, limit]);
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set(initial));
  const hintId = useId();

  useEffect(() => {
    setSelected(new Set(initial));
  }, [initial]);

  const full = selected.size >= limit;
  const toggle = (index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else if (next.size < limit) next.add(index);
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDiscard();
      }}
    >
      <DialogContent className="w-[min(96vw,48rem)]" closeLabel={DISCARD_LABEL}>
        <DialogHeader>
          <DialogTitle>{REVIEW_TITLE}</DialogTitle>
          <DialogDescription id={hintId}>
            {`Pick up to ${limit}. They are attached to your message and sent only when you send it.`}
          </DialogDescription>
        </DialogHeader>
        <ul
          aria-describedby={hintId}
          className="grid max-h-[50dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3"
        >
          {recording.frames.map((frame, index) => {
            const isSelected = selected.has(index);
            const label = `Screenshot ${index + 1} at ${formatClock(frame.offsetMs)}`;
            return (
              <li key={index}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={label}
                  disabled={!isSelected && full}
                  onClick={() => toggle(index)}
                  className={cn(
                    'relative block w-full overflow-hidden rounded-lg border-2 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                    isSelected ? 'border-foreground' : 'border-border',
                  )}
                >
                  <img
                    src={frameDataUrl(frame)}
                    alt=""
                    width={frame.width}
                    height={frame.height}
                    className="block h-auto w-full"
                  />
                  {isSelected && (
                    <span className="absolute end-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                  <span className="block px-2 py-1 text-start text-sm text-muted-foreground">
                    {formatClock(frame.offsetMs)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {draftBlockedReason && (
          <p role="alert" className="text-sm text-muted-foreground">
            {draftBlockedReason}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="secondary" className="rounded-full" onClick={onDiscard}>
            {DISCARD_LABEL}
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={selected.size === 0 || draftBlockedReason !== null}
            onClick={() => onDraft([...selected])}
          >
            {DRAFT_LABEL}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
