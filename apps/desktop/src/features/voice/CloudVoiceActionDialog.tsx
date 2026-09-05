import { useEffect, useRef } from 'react';
import type { ToolApprovalRequest } from '@agiworkforce/types';
import { Loader2, Mic2, ShieldAlert } from 'lucide-react';

import {
  describeApprovalReason,
  describeApprovalRisk,
  isApprovalAnswerable,
} from '../../lib/toolApprovalCopy';

export interface CloudVoiceActionDialogProps {
  action: string | null;
  approval?: ToolApprovalRequest | null;
  error: string | null;
  isExecuting: boolean;
  isStopping: boolean;
  isRecovery: boolean;
  requiresComputerUseConsent: boolean;
  onApprove: () => void;
  onUseAsText: () => void;
  onCancel: () => void | Promise<void>;
}

export function CloudVoiceActionDialog({
  action,
  approval = null,
  error,
  isExecuting,
  isStopping,
  isRecovery,
  requiresComputerUseConsent,
  onApprove,
  onUseAsText,
  onCancel,
}: CloudVoiceActionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const approveButtonRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const isStoppingRef = useRef(isStopping);
  onCancelRef.current = onCancel;
  isStoppingRef.current = isStopping;
  const isOpen = Boolean(action);
  const refusedByHarness = approval !== null && !isApprovalAnswerable(approval);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialButton =
      isRecovery || isExecuting ? cancelButtonRef.current : approveButtonRef.current;
    if (initialButton && !initialButton.disabled) {
      initialButton.focus();
    } else {
      dialogRef.current?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isStoppingRef.current) {
        void onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]',
        ) ?? [],
      ).filter((element) => element.tabIndex >= 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (
        event.shiftKey &&
        (activeElement === first || !dialogRef.current?.contains(activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === last || !dialogRef.current?.contains(activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isExecuting, isOpen, isRecovery]);

  if (!action) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      tabIndex={-1}
      aria-modal="true"
      aria-labelledby="cloud-voice-action-title"
      aria-describedby="cloud-voice-action-description"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={isRecovery ? 'Retry stopping previous desktop action' : 'Cancel voice action'}
        className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm"
        disabled={isStopping}
        onClick={() => void onCancel()}
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface-base)] p-5 text-[var(--chat-text-primary)] shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-[var(--chat-accent-primary)]/10 p-2 text-[var(--chat-accent-primary)]">
            <Mic2 aria-hidden="true" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="cloud-voice-action-title" className="text-base font-semibold">
              {isRecovery ? 'Stop previous desktop action' : 'Review voice action'}
            </h2>
            <p
              id="cloud-voice-action-description"
              className="mt-1 text-sm text-[var(--chat-text-secondary)]"
            >
              {isRecovery
                ? 'Native desktop control has not confirmed shutdown. New actions remain blocked until Stop is acknowledged.'
                : 'AGI understood this as a request to control your desktop. Nothing runs until you approve it.'}
            </p>
          </div>
        </div>

        <div className="my-4 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-3 text-sm leading-6">
          {action}
        </div>

        {approval && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-3"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--chat-text-primary)]">
              <ShieldAlert aria-hidden="true" size={14} />
              <span>{describeApprovalRisk(approval)}</span>
              <span className="text-[var(--chat-text-muted)]">{approval.tool}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--chat-text-secondary)]">
              {describeApprovalReason(approval)}
            </p>
          </div>
        )}

        <p className="text-xs leading-5 text-[var(--chat-text-muted)]">
          {isRecovery
            ? "This recovery view does not reveal the previous account's instruction. Retry Stop to release desktop control safely."
            : 'Running allows AGI to capture the screen and interact with apps for this task. Sensitive or destructive steps remain subject to native safety checks.'}
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={() => void onCancel()}
            disabled={isStopping}
            className="rounded-lg px-3 py-2 text-sm text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
          >
            {isStopping ? 'Stopping…' : isRecovery ? 'Retry Stop' : isExecuting ? 'Stop' : 'Cancel'}
          </button>
          {!isRecovery && (
            <>
              <button
                type="button"
                onClick={onUseAsText}
                disabled={isExecuting || isStopping}
                className="rounded-lg border border-[var(--chat-border)] px-3 py-2 text-sm hover:bg-[var(--chat-surface-hover)] disabled:opacity-50"
              >
                Use as text
              </button>
              <button
                ref={approveButtonRef}
                type="button"
                onClick={onApprove}
                disabled={isExecuting || isStopping || refusedByHarness}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--chat-accent-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {(isExecuting || isStopping) && (
                  <Loader2 aria-hidden="true" size={15} className="animate-spin" />
                )}
                {isStopping
                  ? 'Waiting for desktop control to stop…'
                  : isExecuting
                    ? 'Running action…'
                    : requiresComputerUseConsent
                      ? 'Enable desktop control and run'
                      : 'Run this action'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
