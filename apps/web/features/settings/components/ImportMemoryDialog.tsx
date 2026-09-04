'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  cn,
} from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { MAX_IMPORT_ITEMS, MAX_IMPORT_TEXT_CHARS } from '@/lib/memory/import-parser';

const IMPORT_ENDPOINT = '/api/memory/import';
const IMPORT_FILE_ACCEPT = '.txt,.json,text/plain,application/json';
const IMPORT_SOURCE_PRESETS = ['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'Other'] as const;
type ImportSourcePreset = (typeof IMPORT_SOURCE_PRESETS)[number];

interface ImportPreviewItem {
  content: string;
  normalizedKey: string;
  duplicate: boolean;
}

interface DryRunResponse {
  mode: 'dry-run';
  sourceName: string;
  sourceValue: string;
  format: 'json' | 'text';
  items: ImportPreviewItem[];
  totalCandidates: number;
  itemsTruncated: boolean;
}

export interface ImportedMemory {
  id: string;
  content: string;
  category: string | null;
  source: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CommitResponse {
  mode: 'commit';
  sourceName: string;
  sourceValue: string;
  insertedCount: number;
  skippedDuplicateCount: number;
  memories: ImportedMemory[];
}

type DialogStep = 'compose' | 'preview' | 'done';

export interface ImportMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (memories: ImportedMemory[]) => void;
}

export function useImportMemoryDialog() {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
  };
}

interface RequestErrorPayload {
  error?: { message?: string };
}

async function requestImport<T>(
  mode: 'dry-run' | 'commit',
  payload: Record<string, unknown>,
): Promise<T> {
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch(IMPORT_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode, ...payload }),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data as RequestErrorPayload | null)?.error?.message;
    const error = new Error(message ?? `HTTP ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export function ImportMemoryDialog({ open, onOpenChange, onImported }: ImportMemoryDialogProps) {
  const [step, setStep] = useState<DialogStep>('compose');
  const [text, setText] = useState('');
  const [sourcePreset, setSourcePreset] = useState<ImportSourcePreset>('ChatGPT');
  const [customSourceName, setCustomSourceName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DryRunResponse | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const resetState = useCallback(() => {
    setStep('compose');
    setText('');
    setSourcePreset('ChatGPT');
    setCustomSourceName('');
    setFileError(null);
    setPreviewing(false);
    setPreviewError(null);
    setPreview(null);
    setSelected(new Set());
    setCommitting(false);
    setCommitError(null);
    setCommitResult(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && committing) return;
      onOpenChange(next);
      if (!next) resetState();
    },
    [committing, onOpenChange, resetState],
  );

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_IMPORT_TEXT_CHARS) {
      setFileError('That file is too large to import.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setText(reader.result);
    };
    reader.onerror = () => setFileError('Could not read that file.');
    reader.readAsText(file);
  }, []);

  const resolvedSourceName = sourcePreset === 'Other' ? customSourceName : sourcePreset;

  const handlePreview = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPreviewError(null);
    setPreviewing(true);
    try {
      const result = await requestImport<DryRunResponse>('dry-run', {
        text: trimmed,
        sourceName: resolvedSourceName,
      });
      setPreview(result);
      setSelected(
        new Set(
          result.items
            .map((item, index) => (item.duplicate ? -1 : index))
            .filter((index) => index !== -1),
        ),
      );
      setStep('preview');
    } catch (error) {
      setPreviewError(toUserMessage(error, 'Could not read that text.'));
    } finally {
      setPreviewing(false);
    }
  }, [text, resolvedSourceName]);

  const toggleItem = useCallback((index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const selectedCount = selected.size;
  const totalPreviewItems = preview?.items.length ?? 0;
  const allSelected = totalPreviewItems > 0 && selectedCount === totalPreviewItems;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleSelectAll = useCallback(() => {
    if (!preview) return;
    setSelected(allSelected ? new Set() : new Set(preview.items.map((_, index) => index)));
  }, [allSelected, preview]);

  const handleCommit = useCallback(async () => {
    if (!preview) return;
    const items = preview.items
      .filter((_, index) => selected.has(index))
      .map((item) => item.content);
    if (items.length === 0) return;
    setCommitError(null);
    setCommitting(true);
    try {
      const result = await requestImport<CommitResponse>('commit', {
        items,
        sourceName: preview.sourceName,
      });
      setCommitResult(result);
      setStep('done');
      onImported?.(result.memories);
    } catch (error) {
      setCommitError(toUserMessage(error, 'Could not import these memories.'));
    } finally {
      setCommitting(false);
    }
  }, [preview, selected, onImported]);

  const charCount = text.length;
  const overCharLimit = charCount > MAX_IMPORT_TEXT_CHARS;

  const doneSummary = useMemo(() => {
    if (!commitResult) return '';
    const count = commitResult.insertedCount;
    const noun = count === 1 ? 'memory' : 'memories';
    return `Imported ${count} ${noun} from ${commitResult.sourceName}.`;
  }, [commitResult]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[min(96vw,40rem)]"
        onEscapeKeyDown={(event) => {
          if (committing) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (committing) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Import memory from other AI providers</DialogTitle>
          <DialogDescription>
            Paste memories exported from another assistant, or upload a text or JSON file. Review
            what was found before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {step === 'compose' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="import-memory-source" className="text-sm font-medium text-foreground">
                Source
              </label>
              <select
                id="import-memory-source"
                value={sourcePreset}
                onChange={(event) => setSourcePreset(event.target.value as ImportSourcePreset)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                {IMPORT_SOURCE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
              {sourcePreset === 'Other' && (
                <input
                  type="text"
                  value={customSourceName}
                  onChange={(event) => setCustomSourceName(event.target.value)}
                  placeholder="Assistant name"
                  aria-label="Custom source name"
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="import-memory-text" className="text-sm font-medium text-foreground">
                  Paste memories
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Upload file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMPORT_FILE_ACCEPT}
                  className="sr-only"
                  aria-label="Upload a memory export file"
                  onChange={handleFileChange}
                />
              </div>
              <textarea
                id="import-memory-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={8}
                placeholder="- Prefers concise answers&#10;- Works as a backend engineer&#10;- Lives in Berlin"
                className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div
                className={cn('text-xs', overCharLimit ? 'text-danger' : 'text-muted-foreground')}
              >
                {charCount.toLocaleString()} / {MAX_IMPORT_TEXT_CHARS.toLocaleString()}
              </div>
            </div>

            {fileError && (
              <p role="alert" className="text-xs text-danger">
                {fileError}
              </p>
            )}
            {previewError && (
              <p role="alert" className="text-xs text-danger">
                {previewError}
              </p>
            )}
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  ref={(node) => {
                    selectAllRef.current = node;
                    if (node) node.indeterminate = someSelected;
                  }}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all memories"
                />
                Select all
              </label>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {selectedCount} of {totalPreviewItems} selected
              </span>
            </div>

            {preview.itemsTruncated && (
              <p className="text-xs text-muted-foreground">
                Only the first {MAX_IMPORT_ITEMS.toLocaleString()} memories are shown, out of{' '}
                {preview.totalCandidates.toLocaleString()} found.
              </p>
            )}

            <ul
              aria-label="Memories to import"
              className="flex max-h-72 flex-col gap-1.5 overflow-y-auto"
            >
              {preview.items.map((item, index) => (
                <li
                  key={item.normalizedKey + index}
                  className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggleItem(index)}
                    aria-label={`Import: ${item.content}`}
                    className="mt-0.5"
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-sm text-foreground">{item.content}</span>
                    {item.duplicate && (
                      <span className="w-fit rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        Already saved
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {commitError && (
              <p role="alert" className="text-xs text-danger">
                {commitError}
              </p>
            )}
          </div>
        )}

        {step === 'done' && commitResult && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">{doneSummary}</p>
            {commitResult.skippedDuplicateCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {commitResult.skippedDuplicateCount} already matched a memory just imported from
                this source and were not duplicated.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'compose' && (
            <>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={text.trim().length === 0 || overCharLimit || previewing}
                className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {previewing && <Spinner size="sm" />}
                Preview
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setStep('compose')}
                disabled={committing}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={selectedCount === 0 || committing}
                className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {committing && <Spinner size="sm" />}
                Import {selectedCount > 0 ? selectedCount : ''} selected
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Done
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
