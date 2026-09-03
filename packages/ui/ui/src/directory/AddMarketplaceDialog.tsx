'use client';

import { GitBranch, Store } from 'lucide-react';
import { useState } from 'react';

import { cn } from '../cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/Dialog';
import { useConfirmAction } from '../primitives/ConfirmAction';
import { Spinner } from '../primitives/Spinner';
import {
  ADD_MARKETPLACE_BROWSE_BODY,
  ADD_MARKETPLACE_BROWSE_TITLE,
  ADD_MARKETPLACE_CANCEL_LABEL,
  ADD_MARKETPLACE_DONE_LABEL,
  ADD_MARKETPLACE_EMPTY_LABEL,
  ADD_MARKETPLACE_LABEL,
  ADD_MARKETPLACE_REF_LABEL,
  ADD_MARKETPLACE_REMOVE_CONFIRM_BODY,
  ADD_MARKETPLACE_REMOVE_CONFIRM_TITLE,
  ADD_MARKETPLACE_REMOVE_LABEL,
  ADD_MARKETPLACE_REPOSITORY_BODY,
  ADD_MARKETPLACE_REPOSITORY_TITLE,
  ADD_MARKETPLACE_SUBMIT_LABEL,
  ADD_MARKETPLACE_SYNCED_LABEL,
  ADD_MARKETPLACE_URL_LABEL,
  GENERIC_ERROR_COPY,
} from './constants';
import { DIRECTORY_FOCUS_RING } from './styles';
import type { DirectoryMarketplaceInput, DirectoryMarketplaceResult } from './types';

type Step = 'choose' | 'form' | 'result';

function ChoiceRow({
  icon,
  title,
  body,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors motion-reduce:transition-none hover:bg-muted',
        DIRECTORY_FOCUS_RING,
      )}
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

export function AddMarketplaceDialog({
  open,
  onClose,
  onSubmit,
  onBrowseSources,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: DirectoryMarketplaceInput) => Promise<DirectoryMarketplaceResult>;
  onBrowseSources?: () => Promise<void> | void;
  onRemove?: (id: string) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>('choose');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DirectoryMarketplaceResult | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const reset = () => {
    setStep('choose');
    setRepositoryUrl('');
    setRef('');
    setBusy(false);
    setError(null);
    setResult(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await onSubmit({
        repositoryUrl: repositoryUrl.trim(),
        ...(ref.trim() ? { ref: ref.trim() } : {}),
      });
      setResult(created);
      setStep('result');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : GENERIC_ERROR_COPY);
    } finally {
      setBusy(false);
    }
  };

  const requestRemove = () => {
    if (!result || !onRemove) return;
    confirm({
      title: ADD_MARKETPLACE_REMOVE_CONFIRM_TITLE,
      description: ADD_MARKETPLACE_REMOVE_CONFIRM_BODY,
      confirmLabel: ADD_MARKETPLACE_REMOVE_LABEL,
      destructive: true,
      onConfirm: async () => {
        await onRemove(result.id);
        close();
      },
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !busy) close();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{ADD_MARKETPLACE_LABEL}</DialogTitle>
            <DialogDescription>
              {step === 'result' ? ADD_MARKETPLACE_SYNCED_LABEL : ADD_MARKETPLACE_REPOSITORY_BODY}
            </DialogDescription>
          </DialogHeader>

          {step === 'choose' ? (
            <div className="flex flex-col gap-2">
              {onBrowseSources ? (
                <ChoiceRow
                  icon={<Store aria-hidden className="size-5" />}
                  title={ADD_MARKETPLACE_BROWSE_TITLE}
                  body={ADD_MARKETPLACE_BROWSE_BODY}
                  onSelect={() => {
                    void onBrowseSources();
                    close();
                  }}
                />
              ) : null}
              <ChoiceRow
                icon={<GitBranch aria-hidden className="size-5" />}
                title={ADD_MARKETPLACE_REPOSITORY_TITLE}
                body={ADD_MARKETPLACE_REPOSITORY_BODY}
                onSelect={() => setStep('form')}
              />
            </div>
          ) : null}

          {step === 'form' ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {ADD_MARKETPLACE_URL_LABEL}
                <input
                  type="url"
                  required
                  value={repositoryUrl}
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  className={cn(
                    'h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground',
                    DIRECTORY_FOCUS_RING,
                  )}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {ADD_MARKETPLACE_REF_LABEL}
                <input
                  type="text"
                  value={ref}
                  onChange={(event) => setRef(event.target.value)}
                  className={cn(
                    'h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground',
                    DIRECTORY_FOCUS_RING,
                  )}
                />
              </label>
              {error ? (
                <p role="alert" className="text-xs text-danger">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <button
                  type="button"
                  onClick={close}
                  className={cn(
                    'inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted',
                    DIRECTORY_FOCUS_RING,
                  )}
                >
                  {ADD_MARKETPLACE_CANCEL_LABEL}
                </button>
                <button
                  type="submit"
                  disabled={busy || repositoryUrl.trim().length === 0}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
                    DIRECTORY_FOCUS_RING,
                  )}
                >
                  {busy ? <Spinner size="sm" aria-label={ADD_MARKETPLACE_SUBMIT_LABEL} /> : null}
                  {ADD_MARKETPLACE_SUBMIT_LABEL}
                </button>
              </DialogFooter>
            </form>
          ) : null}

          {step === 'result' && result ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-foreground">{result.name}</p>
              {result.entries.length === 0 ? (
                <p className="text-xs text-muted-foreground">{ADD_MARKETPLACE_EMPTY_LABEL}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {result.entries.map((entry) => (
                    <li key={entry.id} className="bg-card px-3 py-2">
                      <p className="text-sm text-foreground">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                    </li>
                  ))}
                </ul>
              )}
              <DialogFooter>
                {onRemove ? (
                  <button
                    type="button"
                    onClick={requestRemove}
                    className={cn(
                      'inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-danger hover:bg-muted',
                      DIRECTORY_FOCUS_RING,
                    )}
                  >
                    {ADD_MARKETPLACE_REMOVE_LABEL}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={close}
                  className={cn(
                    'inline-flex min-h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90',
                    DIRECTORY_FOCUS_RING,
                  )}
                >
                  {ADD_MARKETPLACE_DONE_LABEL}
                </button>
              </DialogFooter>
            </div>
          ) : null}

          {step === 'choose' ? (
            <DialogFooter>
              <button
                type="button"
                onClick={close}
                className={cn(
                  'inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted',
                  DIRECTORY_FOCUS_RING,
                )}
              >
                {ADD_MARKETPLACE_CANCEL_LABEL}
              </button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
