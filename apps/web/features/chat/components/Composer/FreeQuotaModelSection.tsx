'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import {
  FREE_QUOTA_CATEGORIES,
  FREE_QUOTA_STATUS_LABELS,
  type FreeQuotaCatalogue,
} from '@/features/models/lib/free-quota-types';

export function FreeQuotaModelSection({
  enabled,
  selectedId,
  onSelect,
  children,
}: {
  enabled: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  children?: ReactNode;
}) {
  const [catalogue, setCatalogue] = useState<FreeQuotaCatalogue | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'hidden' | 'error'>('loading');
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('chat');
  const [attempt, setAttempt] = useState(0);
  const quotaExperimentEnabled = enabled && process.env.NODE_ENV !== 'production';
  useEffect(() => {
    if (!quotaExperimentEnabled) return;
    const controller = new AbortController();
    setStatus('loading');
    void fetch('/api/models/free-quota', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if ([401, 403, 404].includes(response.status)) {
          setStatus('hidden');
          return;
        }
        if (!response.ok) throw new Error('Could not load free models');
        const result: FreeQuotaCatalogue | null = await response.json();
        setCatalogue(result);
        setStatus(result ? 'ready' : 'hidden');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [attempt, quotaExperimentEnabled]);
  if (!children && (!quotaExperimentEnabled || status === 'hidden')) return null;
  const models =
    catalogue?.models.filter(
      (model) =>
        model.category === category &&
        model.displayName.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <div className="border-b border-[var(--chat-border)]">
      <button
        type="button"
        data-picker-row=""
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted/60"
      >
        Free <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {expanded && (
        <div className="space-y-2 px-2 pb-2">
          <p className="px-1 text-xs text-muted-foreground">
            Free models and available promotional quota.
          </p>
          {children}
          {quotaExperimentEnabled && status === 'loading' && <Spinner size="sm" />}
          {quotaExperimentEnabled && status === 'error' && (
            <button
              type="button"
              className="px-1 text-sm text-foreground underline"
              onClick={() => setAttempt(attempt + 1)}
            >
              Retry loading free models
            </button>
          )}
          {quotaExperimentEnabled && catalogue && status === 'ready' && (
            <>
              <select
                aria-label="Free model category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-9 w-full rounded-md border border-[var(--chat-border)] bg-background px-2 text-sm text-foreground"
              >
                {Object.entries(FREE_QUOTA_CATEGORIES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="search"
                aria-label="Search free models"
                placeholder="Search free models"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 w-full rounded-md border border-[var(--chat-border)] bg-transparent px-2 text-sm text-foreground"
              />
              <div className="max-h-60 overflow-y-auto" aria-label="Free models">
                {models.map((model) => {
                  const selectable =
                    model.status === 'ready' || model.status === 'account_check_required';
                  return (
                    <button
                      key={model.key}
                      type="button"
                      data-picker-row=""
                      disabled={!selectable}
                      aria-pressed={selectedId === model.key}
                      onClick={() => onSelect(model.key)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:enabled:bg-muted/60 disabled:cursor-not-allowed"
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block break-words text-xs font-medium ${selectable ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                          {model.displayName}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {selectable
                            ? `Free quota · ${model.expiresOn ? `expires ${model.expiresOn}` : 'limited allocation'}`
                            : FREE_QUOTA_STATUS_LABELS[model.status]}
                        </span>
                      </span>
                      {selectedId === model.key && (
                        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
                {models.length === 0 && (
                  <p className="px-2 py-3 text-xs text-muted-foreground">No free models match.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
