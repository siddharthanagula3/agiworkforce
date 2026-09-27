'use client';

import { AlertTriangle, X } from 'lucide-react';
import type { ModelSubstitution } from '@shared/stores/model-store';

interface UnavailableModelNoticeProps {
  substitution: ModelSubstitution | null;
  onDismiss: () => void;
}

export function UnavailableModelNotice({ substitution, onDismiss }: UnavailableModelNoticeProps) {
  if (!substitution) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="unavailable-model-notice"
      data-requested-model={substitution.requestedId}
      data-resolved-model={substitution.resolvedId}
      className="mb-2 flex items-start gap-3 rounded-xl border border-warning-fill/30 bg-warning-fill/10 px-4 py-2.5 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-warning-text">
          {substitution.requestedLabel} is no longer available
        </p>
        <p className="mt-0.5 text-warning-text">
          This chat was saved with it, so new messages will use {substitution.resolvedLabel}. Pick a
          different model below to override.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss retired model notice"
        className="rounded-md p-1 text-warning-text transition-colors hover:bg-warning-fill/10 dark:hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
