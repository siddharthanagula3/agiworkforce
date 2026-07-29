import { useEffect, useRef } from 'react';
import { Loader2, Mic2 } from 'lucide-react';

export interface CloudVoiceActionDialogProps {
  action: string | null;
  error: string | null;
  isExecuting: boolean;
  requiresComputerUseConsent: boolean;
  onApprove: () => void;
  onUseAsText: () => void;
  onCancel: () => void;
}

export function CloudVoiceActionDialog({
  action,
  error,
  isExecuting,
  requiresComputerUseConsent,
  onApprove,
  onUseAsText,
  onCancel,
}: CloudVoiceActionDialogProps) {
  const approveButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!action) return;
    approveButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isExecuting) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [action, isExecuting, onCancel]);

  if (!action) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-voice-action-title"
      aria-describedby="cloud-voice-action-description"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cancel voice action"
        className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm"
        disabled={isExecuting}
        onClick={onCancel}
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface-base)] p-5 text-[var(--chat-text-primary)] shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-[var(--chat-accent-primary)]/10 p-2 text-[var(--chat-accent-primary)]">
            <Mic2 aria-hidden="true" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="cloud-voice-action-title" className="text-base font-semibold">
              Review voice action
            </h2>
            <p
              id="cloud-voice-action-description"
              className="mt-1 text-sm text-[var(--chat-text-secondary)]"
            >
              AGI understood this as a request to control your desktop. Nothing runs until you
              approve it.
            </p>
          </div>
        </div>

        <div className="my-4 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-3 text-sm leading-6">
          {action}
        </div>

        <p className="text-xs leading-5 text-[var(--chat-text-muted)]">
          Running allows AGI to capture the screen and interact with apps for this task. Sensitive
          or destructive steps remain subject to native safety checks.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isExecuting}
            className="rounded-lg px-3 py-2 text-sm text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onUseAsText}
            disabled={isExecuting}
            className="rounded-lg border border-[var(--chat-border)] px-3 py-2 text-sm hover:bg-[var(--chat-surface-hover)] disabled:opacity-50"
          >
            Use as text
          </button>
          <button
            ref={approveButtonRef}
            type="button"
            onClick={onApprove}
            disabled={isExecuting}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--chat-accent-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {isExecuting && <Loader2 aria-hidden="true" size={15} className="animate-spin" />}
            {isExecuting
              ? 'Running action…'
              : requiresComputerUseConsent
                ? 'Enable desktop control and run'
                : 'Run this action'}
          </button>
        </div>
      </div>
    </div>
  );
}
