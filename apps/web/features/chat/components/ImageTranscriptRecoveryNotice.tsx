'use client';

import { AlertTriangle, RefreshCw, X } from 'lucide-react';

export type ImageTranscriptRecoveryPhase = 'prompt' | 'result';

interface ImageTranscriptRecoveryNoticeProps {
  phase: ImageTranscriptRecoveryPhase;
  resultKind?: 'asset' | 'generation-failure';
  retrying: boolean;
  onRetry: () => void | Promise<void>;
  onDismiss: () => void;
}

export function ImageTranscriptRecoveryNotice({
  phase,
  resultKind,
  retrying,
  onRetry,
  onDismiss,
}: ImageTranscriptRecoveryNoticeProps) {
  const isPromptFailure = phase === 'prompt';
  const isGenerationFailure = phase === 'result' && resultKind === 'generation-failure';

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex shrink-0 items-start gap-3 border-b border-warning-fill/30 bg-warning-fill/10 px-4 py-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-warning-text">
          {isPromptFailure
            ? 'Image request was not sent'
            : isGenerationFailure
              ? 'Image failure state not saved'
              : 'Image saved, chat card not saved'}
        </p>
        <p className="mt-0.5 text-warning-text">
          {isPromptFailure
            ? "AGI couldn't save your prompt, so no credits were used and no image provider was called."
            : isGenerationFailure
              ? 'Retry saves the failure state and its wait time to this chat without calling an image provider.'
              : 'The image is safe in Library. Retry saves this same image to the chat without generating or charging again.'}
        </p>
        <button
          type="button"
          disabled={retrying}
          onClick={() => void onRetry()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-warning-fill/30 bg-surface-elevated px-2.5 py-1 text-xs font-medium text-warning-text transition-colors hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {retrying
            ? 'Saving…'
            : isPromptFailure
              ? 'Retry save and create image'
              : isGenerationFailure
                ? 'Retry saving failure state'
                : 'Retry saving chat card'}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        disabled={retrying}
        className="rounded-md p-1 text-warning-text transition-colors hover:bg-warning-fill/10 disabled:opacity-50 dark:hover:text-white"
        aria-label="Dismiss image save recovery"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
