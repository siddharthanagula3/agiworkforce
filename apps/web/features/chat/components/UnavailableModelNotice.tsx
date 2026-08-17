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
      className="mb-2 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-500/25 dark:bg-amber-500/10"
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-amber-950 dark:text-amber-100">
          {substitution.requestedLabel} is no longer available
        </p>
        <p className="mt-0.5 text-amber-900/80 dark:text-amber-100/80">
          This chat was saved with it, so new messages will use {substitution.resolvedLabel}. Pick a
          different model below to override.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss retired model notice"
        className="rounded-md p-1 text-amber-800 transition-colors hover:bg-amber-200/60 hover:text-amber-950 dark:text-amber-200 dark:hover:bg-amber-500/20 dark:hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
